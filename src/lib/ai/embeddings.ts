/**
 * Implementación de Google Gemini Embeddings (Nativo)
 * Usamos text-embedding-004 para generar vectores de 768 dimensiones.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function createEmbedding(text: string): Promise<number[]> {
  const result = await createBatchEmbeddings([text]);
  return result[0];
}

/**
 * Genera embeddings en lote (batch) para múltiples textos.
 * Gemini soporta hasta 100 textos por petición.
 */
export async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY for embeddings");
  }

  if (texts.length === 0) return [];

  // Endpoint de Google AI para batch embeddings
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GEMINI_API_KEY}`;

  try {
    // Dividir en grupos de 100 (límite de la API)
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      // Delay conservador para no exceder los 30 RPM (1 req cada 2s es seguro)
      if (i > 0) await new Promise(r => setTimeout(r, 3000));

      const chunk = texts.slice(i, i + BATCH_SIZE);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: chunk.map(text => ({
            model: "models/text-embedding-004",
            content: { parts: [{ text: text.slice(0, 10000) }] }
          }))
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini Embedding Error: ${error}`);
      }

      const data = await response.json();
      const batchResult = data.embeddings.map((e: any) => e.values);
      allEmbeddings.push(...batchResult);
    }

    return allEmbeddings;
  } catch (error: any) {
    console.error('[Embeddings] Batch Error:', error);
    throw error; // No devolver ceros, mejor fallar y reintentar
  }
}
