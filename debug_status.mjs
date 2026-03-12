import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, name, status, created_at, drive_file_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent Documents:');
  for (const doc of docs) {
    const { count } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    
    console.log(`- ${doc.name} (Status: ${doc.status}, Chunks: ${count}, ID: ${doc.id})`);
  }
}

check();
