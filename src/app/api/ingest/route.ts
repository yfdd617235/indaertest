import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { downloadDriveFile } from '@/lib/drive/client';
import { extractOcrFromImage } from '@/lib/ai/ocr';
import { chunkAeronauticalDocument } from '@/lib/ai/chunking';
import { createBatchEmbeddings } from '@/lib/ai/embeddings';
import fs from 'fs';
import path from 'path';

function logDebug(msg: string) {
  const logPath = path.join(process.cwd(), 'ingest_debug.log');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

export async function POST(req: Request) {
  let docDriveId = '';
  try {
    const { driveFileId, fileName, mimeType, parents } = await req.json();
    docDriveId = driveFileId;

    if (!driveFileId || !fileName) {
      return NextResponse.json({ error: 'Missing file details' }, { status: 400 });
    }

    logDebug(`[Ingest] START ${fileName} (${driveFileId})`);
    const supabase = getSupabaseServer();

    // 1. Initial Insert or check if exists
    logDebug(`[Ingest] Step 1: Checking Supabase...`);
    const { data: existing, error: findError } = await supabase
      .from('documents')
      .select('id, status')
      .eq('drive_file_id', driveFileId);
      // Removed .single() to be safer

    if (findError) logDebug(`[Ingest] Supabase find error (non-critical): ${findError.message}`);

    const existingDoc = (existing && existing.length > 0) ? existing[0] : null;

    if (existingDoc && existingDoc.status === 'complete') {
      logDebug(`[Ingest] Already processed: ${fileName}`);
      return NextResponse.json({ message: 'Already processed', documentId: existingDoc.id });
    }

    let documentId = existingDoc?.id;

    if (!documentId) {
      logDebug(`[Ingest] Creating new document record...`);
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

      if (insertError) throw new Error(`Supabase Insert Error: ${insertError.message}`);
      documentId = newDoc.id;
    } else {
      logDebug(`[Ingest] Resetting status to processing...`);
      await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);
    }

    // 2. Download from Drive
    logDebug(`[Ingest] Step 2: Downloading from Google Drive...`);
    const fileBuffer = await downloadDriveFile(driveFileId);
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new Error("Downloaded empty file");
    }
    logDebug(`[Ingest] Downloaded ${fileBuffer.byteLength} bytes.`);

    // Convert to base64
    const base64Data = Buffer.from(fileBuffer).toString('base64');
    
    // 3. OCR and Metadata Extraction
    logDebug(`[Ingest] Step 3: IA OCR Analysis...`);
    const extractionResult = await extractOcrFromImage(base64Data, mimeType);
    logDebug(`[Ingest] IA completed. Type: ${extractionResult.metadata_extracted.document_type}`);

    // 4. Update Document Metadata
    logDebug(`[Ingest] Step 4: Updating metadata in Supabase...`);
    const tags = [extractionResult.metadata_extracted.document_type].filter(Boolean);
    const { error: updateMetaError } = await supabase
      .from('documents')
      .update({
        tags: tags,
        metadata: extractionResult.metadata_extracted,
      })
      .eq('id', documentId);
    
    if (updateMetaError) throw new Error(`Metadata Update Error: ${updateMetaError.message}`);

    // 5. Chunking & Embedding
    logDebug(`[Ingest] Step 5: Chunking...`);
    const chunks = chunkAeronauticalDocument(extractionResult.text, extractionResult.metadata_extracted);
    
    if (chunks.length === 0) {
      logDebug(`[Ingest] No chunks generated.`);
    } else {
      logDebug(`[Ingest] Generating embeddings for ${chunks.length} chunks...`);
      const contents = chunks.map(c => c.content);
      const embeddings = await createBatchEmbeddings(contents);
      
      const chunksToInsert = chunks.map((chunk, i) => ({
        document_id: documentId,
        content: chunk.content,
        context: chunk.context,
        embedding: `[${embeddings[i].join(',')}]`,
      }));

      logDebug(`[Ingest] Saving chunks to Supabase...`);
      await supabase.from('document_chunks').delete().eq('document_id', documentId);
      const { error: chunkErr } = await supabase.from('document_chunks').insert(chunksToInsert);
      
      if (chunkErr) throw new Error(`Chunk Insert Error: ${chunkErr.message}`);
    }

    // 6. Mark Complete
    logDebug(`[Ingest] Step 6: Marking as complete.`);
    await supabase
      .from('documents')
      .update({ status: 'complete' })
      .eq('id', documentId);

    logDebug(`[Ingest] ✅ SUCCESS! ${fileName}`);
    return NextResponse.json({ success: true, documentId });

  } catch (error: any) {
    logDebug(`[Ingest] FATAL ERROR: ${error.message}`);
    
    if (docDriveId) {
      try {
        const supabase = (await import('@/lib/supabase/server')).getSupabaseServer();
        await supabase.from('documents').update({ status: 'error' }).eq('drive_file_id', docDriveId);
      } catch (dbErr) {}
    }

    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
