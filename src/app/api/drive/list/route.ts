import { NextResponse } from 'next/server';
import { listFilesInFolder } from '@/lib/drive/client';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json({ error: 'Falta folderId' }, { status: 400 });
    }

    const files = await listFilesInFolder(folderId);
    
    // Filtrar solo archivos procesables (PDFs y algunas imágenes comunes)
    const procesables = files.filter(f => 
      f.mimeType === 'application/pdf' || 
      f.mimeType.startsWith('image/')
    );

    return NextResponse.json({ files: procesables, total: procesables.length });
  } catch (error: any) {
    console.error('List Drive error:', error);
    return NextResponse.json({ error: error.message || 'Error listing folder' }, { status: 500 });
  }
}
