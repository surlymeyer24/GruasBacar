import React, { useEffect, useRef, useState } from "react";
import { compressImage } from "../../utils/compressImage";
import { fotoService } from "../../services/foto.service";
import { EtiquetaFoto } from "@gruasbacar/shared";
import { Camera, Check, ChevronLeft, X } from "lucide-react";

export const PASOS_FOTO = [
  {
    etiqueta: "DELANTERA" as EtiquetaFoto,
    titulo: "Foto delantera",
    instruccion: "Tocá el recuadro para sacar la foto delantera.",
  },
  {
    etiqueta: "LADO_DERECHO" as EtiquetaFoto,
    titulo: "Foto lado copiloto",
    instruccion: "Tocá el recuadro para sacar la foto del lado copiloto.",
  },
  {
    etiqueta: "TRASERA" as EtiquetaFoto,
    titulo: "Foto trasera",
    instruccion: "Tocá el recuadro para sacar la foto trasera.",
  },
  {
    etiqueta: "LADO_IZQUIERDO" as EtiquetaFoto,
    titulo: "Foto lado piloto",
    instruccion: "Tocá el recuadro para sacar la foto del lado piloto.",
  },
] as const;

export interface SlotFotoGuia {
  blob: Blob;
  previewUrl: string;
  etiqueta: EtiquetaFoto;
  base64: string;
}

interface FotoGuiaModalProps {
  isOpen: boolean;
  permitirGaleria?: boolean;
  onClose: () => void;
  slots: (SlotFotoGuia | null)[];
  onSlotChange: (index: number, slot: SlotFotoGuia | null) => void;
  startAtStep?: number;
}

export const FotoGuiaModal: React.FC<FotoGuiaModalProps> = ({
  isOpen,
  onClose,
  slots,
  onSlotChange,
  startAtStep = 0,
  permitirGaleria = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stepIndex, setStepIndex] = useState(startAtStep);
  const [processing, setProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const paso = PASOS_FOTO[stepIndex];
  const slotActual = slots[stepIndex];
  const completadas = slots.filter(Boolean).length;

  useEffect(() => {
    if (!isOpen) return;
    const start =
      startAtStep >= 0 && startAtStep < PASOS_FOTO.length ? startAtStep : 0;
    setStepIndex(start);
    setErrorText(null);
  }, [isOpen, startAtStep]);

  if (!isOpen) return null;

  const abrirCamara = () => {
    if (processing) return;
    setErrorText(null);
    fileInputRef.current?.click();
  };

  const guardarYAvanzar = (foto: SlotFotoGuia, index: number) => {
    const prev = slots[index];
    if (prev?.previewUrl && prev.previewUrl !== foto.previewUrl) {
      URL.revokeObjectURL(prev.previewUrl);
    }
    onSlotChange(index, foto);

    if (index < PASOS_FOTO.length - 1) {
      setStepIndex(index + 1);
      return;
    }
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const index = stepIndex;
    const etiqueta = PASOS_FOTO[index].etiqueta;

    setProcessing(true);
    setErrorText(null);
    try {
      const compressed = await compressImage(file);
      const [previewUrl, base64] = await Promise.all([
        Promise.resolve(URL.createObjectURL(compressed)),
        fotoService.blobToBase64(compressed),
      ]);
      guardarYAvanzar({ blob: compressed, previewUrl, etiqueta, base64 }, index);
    } catch {
      setErrorText("No se pudo procesar la imagen. Tocá el recuadro e intentá de nuevo.");
    } finally {
      setProcessing(false);
    }
  };

  const irPaso = (index: number) => {
    if (processing) return;
    setStepIndex(index);
    setErrorText(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="foto-guia-titulo"
        className="relative z-10 w-full sm:max-w-lg max-h-[95dvh] sm:max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-brand-seashell overflow-hidden animate-in slide-in-from-bottom-4 sm:fade-in sm:zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-orange">
              Paso {stepIndex + 1} de {PASOS_FOTO.length}
            </p>
            <h2 id="foto-guia-titulo" className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-gray-900 mt-1">
              {paso.titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex gap-1.5">
            {PASOS_FOTO.map((p, i) => {
              const done = Boolean(slots[i]);
              const active = i === stepIndex;
              return (
                <button
                  key={p.etiqueta}
                  type="button"
                  onClick={() => irPaso(i)}
                  disabled={processing}
                  className={`flex-1 min-w-0 py-2 px-1 rounded-xl text-center transition-colors cursor-pointer disabled:opacity-50 ${
                    active
                      ? "bg-brand-orange/15 ring-1 ring-brand-orange/40"
                      : done
                        ? "bg-emerald-50"
                        : "bg-brand-bg"
                  }`}
                >
                  <div className="flex justify-center mb-0.5">
                    {done ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <span
                        className={`text-[10px] font-bold ${active ? "text-brand-orange" : "text-gray-400"}`}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <span className="block text-[8px] font-bold uppercase tracking-wide truncate text-gray-500">
                    {p.titulo.replace("Foto ", "").replace("lado ", "")}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            {completadas}/{PASOS_FOTO.length} completadas
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            {...(!permitirGaleria ? { capture: "environment" as const } : {})}
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-xs text-gray-500 text-center">{paso.instruccion}</p>

          {errorText && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/40">
              {errorText}
            </div>
          )}

          <button
            type="button"
            onClick={abrirCamara}
            disabled={processing}
            className="relative w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-brand-orange/40 bg-brand-bg overflow-hidden cursor-pointer hover:bg-brand-orange/5 hover:border-brand-orange/70 active:scale-[0.99] transition-all disabled:cursor-wait disabled:opacity-80"
            aria-label={`Sacar ${paso.titulo.toLowerCase()}`}
          >
            {slotActual ? (
              <>
                <img
                  src={slotActual.previewUrl}
                  alt={paso.titulo}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span className="absolute bottom-3 left-3 text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  OK — tocá para cambiar
                </span>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="p-4 rounded-full bg-brand-orange/10 text-brand-orange">
                  <Camera className="w-10 h-10" />
                </div>
                <span className="text-sm font-bold text-brand-orange">
                  {permitirGaleria ? "Tocá para elegir o sacar la foto" : "Tocá para sacar la foto"}
                </span>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-xs font-bold text-white">Procesando...</span>
              </div>
            )}
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between shrink-0 bg-brand-bg/80">
          <button
            type="button"
            disabled={stepIndex === 0 || processing}
            onClick={() => irPaso(stepIndex - 1)}
            className="px-3 py-2 text-xs font-bold text-gray-500 disabled:opacity-30 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="px-3 py-2 text-xs font-bold text-gray-500 cursor-pointer disabled:opacity-50"
          >
            {completadas === PASOS_FOTO.length ? "Cerrar" : "Continuar después"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FotoGuiaModal;
