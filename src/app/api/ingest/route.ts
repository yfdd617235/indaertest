import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { downloadDriveFile } from '@/lib/drive/client';
import { extractOcrFromImage } from '@/lib/ai/ocr';
import { chunkAeronauticalDocument } from '@/lib/ai/chunking';
import { createEmbedding } from '@/lib/ai/embeddings';

export async function POST(req: Request) {
  try {
    const { driveFileId, fileName, mimeType, parents } = await req.json();

    if (!driveFileId || !fileName) {
      return NextResponse.json({ error: 'Missing file details' }, { status: 400 });
    }

    console.log(`[Ingest] Inicia proceso para: ${fileName} (${driveFileId})`);
    const supabase = getSupabaseServer();

    // 1. Initial Insert or check if exists
    const { data: existing } = await supabase
      .from('documents')
      .select('id, status')
      .eq('drive_file_id', driveFileId)
      .single();

    if (existing && existing.status === 'complete') {
      return NextResponse.json({ message: 'Already processed', documentId: existing.id });
    }

    let documentId = existing?.id;

    if (!documentId) {
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert({
          drive_file_id: driveFileId,
          name: fileName,
          original_path: (Array.isArray(parents) && parents.length > 0) ? parents[0] : 'root',
          status: 'processing',
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      documentId = newDoc.id;
    }

    // 2. Download from Drive
    console.log(`[Ingest] Descargando desde Google Drive...`);
    const fileBuffer = await downloadDriveFile(driveFileId);
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new Error("Downloaded empty file");
    }

    // Convert to base64 for LLM Vision (assuming it's pdf/image, normally we'd check mimeType)
    const base64Data = Buffer.from(fileBuffer).toString('base64');
    
    // 3. OCR and Metadata Extraction
    console.log(`[Ingest] Analizando con IA (OpenRouter/Gemini)...`);
    const extractionResult = await extractOcrFromImage(base64Data, mimeType);
    console.log(`[Ingest] IA completada. Documento tipo: ${extractionResult.metadata_extracted.document_type}`);

    // 4. Update Document Metadata
    const tags = [extractionResult.metadata_extracted.document_type].filter(Boolean);
    await supabase
      .from('documents')
      .update({
        tags: tags,
        metadata: extractionResult.metadata_extracted,
      })
      .eq('id', documentId);

    // 5. Chunking & Embedding
    const chunks = chunkAeronauticalDocument(extractionResult.text, extractionResult.metadata_extracted);
    
    // Insert Chunks
    console.log(`[Ingest] Guardando ${chunks.length} fragmentos vectorizados en Supabase...`);
    for (const chunk of chunks) {
      const embeddingVector = await createEmbedding(chunk.content);
      const { error: chunkErr } = await supabase.from('document_chunks').insert({
        document_id: documentId,
        content: chunk.content,
        context: chunk.context,
        embedding: `[${embeddingVector.join(',')}]`, // pgvector format
      });
      if (chunkErr) console.error("[Ingest] Error guardando fragmento:", chunkErr.message);
    }

    // 6. Mark Complete
    await supabase
      .from('documents')
      .update({ status: 'complete' })
      .eq('id', documentId);

    console.log(`[Ingest] ✅ ¡ÉXITO! ${fileName} finalizado.`);
    return NextResponse.json({ success: true, documentId });

  } catch (error: any) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
