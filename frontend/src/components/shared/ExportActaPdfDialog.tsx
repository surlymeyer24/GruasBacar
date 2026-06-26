import React, { useEffect, useState } from "react";
import { FileDown, X } from "lucide-react";
import type { ExportActaPdfProgress } from "../../utils/exportActaPdf";

interface ExportActaPdfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (incluirFotos: boolean) => void;
  cantidadFotos: number;
  exportando?: boolean;
  exportProgress?: ExportActaPdfProgress | null;
}

export const ExportActaPdfDialog: React.FC<ExportActaPdfDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  cantidadFotos,
  exportando = false,
  exportProgress = null,
}) => {
  const [incluirFotos, setIncluirFotos] = useState(true);

  useEffect(() => {
    if (isOpen) setIncluirFotos(cantidadFotos > 0);
  }, [isOpen, cantidadFotos]);

  if (!isOpen) return null;

  const progressPercent = exportProgress?.percent ?? (exportando ? 8 : 0);
  const progressLabel = exportProgress?.label ?? (exportando ? "Iniciando exportación…" : "");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={exportando ? undefined : onClose} />

      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-brand-seashell z-10 overflow-hidden">
        <div className="p-5 flex items-start gap-3">
          <div className="p-2 rounded-xl shrink-0 bg-orange-50 text-brand-orange">
            <FileDown className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 flex-grow min-w-0">
            <h3 className="text-brand-purply font-bold text-sm tracking-tight">
              {exportando ? "Generando PDF…" : "Exportar acta a PDF"}
            </h3>
            <p className="text-brand-pale text-xs leading-relaxed">
              {exportando
                ? "Esto puede tardar unos segundos si el informe incluye fotografías."
                : "Elegí si querés incluir las fotografías en un anexo al final del documento."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exportando}
            className="p-1 rounded-lg text-brand-pale hover:bg-brand-bg transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {exportando ? (
          <div className="px-5 pb-5 space-y-2">
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide text-brand-pale">
              <span className="truncate">{progressLabel}</span>
              <span className="shrink-0 text-brand-orange">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-brand-bg border border-brand-seashell overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-orange transition-[width] duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="px-5 pb-4">
            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                cantidadFotos > 0
                  ? "border-brand-seashell bg-brand-bg/50 cursor-pointer"
                  : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                checked={incluirFotos && cantidadFotos > 0}
                onChange={(e) => setIncluirFotos(e.target.checked)}
                disabled={exportando || cantidadFotos === 0}
                className="mt-0.5 accent-brand-orange"
              />
              <span className="text-xs text-gray-700 leading-snug">
                <span className="font-bold text-gray-900 block">Incluir fotografías</span>
                {cantidadFotos > 0
                  ? `Se agregarán ${cantidadFotos} foto(s) al final del PDF.`
                  : "Esta acta no tiene fotos registradas."}
              </span>
            </label>
          </div>
        )}

        <div className="px-5 py-4 bg-brand-bg border-t border-brand-seashell flex justify-end gap-2 text-xs font-bold">
          {!exportando ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white text-brand-purply border border-brand-seashell hover:bg-brand-bg rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onConfirm(incluirFotos && cantidadFotos > 0)}
                className="px-4 py-2 bg-brand-orange hover:bg-brand-orange/90 text-white rounded-xl cursor-pointer"
              >
                Exportar PDF
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white text-brand-purply border border-brand-seashell hover:bg-brand-bg rounded-xl cursor-pointer"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportActaPdfDialog;
