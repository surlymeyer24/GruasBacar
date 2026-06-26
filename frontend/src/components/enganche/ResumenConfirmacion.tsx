import React from "react";
import { DatosFormFields } from "./DatosForm";
import { ClipboardCheck, Check, Truck, Users, User } from "lucide-react";
import { FlowBackButton } from "../shared/FlowBackButton";

interface ResumenConfirmacionProps {
  values: DatosFormFields;
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  /** El acta ya fue iniciada; confirmar solo continúa al paso de fotos. */
  servicioYaIniciado?: boolean;
}

function formatGrua(values: DatosFormFields): string {
  const label = [values.gruaPatente, values.gruaDescripcion].filter(Boolean).join(" — ");
  return label || "Sin grúa asignada";
}

function formatEnganchador(values: DatosFormFields): string {
  return values.duplaEnganchador?.trim() || "Sin enganchador asignado";
}

function formatChoferDupla(values: DatosFormFields): string {
  return values.duplaChofer?.trim() || "Sin chofer asignado";
}

export const ResumenConfirmacion: React.FC<ResumenConfirmacionProps> = ({
  values,
  onBack,
  onConfirm,
  isSubmitting,
  servicioYaIniciado = false,
}) => {
  return (
    <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 space-y-6 w-full min-w-0 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200">
      
      {/* Title */}
      <div className="w-full">
        <h2 className="text-sm sm:text-base font-bold text-gray-900 w-full leading-snug flex items-start gap-2">
          <ClipboardCheck className="w-5 h-5 text-brand-cta shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0">Verificación de Datos del Enganche</span>
        </h2>
        <p className="text-xs text-gray-400 mt-2">
          Revise los datos y confirme el enganche.
        </p>
      </div>

      {/* Structured Details Card */}
      <div className="bg-brand-bg p-5 rounded-xl border border-brand-seashell/50 space-y-4">
        
        {/* Dominio Plate & Acta Infraccion banner */}
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-200 gap-4 sm:gap-0 pb-3 border-b border-gray-200">
          <div className="flex-1 space-y-1 sm:pr-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Patente / Dominio Encontrado</span>
            <span className="font-mono font-extrabold text-xl text-brand-purply tracking-widest">{values.patente}</span>
          </div>
          <div className="flex-1 space-y-1 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Número de Infracción / Acta</span>
            <span className="font-mono font-bold text-lg text-brand-cta tracking-wider">{values.numeroInfraccion}</span>
          </div>
        </div>

        {/* Assets details list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
          
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-slate-100 w-fit rounded-lg text-slate-500">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Móvil de Grúa</span>
              <span className="font-bold text-gray-800">{formatGrua(values)}</span>
              <p className="text-[10px] text-gray-450">Vehículo operativo de remolque</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-slate-100 w-fit rounded-lg text-slate-500">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Chofer</span>
              <span className="font-medium text-gray-800">{formatChoferDupla(values)}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-slate-100 w-fit rounded-lg text-slate-500">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Enganchador</span>
              <span className="font-medium text-gray-800">{formatEnganchador(values)}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 sm:col-span-2 pt-2 border-t border-brand-seashell/40">
            <div className="p-2 bg-slate-100 w-fit rounded-lg text-slate-500">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Inspector</span>
              <span className="font-semibold text-gray-800">{values.inspector}</span>
            </div>
          </div>

        </div>

      </div>

      {/* Button Row */}
      <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3 justify-end text-xs font-bold">
        
        <FlowBackButton
          onClick={onBack}
          disabled={isSubmitting}
          label="Volver a editar"
        />

        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="w-full sm:w-auto px-6 py-2.5 bg-brand-cta hover:bg-brand-cta-hover disabled:bg-brand-cta/60 text-white font-extrabold rounded-xl flex justify-center items-center gap-1.5 transition-all shadow-md shadow-brand-cta/15 cursor-pointer focus:ring-2 focus:ring-brand-cta"
        >
          {isSubmitting ? (
            <>
              <div className="w-4.5 h-4.5 rounded-full border-2 border-brand-purply/40 border-t-brand-purply animate-spin shrink-0" />
              {servicioYaIniciado ? "Continuando..." : "Confirmando..."}
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {servicioYaIniciado ? "Continuar a fotos" : "Confirmar Enganche"}
            </>
          )}
        </button>

      </div>

    </div>
  );
};

export default ResumenConfirmacion;
