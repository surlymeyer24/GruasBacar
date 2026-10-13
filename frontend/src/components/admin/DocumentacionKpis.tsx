import React from "react";
import { AlertTriangle, CheckCircle2, Clock, Files } from "lucide-react";

export type FiltroVencimiento = "ALL" | "VIGENTE" | "POR_VENCER" | "VENCIDO";

export interface ConteosDocumentacion {
  total: number;
  vigentes: number;
  porVencer: number;
  vencidos: number;
}

export function contarPorVencimiento(estados: string[]): ConteosDocumentacion {
  let vigentes = 0;
  let porVencer = 0;
  let vencidos = 0;
  for (const estado of estados) {
    if (estado === "VIGENTE") vigentes += 1;
    else if (estado === "VENCIDO") vencidos += 1;
    else porVencer += 1;
  }
  return { total: estados.length, vigentes, porVencer, vencidos };
}

const CARDS: {
  id: FiltroVencimiento;
  label: string;
  key: keyof ConteosDocumentacion;
  border: string;
  active: string;
  iconWrap: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "ALL",
    label: "Total",
    key: "total",
    border: "border-l-brand-cornflower",
    active: "ring-2 ring-brand-cornflower/40 border-brand-cornflower/40",
    iconWrap: "bg-brand-cta/10 text-brand-cta",
    icon: <Files className="w-4 h-4" />,
  },
  {
    id: "VIGENTE",
    label: "Vigentes",
    key: "vigentes",
    border: "border-l-emerald-500",
    active: "ring-2 ring-emerald-400/50 border-emerald-300",
    iconWrap: "bg-emerald-50 text-emerald-600",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  {
    id: "POR_VENCER",
    label: "Por vencer",
    key: "porVencer",
    border: "border-l-amber-500",
    active: "ring-2 ring-amber-400/50 border-amber-300",
    iconWrap: "bg-amber-50 text-amber-600",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    id: "VENCIDO",
    label: "Vencidos",
    key: "vencidos",
    border: "border-l-red-600",
    active: "ring-2 ring-red-400/40 border-red-300",
    iconWrap: "bg-red-50 text-red-600",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
];

interface DocumentacionKpisProps {
  conteos: ConteosDocumentacion;
  activo: string;
  onSelect: (filtro: FiltroVencimiento) => void;
}

export const DocumentacionKpis: React.FC<DocumentacionKpisProps> = ({ conteos, activo, onSelect }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((card) => {
        const selected = activo === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(selected && card.id !== "ALL" ? "ALL" : card.id)}
            className={`p-4 bg-white rounded-2xl border border-brand-seashell border-l-4 ${card.border} shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 text-left cursor-pointer ${
              selected ? card.active : ""
            }`}
            aria-pressed={selected}
          >
            <div>
              <p className="text-[10px] font-bold text-brand-pale uppercase tracking-widest">{card.label}</p>
              <p className="text-2xl font-black text-brand-purply mt-0.5">{conteos[card.key]}</p>
            </div>
            <div className={`p-2.5 rounded-xl shrink-0 ${card.iconWrap}`}>{card.icon}</div>
          </button>
        );
      })}
    </div>
  );
};
