/**
 * Implementación de Google Gemini API Directa (Nativa) para extracción OCR
 * Modelo: gemini-2.0-flash-lite → 30 RPM / 1500 RPD en plan gratuito
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface ExtractedData {
  text: string;
  metadata_extracted: {
    PN?: string;
    SN?: string;
    condicion?: string;
    document_type?: string;
  };
}

export async function extractOcrFromImage(base64Image: string, mimeType: string): Promise<ExtractedData> {
  if (!GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY en las variables de entorno');
  }

  // Normalizar mimeType
  const validMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  let safeMimeType = mimeType?.toLowerCase() || 'application/pdf';
  if (safeMimeType === 'image/jpg') safeMimeType = 'image/jpeg';
  if (!validMimeTypes.includes(safeMimeType)) safeMimeType = 'application/pdf';

  // Verificar tamaño (Gemini límite ~20MB en inline_data)
  const sizeInMB = (base64Image.length * 3) / 4 / 1024 / 1024;
  if (sizeInMB > 18) {
    console.warn(`[OCR] Archivo demasiado grande (${sizeInMB.toFixed(1)}MB), saltando...`);
    return {
      text: '[Archivo demasiado grande para procesar]',
      metadata_extracted: { document_type: 'Otro' }
    };
  }

  const prompt = `Analiza este documento aeronáutico detalladamente.
Extrae el Part Number (PN) y Serial Number (SN) principal.
Extrae TODO el contenido del documento, especialmente las tablas, en formato Markdown para que sea buscable.

Responde en JSON:
{
  "metadata_extracted": {
    "PN": "Part Number o null",
    "SN": "Serial Number o null",
    "condicion": "New, Overhauled, Repaired, Serviceable, o null",
    "document_type": "Form One, Logbook, AD, u Otro"
  },
  "text": "Contenido completo del documento en Markdown incluyendo tablas"
}

Responde SOLO el JSON.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: safeMimeType, data: base64Image } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          }
        }),
      });

      if (response.status === 429) {
        const errorData = await response.json();
        const retryDelay = errorData?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay;
        const waitSeconds = retryDelay ? parseInt(retryDelay) + 2 : 30;
        console.warn(`[OCR] Rate limit (429), reintentando en ${waitSeconds}s...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }

      if (response.status === 400) {
        return {
          text: '[Archivo no procesable por la API]',
          metadata_extracted: { document_type: 'Otro' }
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en Gemini API: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
          text: '[Sin contenido extraíble]',
          metadata_extracted: { document_type: 'Otro' }
        };
      }

      const rawContent = data.candidates[0].content.parts[0].text.trim();
      return parseGeminiResponse(rawContent);

    } catch (error: any) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  throw new Error('Se agotaron los reintentos');
}

function parseGeminiResponse(rawContent: string): ExtractedData {
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawContent;
    return JSON.parse(jsonString) as ExtractedData;
  } catch (e) {
    // Reparar JSON truncado
    let repaired = rawContent;
    if (!repaired.endsWith('}')) {
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      const openBraces = (repaired.match(/{/g) || []).length;
      const closeBraces = (repaired.match(/}/g) || []).length;
      for (let i = 0; i < (openBraces - closeBraces); i++) repaired += '}';
    }

    try {
      return JSON.parse(repaired) as ExtractedData;
    } catch {
      // Extraer con regex como último recurso
      const pnMatch = rawContent.match(/"PN"\s*:\s*"([^"]+)"/);
      const snMatch = rawContent.match(/"SN"\s*:\s*"([^"]+)"/);
      const typeMatch = rawContent.match(/"document_type"\s*:\s*"([^"]+)"/);
      return {
        text: rawContent.slice(0, 300),
        metadata_extracted: {
          PN: pnMatch?.[1] || undefined,
          SN: snMatch?.[1] || undefined,
          document_type: typeMatch?.[1] || 'Otro'
        }
      };
    }
  }
}
