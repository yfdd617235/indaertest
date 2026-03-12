/**
 * Lógica de particionado (Chunking) enfocado en documentos aeronáuticos y tablas.
 * Strategy: Row-Based Chunking
 */

export interface Chunk {
  content: string;
  context: any; // e.g. headings
}

/**
 * Función extra para identificar si un texto tiene estructura de tabla Markdown
 */
function isMarkdownTable(text: string): boolean {
  return text.includes('|') && text.includes('---');
}

/**
 * Parsea un documento completo, segmentando filas de tablas individuales e
 * inyectando cabeceras a cada "chunk" resultante. Las partes de texto normal
 * se dividen convencionalmente (ej. por párrafos o limitados a N caracteres).
 */
export function chunkAeronauticalDocument(markdownText: string, documentMetadata: any): Chunk[] {
  if (!markdownText) {
    return [{ content: '[Sin texto extraído]', context: { type: 'text', ...documentMetadata } }];
  }
  const lines = markdownText.split('\n');
  const chunks: Chunk[] = [];
  
  let inTable = false;
  let tableHeaders: string[] = [];
  let currentTextBuffer: string[] = [];

  const flushTextBuffer = () => {
    if (currentTextBuffer.length > 0) {
      const text = currentTextBuffer.join('\n').trim();
      if (text) {
        // En producción real, este texto podría ser dividido por tokens o caracteres
        // si es demasiado largo (ej. recursive character text splitter).
        chunks.push({
          content: text,
          context: { type: 'text', ...documentMetadata }
        });
      }
      currentTextBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detectar inicio o fila de tabla de markdown básica
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        // Posible header row
        inTable = true;
        flushTextBuffer();
        
        tableHeaders = line.split('|').map(h => h.trim()).filter(Boolean);
        
        // Verificar si la siguiente línea es el separador (ej. |---|---|)
        if (i + 1 < lines.length && lines[i + 1].includes('---')) {
          i++; // Skip the separator
        }
      } else {
        // Data row
        const rowCells = line.split('|').map(c => c.trim()).filter(Boolean);
        const rowData: Record<string, string> = {};
        
        for (let j = 0; j < Math.min(tableHeaders.length, rowCells.length); j++) {
            rowData[tableHeaders[j]] = rowCells[j];
        }
        
        // Crear un chunk explícito para esta fila
        const rowTextContext = Object.entries(rowData).map(([k, v]) => `${k}: ${v}`).join(' | ');
        chunks.push({
          content: rowTextContext,
          context: { type: 'table_row', headers: tableHeaders, ...documentMetadata }
        });
      }
    } else {
      if (inTable) {
        // Fin de tabla
        inTable = false;
        tableHeaders = [];
      }
      
      currentTextBuffer.push(line);
      // Chunking heurístico básico por saltos de línea dobles
      if (line === '') {
        flushTextBuffer();
      }
    }
  }

  flushTextBuffer();
  return chunks;
}
