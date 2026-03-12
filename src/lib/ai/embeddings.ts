/**
 * Implementación de Google Gemini Embeddings (Nativo)
 * Usamos text-embedding-004 para generar vectores de 768 dimensiones.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function createEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY for embeddings");
  }

  // Endpoint de Google AI para embeddings
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini Embedding Error: ${error}`);
    }

    const data = await response.json();
    return data.embedding.values; // Retorna un array de números (768 dimensiones por defecto)
  } catch (error) {
    console.error('[Embeddings] Error:', error);
    // Fallback: Si falla el API, devolvemos un vector de ceros del tamaño esperado (768)
    // para evitar que la base de datos explote, pero lo ideal es que no falle.
    return Array.from({ length: 768 }, () => 0);
  }
}
