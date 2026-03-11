export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  // En producción usamos un endpoint de embeddings. OpenRouter no ofrece endpoint nativo de embeddings estándar en v1/embeddings,
  // pero podemos usar una API de embeddings compatible con OpenAI como Jina, Nomic, o Voyage si están configuradas.
  // Por simplicidad en este prototipo, simularemos el vector de 1536 dimensiones si no hay un servicio de openrouter.
  // Pero lo ideal es usar, por ejemplo, el cliente de OpenAI apuntando a un servicio Free Tier.

  // Simulamos un delay y retornamos un vector de 1536 ceros con pequeños valores aleatorios
  // Este es el contrato para Supabase pgvector(1536).
  
  // TO-DO: Reemplazar con llamada real a un API:
  /*
  const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  });
  const data = await response.json();
  return data.data[0].embedding;
  */

  return Array.from({ length: 1536 }, () => Math.random() * 0.01);
}
