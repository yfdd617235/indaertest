import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, status')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('Recent documents:');
  docs?.forEach(d => console.log(`- ${d.name}: ${d.status}`));
}

checkStatus();
