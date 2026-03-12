import { google, drive_v3 } from 'googleapis';

/**
 * Initializes and returns a Google Drive API client using Service Account credentials.
 */
export function getDriveClient(): drive_v3.Drive {
  const credentialsJson = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;
  if (!credentialsJson || credentialsJson === '{}') {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS_JSON variable not set or invalid.');
  }

  let credentials = JSON.parse(credentialsJson);

  // Fix escaped newlines in the private key from the .env reading process
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

/**
 * Recurses or lists files in a folder. 
 * For simplicity in the chunked orchestrator, this just gets a flat list or single level.
 */
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  let allProcessedFiles: DriveFile[] = [];
  
  // FIFO Queue para búsqueda Breadth-First-Search en subcarpetas
  const foldersToProcess: string[] = [folderId];

  while (foldersToProcess.length > 0) {
    const currentFolderId = foldersToProcess.shift()!;
    let pageToken: string | undefined = undefined;

    do {
      const res: any = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, parents)',
        pageToken: pageToken,
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      
      if (res.data.files) {
        const batch = res.data.files as DriveFile[];
        for (const file of batch) {
          // Si es un directorio, lo agregamos a la cola para buscar adentro
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            foldersToProcess.push(file.id);
          } else {
            // Si es un archivo normal, lo guardamos
            allProcessedFiles.push(file);
          }
        }
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  return allProcessedFiles;
}

/**
 * Atomic Copy & Rename:
 * 1. Copies the file to destination folder with a `.tmp` suffix.
 * 2. Renames the `.tmp` file to the final name via a PATCH request.
 */
export async function copyAndRenameAtomic(
  originalFileId: string,
  destinationFolderId: string,
  finalName: string
): Promise<string> {
  const drive = getDriveClient();
  const tempName = `${finalName}.tmp`;

  // Step 1: Staging - Copy file with temp name
  const copyRes = await drive.files.copy({
    fileId: originalFileId,
    requestBody: {
      name: tempName,
      parents: [destinationFolderId],
    },
    fields: 'id, name',
  });

  const newFileId = copyRes.data.id;
  if (!newFileId) {
    throw new Error('Failed to create copy of file');
  }

  // Step 2: Commit - Rename to final name
  try {
    const updateRes = await drive.files.update({
      fileId: newFileId,
      requestBody: {
        name: finalName,
      },
      fields: 'id, name',
    });
    
    return updateRes.data.id!;
  } catch (error) {
    // Si falla el rename, podríamos intentar borrar el .tmp para no dejar basura.
    // Opcional: await drive.files.delete({ fileId: newFileId });
    throw error;
  }
}

/**
 * Download a file content to an ArrayBuffer (useful for OCR with Vision LLM)
 */
export async function downloadDriveFile(fileId: string): Promise<ArrayBuffer> {
  const drive = getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return response.data as ArrayBuffer;
}
