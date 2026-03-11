import { createClient } from '@supabase/supabase-js';

// Cliente para componentes de Cliente (Browser)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseKey);
