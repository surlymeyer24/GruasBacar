import React, { useState, useEffect } from "react";
import { Foto } from "@gruasbacar/shared";
import { etiquetaFotoLegible } from "../../utils/driveUrl";
import { ClipboardCheck, FileText, CheckCircle, PenTool, Building2 } from "lucide-react";
import { FlowBackButton } from "../shared/FlowBackButton";

interface ConfirmacionFinalProps {
  corralonId: string;
  corralonNombre?: string;
  encargadoDeposito?: string;
  fotos: Foto[];
  initialObservacion?: string;
  onConfirm: (observacionGeneral: string) => void;
  onBack?: () => void;
  backLabel?: string;
  isSubmitting: boolean;
}

export const ConfirmacionFinal: React.FC<ConfirmacionFinalProps> = ({
  corralonNombre = "Corralón Municipal",
  encargadoDeposito,
  fotos,
  initialObservacion = "",
  onConfirm,
  onBack,
  backLabel = "Cambiar fotos",
  isSubmitting,
}) => {
  const [observacionGeneral, setObservacionGeneral] = useState(initialObservacion);

  useEffect(() => {
    setObservacionGeneral((prev) => (prev.trim() ? prev : initialObservacion));
  }, [initialObservacion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(observacionGeneral.trim());
  };

  return (
    <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-150">
      
      {/* Step Title Header */}
      <div>
        <span className="text-[10px] bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full uppercase font-mono tracking-wider">
          PASO 3 DE 3 · RESUMEN SERVICIO
        </span>
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mt-3">
          <ClipboardCheck className="w-5 h-5 text-emerald-500" />
          Confirmación del Desenganche
        </h2>
      </div>

      {/* Overview Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Playon Destination */}
        <div className="p-4 bg-brand-bg rounded-xl border border-brand-seashell/50 flex items-start gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Lugar de Depósito</span>
            <span className="text-xs font-extrabold text-gray-850">{corralonNombre}</span>
          </div>
        </div>

        {/* Encargado del depósito */}
        <div className="p-4 bg-brand-bg rounded-xl border border-brand-seashell/50 flex items-start gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Encargado del Depósito</span>
            <span className="text-xs font-extrabold text-gray-850">{encargadoDeposito?.trim() || "—"}</span>
          </div>
        </div>

      </div>

      {/* Captured snapshots preview container */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Fotos de la Entrega</span>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {fotos.map((f, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-[9px] font-bold text-brand-pale uppercase tracking-wide truncate">
                {etiquetaFotoLegible(f.etiqueta)}
              </p>
              <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-brand-seashell/40">
                <img src={f.url} alt={etiquetaFotoLegible(f.etiqueta)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observation input form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        
        <div className="space-y-1.55">
          <label className="block text-[11px] font-bold text-gray-405 uppercase tracking-wider mb-1">
            Observaciones Generales de la Entrega (Opcional)
          </label>
          <div className="relative">
            <PenTool className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <textarea
              value={observacionGeneral}
              onChange={(e) => setObservacionGeneral(e.target.value)}
              placeholder="Escribir observación..."
              rows={3}
              className="w-full pl-9 pr-4 py-2.5 bg-brand-bg border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-brand-cta"
            />
          </div>
        </div>

        {/* Buttons row */}
        <div className="pt-4 border-t border-brand-seashell flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          {onBack && (
            <FlowBackButton onClick={onBack} label={backLabel} disabled={isSubmitting} />
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-400 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/10 cursor-pointer focus:ring-2 focus:ring-emerald-400 font-sans tracking-wide"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                Confirmando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                Confirmar Desenganche
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default ConfirmacionFinal;
