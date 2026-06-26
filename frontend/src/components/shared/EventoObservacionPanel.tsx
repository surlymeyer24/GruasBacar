import React from "react";
import { ClipboardList } from "lucide-react";

interface EventoObservacionPanelProps {
  observacion: string;
}

export const EventoObservacionPanel: React.FC<EventoObservacionPanelProps> = ({ observacion }) => {
  const texto = observacion.trim();
  if (!texto) return null;

  return (
    <div className="rounded-md border border-brand-seashell bg-white/70 p-2 text-left">
      <p className="text-[8px] font-bold uppercase tracking-wide text-brand-purply/75 flex items-center gap-1 border-b border-brand-seashell/60 pb-1 mb-1.5">
        <ClipboardList className="w-2.5 h-2.5 shrink-0" />
        Observación del operador
      </p>
      <p className="text-xs text-gray-650 italic leading-snug px-0.5">"{texto}"</p>
    </div>
  );
};

export default EventoObservacionPanel;
