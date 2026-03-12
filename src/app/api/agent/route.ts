import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createEmbedding } from '@/lib/ai/embeddings';
import { copyAndRenameAtomic } from '@/lib/drive/client';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Usa Gemini para generar una respuesta inteligente basada en los documentos encontrados
 */
async function askGemini(userMessage: string, documentsContext: string): Promise<string> {
  if (!GEMINI_API_KEY) return documentsContext; // Fallback sin IA

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Eres un asistente de trazabilidad aeronáutica. 
El usuario preguntó: "${userMessage}"

Estos son los documentos encontrados en la base de datos:
${documentsContext}

Responde de forma concisa y útil en español. Si el usuario pregunta por un archivo específico, muestra su información. Si no se encontraron resultados relevantes, dilo claramente.` }]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
      }),
    });

    if (!response.ok) return documentsContext;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || documentsContext;
  } catch {
    return documentsContext;
  }
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ reply: "No recibí ningún mensaje." }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // Extraer entidades de la consulta
    const pnMatch = message.match(/PN\s*([a-zA-Z0-9-:]+)/i);
    const snMatch = message.match(/SN\s*([a-zA-Z0-9-]+)/i);
    const intentCopy = message.toLowerCase().includes("copia") || message.toLowerCase().includes("renombra");
    const folderMatch = message.match(/(?:carpeta|folder)\s*([a-zA-Z0-9_-]+)/i);
    
    const filter_pn = pnMatch ? pnMatch[1] : null;
    const filter_sn = snMatch ? snMatch[1] : null;

    // ============================================
    // SUPERPODER: Exportar tabla a Excel
    // ============================================
    const intentExcel = /excel|exportar?\s*tabla|generar?\s*tabla|tabla\s*excel|ldnd|status.*excel|excel.*status/i.test(message);
    const fileNameMatch = message.match(/([a-zA-Z0-9_\s()-]+\.(?:pdf|jpg|jpeg|png|gif))/i);

    if (intentExcel && fileNameMatch) {
      const searchName = fileNameMatch[1].trim();
      
      // Buscar el archivo en la DB
      const { data: docs } = await supabase
        .from('documents')
        .select('id, name, drive_file_id, metadata')
        .ilike('name', `%${searchName}%`)
        .limit(1);

      if (docs && docs.length > 0) {
        return NextResponse.json({
          reply: `📊 ¡Encontré el archivo **${docs[0].name}**! Estoy generando el Excel ahora...`,
          action: 'EXPORT_EXCEL',
          driveFileId: docs[0].drive_file_id,
          fileName: docs[0].name,
        });
      }

      // Si no está en la DB, buscar directo en el mensaje algo que parezca un drive ID
      return NextResponse.json({
        reply: `No encontré el archivo "${searchName}" en la base de datos indexada. Asegúrate de que haya sido procesado durante la ingesta. Si tienes el Drive ID del archivo, puedes escribir: "exportar excel drive ID_DEL_ARCHIVO"`,
      });
    }

    // Detectar intent de excel con Drive ID directo
    if (intentExcel) {
      const driveIdMatch = message.match(/(?:drive|id)\s+([a-zA-Z0-9_-]{20,})/i);
      if (driveIdMatch) {
        return NextResponse.json({
          reply: `📊 Generando Excel desde Drive ID: ${driveIdMatch[1]}...`,
          action: 'EXPORT_EXCEL',
          driveFileId: driveIdMatch[1],
          fileName: 'export',
        });
      }
    }
    // ESTRATEGIA 1: Búsqueda por nombre de archivo
    // ============================================
    // Si el usuario menciona un nombre de archivo, buscar directamente en la tabla documents
    const fileNameSearchMatch = message.match(/([a-zA-Z0-9_-]+\.(?:pdf|jpg|jpeg|png|gif))/i);
    
    if (fileNameSearchMatch) {
      const searchName = fileNameSearchMatch[1];
      const { data: docs, error: docErr } = await supabase
        .from('documents')
        .select('id, name, drive_file_id, metadata, tags, status')
        .ilike('name', `%${searchName}%`)
        .limit(5);

      if (!docErr && docs && docs.length > 0) {
        let contextText = '';
        for (const doc of docs) {
          const meta = doc.metadata || {};
          contextText += `📄 **${doc.name}** (Estado: ${doc.status})\n`;
          if (meta.PN) contextText += `   - Part Number: ${meta.PN}\n`;
          if (meta.SN) contextText += `   - Serial Number: ${meta.SN}\n`;
          if (meta.condicion) contextText += `   - Condición: ${meta.condicion}\n`;
          if (meta.document_type) contextText += `   - Tipo: ${meta.document_type}\n`;
          contextText += '\n';
        }

        // Obtener también los chunks de texto para dar más contexto
        const { data: chunks } = await supabase
          .from('document_chunks')
          .select('content')
          .eq('document_id', docs[0].id)
          .limit(3);
        
        if (chunks && chunks.length > 0) {
          contextText += `\n**Contenido extraído:**\n`;
          for (const chunk of chunks) {
            contextText += chunk.content.slice(0, 300) + '\n';
          }
        }

        const aiReply = await askGemini(message, contextText);
        return NextResponse.json({ reply: aiReply });
      }
    }

    // ============================================
    // ESTRATEGIA 2: Búsqueda por PN/SN en metadata
    // ============================================
    if (filter_pn || filter_sn) {
      let query = supabase.from('documents').select('id, name, drive_file_id, metadata, tags, status');
      
      if (filter_pn) {
        query = query.ilike('metadata->>PN', `%${filter_pn}%`);
      }
      if (filter_sn) {
        query = query.ilike('metadata->>SN', `%${filter_sn}%`);
      }

      const { data: docs, error: docErr } = await query.limit(10);

      if (!docErr && docs && docs.length > 0) {
        let contextText = `Encontré ${docs.length} documento(s) con `;
        if (filter_pn) contextText += `PN: ${filter_pn} `;
        if (filter_sn) contextText += `SN: ${filter_sn}`;
        contextText += ':\n\n';

        for (const doc of docs) {
          const meta = doc.metadata || {};
          contextText += `📄 **${doc.name}**\n`;
          if (meta.PN) contextText += `   - PN: ${meta.PN}\n`;
          if (meta.SN) contextText += `   - SN: ${meta.SN}\n`;
          if (meta.condicion) contextText += `   - Condición: ${meta.condicion}\n`;
          if (meta.document_type) contextText += `   - Tipo: ${meta.document_type}\n`;
          contextText += '\n';
        }

        // Acción de copia si se solicita
        if (intentCopy && folderMatch) {
          const destFolderId = folderMatch[1];
          contextText += `\nIniciando copia de archivos a carpeta: ${destFolderId}\n`;
          for (const doc of docs) {
            try {
              const newName = `${filter_pn || 'UNK'}_${filter_sn || 'UNK'}_${doc.name}`;
              await copyAndRenameAtomic(doc.drive_file_id, destFolderId, newName);
              contextText += `✅ Copiado: ${newName}\n`;
            } catch (e: any) {
              contextText += `❌ Error copiando ${doc.name}: ${e.message}\n`;
            }
          }
        } else if (intentCopy && !folderMatch) {
          contextText += `\nMe pediste copiar archivos pero no detecté un ID de carpeta destino. Especifica "carpeta [ID]".`;
        }

        const aiReply = await askGemini(message, contextText);
        return NextResponse.json({ reply: aiReply });
      }
    }

    // ============================================
    // ESTRATEGIA 3: Búsqueda semántica (vector)
    // ============================================
    try {
      const queryEmbedding = await createEmbedding(message);
      
      // Verificar que el embedding no sea todo ceros
      const isZeroVector = queryEmbedding.every(v => v === 0);
      
      if (!isZeroVector) {
        const { data, error } = await supabase.rpc('match_document_chunks_v1', {
          query_embedding: `[${queryEmbedding.join(',')}]`,
          match_threshold: 0.3,
          match_count: 5,
          filter_pn: null,
          filter_sn: null
        });

        if (!error && data && data.length > 0) {
          // Deduplicar por nombre de documento
          const seen = new Set<string>();
          const uniqueResults = data.filter((r: any) => {
            if (seen.has(r.document_name)) return false;
            seen.add(r.document_name);
            return true;
          });

          let contextText = '';
          for (const r of uniqueResults) {
            const sim = r.similarity;
            const simDisplay = (sim && !isNaN(sim)) ? `${(sim * 100).toFixed(1)}%` : 'N/A';
            contextText += `📄 **${r.document_name}** (Relevancia: ${simDisplay})\n`;
            contextText += `   Contenido: ${r.content?.slice(0, 200) || 'Sin texto'}\n\n`;
          }

          const aiReply = await askGemini(message, contextText);
          return NextResponse.json({ reply: aiReply });
        }
      }
    } catch (embErr: any) {
      console.warn('[Agent] Vector search failed, falling back to text search:', embErr.message);
    }

    // ============================================
    // ESTRATEGIA 4: Búsqueda de texto libre en documentos
    // ============================================
    const searchTerms = message.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3);
    if (searchTerms.length > 0) {
      const { data: textDocs } = await supabase
        .from('documents')
        .select('id, name, drive_file_id, metadata, status')
        .or(searchTerms.map((t: string) => `name.ilike.%${t}%`).join(','))
        .limit(5);

      if (textDocs && textDocs.length > 0) {
        let contextText = '';
        for (const doc of textDocs) {
          const meta = doc.metadata || {};
          contextText += `📄 **${doc.name}** (Estado: ${doc.status})\n`;
          if (meta.PN) contextText += `   - PN: ${meta.PN}\n`;
          if (meta.SN) contextText += `   - SN: ${meta.SN}\n`;
          if (meta.document_type) contextText += `   - Tipo: ${meta.document_type}\n`;
          contextText += '\n';
        }

        const aiReply = await askGemini(message, contextText);
        return NextResponse.json({ reply: aiReply });
      }
    }

    // Si nada funcionó
    const aiReply = await askGemini(message, 'No se encontraron documentos que coincidan con la consulta en la base de datos indexada.');
    return NextResponse.json({ reply: aiReply });

  } catch (error: any) {
    console.error('Agent route error:', error);
    return NextResponse.json({ reply: `Ocurrió un error: ${error.message}` }, { status: 500 });
  }
}
