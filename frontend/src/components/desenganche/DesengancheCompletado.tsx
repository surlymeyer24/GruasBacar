import React from "react";
import {
  Servicio,
  enganchadorDeDuplaServicio,
  displayPatente,
  resumenDuracionActa,
} from "@gruasbacar/shared";
import { CheckCircle, Share2, Download, ArrowRight } from "lucide-react";
import { ensureEventosServicio } from "../../services/historialEventos.cache";
import { useActaPdfCompartir } from "../../hooks/useActaPdfCompartir";

interface DesengancheCompletadoProps {
  servicio: Servicio;
  corralonNombre: string;
  patenteGrua: string;
  tipoFlota?: string;
  onVolverInicio: () => void;
}

export const DesengancheCompletado: React.FC<DesengancheCompletadoProps> = ({
  servicio,
  corralonNombre,
  patenteGrua,
  tipoFlota,
  onVolverInicio,
}) => {
  const {
    generando,
    pdfListo,
    progress,
    error,
    generar,
    compartir,
    descargar,
    canShare,
  } = useActaPdfCompartir();

  const handleGenerar = async () => {
    const eventos = await ensureEventosServicio(servicio.id, servicio.eventos);
    const duracion = resumenDuracionActa(servicio, eventos);

    await generar({
      servicio,
      eventos,
      patenteGrua,
      tipoFlota,
      corralonNombre,
      duracion,
      incluirFotos: true,
    });
  };

  const shareLabel = canShare ? "Compartir acta PDF" : "Descargar acta PDF";

  return (
    <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Success badge */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <span className="text-[10px] bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full uppercase font-mono tracking-wider">
            SERVICIO COMPLETADO
          </span>
          <h2 className="text-base font-bold text-gray-900 mt-2">
            Desenganche confirmado
          </h2>
          <p className="text-xs text-brand-pale mt-1">
            El vehículo fue entregado correctamente.
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="p-4 bg-brand-bg rounded-xl border border-brand-seashell/50 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Patente</span>
          <span className="font-mono font-extrabold text-gray-900 text-sm tracking-wider">
            {displayPatente(servicio.patente)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Corralón</span>
          <span className="font-semibold text-gray-800">{corralonNombre}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Dupla</span>
          <span className="font-medium text-gray-700">
            {servicio.dupla?.chofer || "—"} + {enganchadorDeDuplaServicio(servicio.dupla) || "—"}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {generando && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-brand-pale">
            <span className="truncate">{progress.label}</span>
            <span className="shrink-0 text-brand-orange">{progress.percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-brand-bg border border-brand-seashell overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-orange transition-[width] duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2.5 pt-2">
        {pdfListo ? (
          <>
            <p className="text-center text-xs font-semibold text-emerald-600">
              PDF listo. Tocá compartir para elegir WhatsApp u otra app.
            </p>
            {canShare ? (
              <button
                type="button"
                onClick={compartir}
                className="w-full px-6 py-3.5 bg-brand-orange hover:bg-brand-orange/90 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-orange/15 cursor-pointer focus:ring-2 focus:ring-brand-orange/40"
              >
                <Share2 className="w-4.5 h-4.5 shrink-0" />
                Compartir por WhatsApp, etc.
              </button>
            ) : null}
            <button
              type="button"
              onClick={descargar}
              className={`w-full px-6 py-3.5 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                canShare
                  ? "bg-white hover:bg-brand-bg text-brand-purply border border-brand-seashell"
                  : "bg-brand-orange hover:bg-brand-orange/90 text-white shadow-md shadow-brand-orange/15"
              }`}
            >
              <Download className="w-4.5 h-4.5 shrink-0" />
              Descargar acta PDF
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleGenerar}
            disabled={generando}
            className="w-full px-6 py-3.5 bg-brand-orange hover:bg-brand-orange/90 disabled:bg-brand-orange/60 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-orange/15 cursor-pointer focus:ring-2 focus:ring-brand-orange/40"
          >
            {generando ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                Generando PDF...
              </>
            ) : (
              <>
                {canShare ? (
                  <Share2 className="w-4.5 h-4.5 shrink-0" />
                ) : (
                  <Download className="w-4.5 h-4.5 shrink-0" />
                )}
                {shareLabel}
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onVolverInicio}
          className="w-full px-6 py-3 bg-white hover:bg-brand-bg text-brand-purply font-bold text-xs rounded-xl border border-brand-seashell flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          Volver al inicio
        </button>
      </div>
    </div>
  );
};

export default DesengancheCompletado;
