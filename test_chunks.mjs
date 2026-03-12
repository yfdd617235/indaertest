import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkChunks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, status')
    .order('created_at', { ascending: false })
    .limit(5);

  for (const doc of docs) {
    const { count, error } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    
    console.log(`- ${doc.name} (${doc.status}): ${count} chunks`);
  }
}

checkChunks();
