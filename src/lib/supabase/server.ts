import { createClient } from '@supabase/supabase-js';

// Cliente para servidor (API Routes) con Service Role para bypass de RLS y uso de Edge Functions seguras
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabaseServer() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase Environment Variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
