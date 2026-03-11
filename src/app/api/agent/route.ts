import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createEmbedding } from '@/lib/ai/embeddings';
import { copyAndRenameAtomic } from '@/lib/drive/client';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ reply: "No recibí ningún mensaje." }, { status: 400 });
    }

    // Agentic Loop Simplication
    // Idealmente, aquí se pasaría el mensaje a un LLM via OpenRouter para evaluar INTENTOS:
    // INTENTS: "SEARCH", "COPY", "SUMMARIZE".
    
    // Simulemos la extracción de entidades de la consulta:
    // Si la consulta contiene PN y una palabra copiar, ejecutamos la búsqueda y la acción Copia Atómica
    
    // Regex básico para encontrar un PN o SN como demo del agente
    const pnMatch = message.match(/PN\s*([a-zA-Z0-9-]+)/i);
    const snMatch = message.match(/SN\s*([a-zA-Z0-9-]+)/i);
    const intentCopy = message.toLowerCase().includes("copia") || message.toLowerCase().includes("renombra");
    const folderMatch = message.match(/(?:carpeta|folder)\s*([a-zA-Z0-9_-]+)/i);

    const supabase = getSupabaseServer();
    const filter_pn = pnMatch ? pnMatch[1] : null;
    const filter_sn = snMatch ? snMatch[1] : null;

    let searchContentContext = message;

    // Vectorizar la pregunta para buscar semánticamente "estado de mantenimiento" 
    const queryEmbedding = await createEmbedding(searchContentContext);

    // Call Supabase RPC for Hybrid Search
    const { data, error } = await supabase.rpc('match_document_chunks_v1', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: 0.5,
      match_count: 5,
      filter_pn,
      filter_sn
    });
    
    const results = data as any[];

    if (error) {
      console.error(error);
      throw error;
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ reply: "No pude encontrar documentos que coincidan con esa descripción o Part Number en el repositorio indexado." });
    }

    // Responder base de resultados
    let replyText = `Encontré los siguientes documentos relevantes:\n`;
    for (const r of results) {
       replyText += `- **${r.document_name}** (Match: ${(r.similarity * 100).toFixed(1)}%)\n`;
    }

    if (intentCopy && folderMatch) {
       const destFolderId = folderMatch[1];
       replyText += `\nEntendido. Iniciando la copia atómica de estos archivos hacia la carpeta: ${destFolderId}\n`;
       
       let errorsList = [];
       for (const r of results) {
           try {
              const newName = `${filter_pn || 'UNK'}_${filter_sn || 'UNK'}_${r.document_name}`;
              await copyAndRenameAtomic(r.drive_file_id, destFolderId, newName);
              replyText += `✅ Copiado y renombrado como: ${newName}\n`;
           } catch (e: any) {
              errorsList.push(`Error copiando ${r.document_name}: ${e.message}`);
           }
       }
       
       if (errorsList.length > 0) {
          replyText += `\n⚠️ Advertencia: Algunos archivos no pudieron copiarse. Operaciones fallidas han sido descartadas (Los '.tmp' no consolidados son ignorados por el sistema).\n` + errorsList.join('\n');
       }
    } else if (intentCopy && !folderMatch) {
       replyText += `\nMe pediste copiar archivos pero no detecté un ID de carpeta de destino. Por favor especifica "(Carpeta [FolderID])".`;
    }

    return NextResponse.json({ reply: replyText });
    
  } catch (error: any) {
    console.error('Agent route error:', error);
    return NextResponse.json({ reply: `Ocurrió un error en el núcleo del agente: ${error.message}` }, { status: 500 });
  }
}
