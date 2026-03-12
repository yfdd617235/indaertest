import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await supabase
    .from('documents')
    .select('id, name, status, updated_at')
    .eq('name', '512187639.pdf')
    .single();

  const { count } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', doc.id);

  console.log(`Doc: ${doc.name}, Status: ${doc.status}, Updated: ${doc.updated_at}, Chunks: ${count}`);
}

check();
