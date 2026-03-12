"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, FileSpreadsheet } from "lucide-react";

interface Message {
  role: "user" | "agent";
  content: string;
  isExcelDownloading?: boolean;
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: `Hola. Soy tu Asistente Aeronáutico. Puedo:

🔍 **Buscar documentos** - "¿Qué info tiene el archivo 0003002047.pdf?"
📋 **Buscar por PN/SN** - "Busca PN 34600028-1"
📊 **Exportar a Excel** - "Exportar excel B13 Certified Status.pdf"
📁 **Copiar archivos** - "Copia PN XXX a carpeta YYY"` }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Manejar la descarga de Excel
  const handleExcelExport = async (driveFileId: string, fileName: string) => {
    setMessages(prev => [...prev, { role: "agent", content: "⏳ Descargando y analizando el documento con IA... Esto puede tardar 15-30 segundos.", isExcelDownloading: true }]);

    try {
      const res = await fetch("/api/extract-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, fileName }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error generando Excel');
      }

      // Extraer metadata de los headers
      const tableName = res.headers.get('X-Table-Name') || 'Datos';
      const rowCount = res.headers.get('X-Row-Count') || '?';
      const colCount = res.headers.get('X-Col-Count') || '?';

      // Descargar el blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = fileName.replace(/\.[^.]+$/, '');
      a.href = url;
      a.download = `${safeName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessages(prev => {
        const newMsgs = [...prev];
        // Reemplazar el mensaje de "descargando" con el resultado
        const lastIdx = newMsgs.findLastIndex(m => m.isExcelDownloading);
        if (lastIdx >= 0) {
          newMsgs[lastIdx] = {
            role: "agent",
            content: `✅ **¡Excel generado!** Se descargó automáticamente.\n\n📊 Tabla: "${tableName}"\n📏 ${rowCount} filas × ${colCount} columnas\n📁 Archivo: ${safeName}.xlsx`
          };
        }
        return newMsgs;
      });
    } catch (error: any) {
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIdx = newMsgs.findLastIndex(m => m.isExcelDownloading);
        if (lastIdx >= 0) {
          newMsgs[lastIdx] = {
            role: "agent",
            content: `❌ Error generando Excel: ${error.message}`
          };
        }
        return newMsgs;
      });
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) throw new Error("Error de red");

      const data = await res.json();
      setMessages(prev => [...prev, { role: "agent", content: data.reply }]);

      // Si el agente detectó que hay que exportar a Excel, lanzar la descarga
      if (data.action === 'EXPORT_EXCEL' && data.driveFileId) {
        setTimeout(() => handleExcelExport(data.driveFileId, data.fileName), 500);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "agent", content: "❌ Ocurrió un error al procesar tu solicitud." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm w-full max-w-2xl flex flex-col h-[500px]">
      <div className="p-4 border-b flex items-center gap-2">
        <Bot className="w-5 h-5 text-blue-600" />
        <h2 className="font-semibold text-slate-800">Agente de Organización</h2>
        <span className="ml-auto text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-medium">✨ Superpoderes</span>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-slate-100" : "bg-blue-50"}`}>
              {msg.role === "user" ? <User className="w-4 h-4 text-slate-600" /> : <Bot className="w-4 h-4 text-blue-600" />}
            </div>
            <div className={`px-4 py-2 rounded-2xl text-sm max-w-[80%] ${
              msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-slate-100 text-slate-800 rounded-tl-none whitespace-pre-wrap"
            }`}>
              {msg.isExcelDownloading ? (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>{msg.content}</span>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 items-center">
            <div className="shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-slate-100 rounded-tl-none flex gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t bg-slate-50">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border-2 border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 rounded-full px-5 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition-colors shadow-sm"
            placeholder='Ej: "Exportar excel B13 Status.pdf" o "Busca PN 12345"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
