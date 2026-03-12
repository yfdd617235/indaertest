import { Buffer } from 'buffer';
import { NextResponse } from 'next/server';
import { downloadDriveFile } from '@/lib/drive/client';
import * as XLSX from 'xlsx';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const runtime = 'nodejs';

/**
 * API que descarga un documento de Drive, lo envía a Gemini para que
 * interprete la tabla, y devuelve un archivo Excel descargable.
 */
export async function POST(req: Request) {
  try {
    const { driveFileId, fileName } = await req.json();

    console.log(`[Excel Export] Iniciando para: ${fileName || driveFileId}`);
    
    if (!driveFileId) return NextResponse.json({ error: 'Falta driveFileId' }, { status: 400 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'Falta API Key' }, { status: 500 });

    // 1. Descargar el archivo de Google Drive
    const fileBuffer = await downloadDriveFile(driveFileId);
    if (!fileBuffer || fileBuffer.byteLength === 0) {
       throw new Error("No se pudo descargar el archivo de Drive");
    }
    const base64Data = Buffer.from(fileBuffer).toString('base64');

    // 2. Enviar a Gemini con reintentos para 429
    const prompt = `Extrae las tablas de este documento aeronautico en JSON:
{
  "table_name": "Nombre",
  "headers": ["Col1", "Col2", ...],
  "rows": [ ["V1", "V2", ...], ... ]
}
Responde SOLO JSON. Extrae TODAS las filas. Asegúrate de que el JSON esté completo.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    let rawContent = "";
    const MAX_RETRIES = 5;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[Excel Export] Enviando a Gemini (Intento ${attempt}/${MAX_RETRIES})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'application/pdf', data: base64Data } }
            ]
          }],
          generationConfig: { 
            temperature: 0.1, 
            maxOutputTokens: 8192, 
            responseMimeType: "application/json" 
          }
        }),
      });

      if (response.status === 429) {
        const errorData = await response.json();
        const retryDetail = errorData?.error?.details?.find((d: any) => d.retryDelay);
        const retryDelayStr = retryDetail?.retryDelay || "30s";
        const waitSeconds = parseInt(retryDelayStr) || 30;
        
        if (attempt === MAX_RETRIES) {
          return NextResponse.json({ 
            error: 'Quota exceeded', 
            retryAfter: waitSeconds,
            message: `Límite de Google alcanzado. Por favor espera ${waitSeconds} segundos.`
          }, { status: 429 });
        }

        console.warn(`[Excel Export] Rate limit (429). Esperando ${waitSeconds + 2}s...`);
        await new Promise(r => setTimeout(r, (waitSeconds + 2) * 1000));
        continue;
      }

      if (!response.ok) {
        const err = await response.text();
        console.error(`[Excel Export] Error en API: ${response.status}`, err);
        throw new Error(`Gemini API Error: ${response.status} - ${err.slice(0, 100)}`);
      }

      const data = await response.json();
      rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawContent && data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("El contenido fue bloqueado por filtros de seguridad de la IA.");
      }

      if (rawContent) break;
    }

    if (!rawContent) throw new Error("La IA no devolvió datos legibles tras reintentos (posible saturación de cuota)");

    // 3. Parsear y generar Excel (Robusto)
    let tableData: any;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : rawContent;
      tableData = JSON.parse(jsonString);
    } catch (e) {
      console.warn("[Excel Export] JSON simple falló, intentando reparar...");
      let repaired = rawContent.trim();
      if (!repaired.endsWith('}')) {
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        for (let i = 0; i < (openBraces - closeBraces); i++) repaired += '}';
      }
      try {
        tableData = JSON.parse(repaired);
      } catch (e2) {
        throw new Error("No se pudo parsear el JSON de la tabla. El documento puede ser demasiado grande o complejo.");
      }
    }

    if (!tableData || !tableData.rows || !Array.isArray(tableData.rows)) {
      throw new Error("El documento no contiene una estructura de tabla reconocible.");
    }

    const headers = tableData.headers || [];
    const wsData = [headers, ...tableData.rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');

    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const safeName = (fileName || 'export').replace(/\.[^.]+$/, '');
    
    console.log(`[Excel Export] ✅ ÉXITO: ${tableData.rows.length} filas.`);

    return new Response(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
        'X-Table-Name': encodeURIComponent(tableData.table_name || 'Export'),
        'X-Row-Count': String(tableData.rows.length),
        'X-Col-Count': String(headers.length),
        'Access-Control-Expose-Headers': 'X-Table-Name, X-Row-Count, X-Col-Count'
      },
    });

  } catch (error: any) {
    console.error('[Excel Export] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
