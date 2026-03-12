"use client";

import { useState } from "react";
import { Play, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function CrawlerWidget() {
  const [folderId, setFolderId] = useState("");
  const [status, setStatus] = useState<"idle" | "fetching" | "processing" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const startCrawling = async () => {
    if (!folderId) return;
    setStatus("fetching");
    setLogs(["Iniciando escaneo de carpeta..."]);
    setProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch file list
      const res = await fetch(`/api/drive/list?folderId=${folderId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const files = data.files;
      
      if (!files || files.length === 0) {
        addLog("No se encontraron archivos procesables (PDF/Images).");
        setStatus("done");
        return;
      }

      const total = files.length;
      setProgress({ current: 0, total });
      setStatus("processing");
      addLog(`Se encontraron ${total} archivos. Iniciando Ingesta por lotes...`);

      // Procesar archivos UNO POR UNO con delay para respetar rate limits de Gemini
      // gemini-2.0-flash-lite: 30 RPM → procesamos 1 cada 3 segundos = 20 RPM (seguro)
      for (let i = 0; i < total; i++) {
        const file = files[i];
        try {
          addLog(`Procesando [${i + 1}/${total}]: ${file.name}`);
          
          const ingestRes = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driveFileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
              parents: file.parents
            }),
          });
          
          if (!ingestRes.ok) {
            const errData = await ingestRes.text();
            addLog(`⚠️ Error en ${file.name}: ${errData.slice(0, 150)}`);
          } else {
            addLog(`✅ ${file.name} completado.`);
          }
          
          setProgress((prev) => ({ ...prev, current: i + 1 }));
          
          // Esperar 10 segundos entre archivos para no exceder el rate limit de la API gratuita
          if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        } catch (fileErr: any) {
          addLog(`❌ Error procesando ${file.name}: ${fileErr.message}`);
          setProgress((prev) => ({ ...prev, current: i + 1 }));
        }
      }

      addLog("¡Ingesta completada satisfactoriamente!");
      setStatus("done");

    } catch (error: any) {
      addLog(`❌ Error Crítico: ${error.message}`);
      setStatus("error");
    }
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm p-6 max-w-2xl w-full">
      <h2 className="text-lg font-semibold mb-4">Módulo de Ingesta (Google Drive)</h2>
      
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="ID de la carpeta (Ej. 1AbC2dE...)"
          className="flex-1 border-2 border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 rounded-md px-4 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition-colors"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          disabled={status === "fetching" || status === "processing"}
        />
        <button
          onClick={startCrawling}
          disabled={!folderId || status === "fetching" || status === "processing"}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
        >
          {status === "fetching" || status === "processing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {status === "fetching" ? "Buscando..." : status === "processing" ? "Indexando..." : "Iniciar"}
        </button>
      </div>

      {/* Progress Bar Area */}
      {status !== "idle" && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm text-slate-600 font-medium">
            <span>Progreso de Indexación</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-500 h-2 transition-all duration-300" 
              style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
            />
          </div>
        </div>
      )}

      {/* Terminal Logs */}
      {logs.length > 0 && (
        <div className="mt-6 bg-slate-50 border rounded-md p-3 h-48 overflow-y-auto font-mono text-xs text-slate-700 space-y-1">
          {logs.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-slate-400">[{new Date().toLocaleTimeString()}]</span>
              <span>{log}</span>
            </div>
          ))}
          {status === "done" && (
            <div className="text-green-600 font-bold mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Finalizado
            </div>
          )}
          {status === "error" && (
            <div className="text-red-500 font-bold mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Fallido
            </div>
          )}
        </div>
      )}
    </div>
  );
}
