import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function getDoc() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('name', '512187639.pdf')
    .single();

  console.log(JSON.stringify(data, null, 2));
}

getDoc();
