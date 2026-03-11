"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "agent";
  content: string;
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: "Hola. Soy tu Asistente Aeronáutico. Puedes pedirme que busque documentos, extraiga información o haga copias de certificados en tus carpetas." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
              {msg.content}
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
            placeholder='Ej: "Busca certificados para el PN 12345 y cópialos a la carpeta X..."'
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
