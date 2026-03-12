import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Cleaning up stuck/error documents...');
  
  // Delete all document chunks for docs that are NOT complete
  const { data: incompleteDocs } = await supabase
    .from('documents')
    .select('id')
    .not('status', 'eq', 'complete');
  
  const ids = incompleteDocs?.map(d => d.id) || [];
  
  if (ids.length > 0) {
    await supabase.from('document_chunks').delete().in('document_id', ids);
    console.log(`Cleared chunks for ${ids.length} documents.`);
  }

  // Set status to error for anything stuck in processing
  const { error } = await supabase
    .from('documents')
    .update({ status: 'error' })
    .eq('status', 'processing');

  if (error) console.error('Error updating status:', error);
  else console.log('All "processing" documents moved to "error" state.');
  
  console.log('Done. You can now use the "Retry" button or Crawler to re-process.');
}

cleanup();
