/**
 * Implementación de OpenRouter para extracción OCR
 * Usaremos Gemini 1.5 Flash para tareas de OCR rápidas y estructuradas.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
  if (!OPENROUTER_API_KEY) {
    throw new Error('Falta OPENROUTER_API_KEY en las variables de entorno');
  }

  const prompt = `
Eres un asistente experto en aviación. Analiza la siguiente imagen/documento y extrae lo siguiente en formato JSON estricto:

{
  "text": "Todo el texto íntegro, manteniendo formato de tabla usando markdown si hay tablas",
  "metadata_extracted": {
    "PN": "Part Number (si existe)",
    "SN": "Serial Number (si existe)",
    "condicion": "Condición (New, Overhauled, Repaired, etc., si existe)",
    "document_type": "Clasifica en: Form One, Logbook, AD, u Otro"
  }
}
Responde estrictamente solo con el JSON sin caracteres Markdown envolventes (sin \`\`\`json).
  `;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-1.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en OpenRouter: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content;

  try {
    return JSON.parse(rawContent) as ExtractedData;
  } catch (e) {
    throw new Error('Error parseando JSON de OpenRouter: ' + rawContent);
  }
}
