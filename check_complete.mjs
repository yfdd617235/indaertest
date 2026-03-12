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
    .select('name, status')
    .eq('status', 'complete');

  console.log(`Complete docs: ${data?.length || 0}`);
  data.forEach(d => console.log(`- ${d.name}`));
}

checkDocs();
