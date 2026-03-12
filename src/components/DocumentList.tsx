"use client";

import { useState, useEffect } from "react";
import { FileText, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

interface Document {
  id: string;
  name: string;
  drive_file_id: string;
  status: 'processing' | 'complete' | 'error';
  created_at: string;
}

export default function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // Refresh list every 30 seconds if there are items processing
    const interval = setInterval(() => {
      setDocuments(prev => {
         const hasProcessing = prev.some(d => d.status === 'processing');
         if (hasProcessing) fetchDocuments();
         return prev;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleExport = async (driveFileId: string, fileName: string) => {
    setDownloadingId(driveFileId);
    try {
      const res = await fetch("/api/extract-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, fileName }),
      });

      if (res.status === 429) {
        const data = await res.json();
        const waitTime = data.retryAfter || 35;
        alert(`Límites de cuota alcanzados. Google nos pide esperar ${waitTime} segundos. Por favor, no cierres esta ventana y reintenta en un momento.`);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error generando Excel');
      }

      const blob = await res.blob();
      const excelBlob = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(excelBlob);
      
      console.log(`[Download] Triggering download for ${fileName}...`);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^.]+$/, '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      
      // Delay removal to ensure browser handles the click
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error: any) {
      console.error("Export Error:", error);
      alert(`Error exportando Excel: ${error.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRetry = async (doc: Document) => {
    try {
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'processing' } : d));
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          driveFileId: doc.drive_file_id, 
          fileName: doc.name,
          mimeType: "application/pdf" // Assuming PDF as default if not specified
        }),
      });
      if (!res.ok) throw new Error("Fallo al reintentar la ingesta");
      fetchDocuments();
    } catch (err: any) {
      alert(`Error al reintentar: ${err.message}`);
      fetchDocuments();
    }
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm flex flex-col h-[400px]">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">Archivos Indexados</h2>
        </div>
        <button 
          onClick={fetchDocuments}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          title="Actualizar lista"
        >
          <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && documents.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <FileText className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">No hay archivos indexados aún. Usa el Crawler para empezar.</p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  doc.status === 'complete' ? 'bg-emerald-50' : 
                  doc.status === 'error' ? 'bg-red-50' : 'bg-blue-50'
                }`}>
                  {doc.status === 'complete' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                   doc.status === 'error' ? <AlertCircle className="w-5 h-5 text-red-600" /> :
                   <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-slate-900 truncate" title={doc.name}>
                    {doc.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                      doc.status === 'complete' ? 'bg-emerald-100 text-emerald-700' :
                      doc.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {doc.status === 'complete' ? 'Listo' : doc.status === 'error' ? 'Error' : 'Leyendo'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {doc.status === 'error' && (
                    <button
                      onClick={() => handleRetry(doc)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                      title="Reintentar lectura"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleExport(doc.drive_file_id, doc.name)}
                    disabled={downloadingId === doc.drive_file_id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      downloadingId === doc.drive_file_id
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    }`}
                  >
                    {downloadingId === doc.drive_file_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    Excel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
