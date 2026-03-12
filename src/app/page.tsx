import CrawlerWidget from "@/components/CrawlerWidget";
import DocumentList from "@/components/DocumentList";
import AgentChat from "@/components/AgentChat";
import { PlaneTakeoff, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Header */}
      <header className="w-full bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center">
            <PlaneTakeoff className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">AeroTrace <span className="text-sm font-normal text-slate-500 italic ml-2">by Yosef David Giraldo Salazar</span></h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">Sistema de Gestión Documental</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-full font-medium border border-green-200">
          <ShieldCheck className="w-4 h-4" />
          <span>Sistema En Línea</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl p-6 lg:p-10 flex flex-col lg:flex-row gap-8 items-start justify-center">
        
        {/* Left Column: Crawler & Ingestion */}
        <div className="flex-1 w-full flex flex-col gap-8">
          <section>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">1. Alimentación de Datos</h2>
            <p className="text-sm text-slate-600 mb-4">
              Ingresa el ID de la carpeta raíz en Google Drive que contiene los registros (Form Ones, Logbooks, ADs). El sistema rastreará e indexará recursivamente asegurando la topología.
            </p>
            <CrawlerWidget />
          </section>

          <section>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">2. Archivos Indexados</h2>
            <p className="text-sm text-slate-600 mb-4">
              Visualiza el estado de tus documentos y descarga los reportes en Excel directamente.
            </p>
            <DocumentList />
          </section>
        </div>

        {/* Right Column: Agent Chat */}
        <div className="flex-1 w-full flex flex-col gap-6">
          <section>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">3. Centro de Control Inteligente</h2>
            <p className="text-sm text-slate-600 mb-4">
              Pide al asistente organizar documentos, buscar PN/SN específicos, o auditar el estado de mantenimiento mediante copias atómicas a carpetas de exportación.
            </p>
            <AgentChat />
          </section>
        </div>

      </main>
    </div>
  );
}
