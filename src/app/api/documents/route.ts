import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, drive_file_id, status, created_at, tags, metadata')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ documents: data });
  } catch (error: any) {
    console.error('[API Documents] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
