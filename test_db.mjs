import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkDocs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent documents:');
  data.forEach(doc => {
    console.log(`- ${doc.name} (ID: ${doc.id}, Status: ${doc.status})`);
    console.log(`  Metadata:`, JSON.stringify(doc.metadata));
  });
}

checkDocs();
