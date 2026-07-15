import React, { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "../../utils/compressImage";
import { fotoService } from "../../services/foto.service";
import {
  base64ToBlob,
  cargarBorradorFotos,
  claveBorradorFotos,
  guardarBorradorFotos,
  limpiarBorradorFotos,
} from "../../services/fotoCache.service";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { EtiquetaFoto, Foto } from "@gruasbacar/shared";
import { Camera, Check, ImagePlus, PenLine, Plus, X } from "lucide-react";
import { FotoGuiaModal, PASOS_FOTO, SlotFotoGuia } from "./FotoGuiaModal";
import { FlowBackButton } from "./FlowBackButton";

const FOTOS_REQUERIDAS = PASOS_FOTO.length;

type PendingTarget = "extra";

export interface FotosLoteResult {
  fotosMeta: Omit<Foto, "url" | "driveFileId">[];
  fotosBase64: string[];
  previewFotos: Foto[];
  comentario?: string;
  fotosSubidas?: Foto[];
}

interface PrefetchUploadConfig {
  servicioId: string;
  carpeta: "enganche" | "desenganche";
}

interface FotoLoteUploadProps {
  titulo: string;
  descripcion: string;
  comentarioId: string;
  comentarioPlaceholder?: string;
  confirmLabel?: string;
  prefetchUpload?: PrefetchUploadConfig;
  /** Clave estable para guardar borrador en IndexedDB antes de que exista servicioId. */
  draftCacheKey?: string;
  /** Si es false, el borrador local se mantiene hasta que el flujo cierre en servidor (desenganche). */
  limpiarCacheAlConfirmar?: boolean;
  permitirGaleria?: boolean;
  /** Cantidad máxima de fotos adicionales opcionales, además de las guiadas. */
  maxExtras?: number;
  onBack?: () => void;
  backLabel?: string;
  onConfirm: (result: FotosLoteResult) => Promise<void>;
  onFotosListas?: (listas: boolean) => void;
}

export const FotoLoteUpload: React.FC<FotoLoteUploadProps> = ({
  titulo,
  descripcion,
  comentarioId,
  comentarioPlaceholder = "Ej: rayón en guardabarros, llanta baja...",
  confirmLabel,
  prefetchUpload,
  draftCacheKey,
  limpiarCacheAlConfirmar = true,
  permitirGaleria = false,
  maxExtras = 5,
  onBack,
  backLabel = "Volver",
  onConfirm,
  onFotosListas,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const galeriaMasivaInputRef = useRef<HTMLInputElement>(null);
  const pendingTargetRef = useRef<PendingTarget | null>(null);
  const prefetchGenRef = useRef(0);
  const prefetchPromiseRef = useRef<Promise<Foto[] | null> | null>(null);
  const prefetchedSignatureRef = useRef<string | null>(null);
  const lastPrefetchOkRef = useRef(false);
  const cacheHydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serviceCacheKey = prefetchUpload
    ? claveBorradorFotos(prefetchUpload.servicioId, prefetchUpload.carpeta)
    : null;
  const cacheKey = serviceCacheKey ?? draftCacheKey ?? null;

  const [slots, setSlots] = useState<(SlotFotoGuia | null)[]>(
    Array.from({ length: FOTOS_REQUERIDAS }, () => null)
  );
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const MAX_EXTRAS = maxExtras;
  const [fotosExtra, setFotosExtra] = useState<SlotFotoGuia[]>([]);
  const fotosExtraRef = useRef(fotosExtra);
  fotosExtraRef.current = fotosExtra;
  const [comentario, setComentario] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStartStep, setModalStartStep] = useState(0);
  const [fotosSubidas, setFotosSubidas] = useState<Foto[] | null>(null);
  const [prefetchError, setPrefetchError] = useState<string | null>(null);
  const [cacheRestored, setCacheRestored] = useState(false);

  const slotToCached = useCallback((slot: SlotFotoGuia) => ({
    etiqueta: slot.etiqueta,
    base64: slot.base64,
  }), []);

  const cachedToSlot = useCallback(async (cached: { etiqueta: SlotFotoGuia["etiqueta"]; base64: string }) => {
    const blob = base64ToBlob(cached.base64);
    const previewUrl = URL.createObjectURL(blob);
    return {
      blob,
      previewUrl,
      etiqueta: cached.etiqueta,
      base64: cached.base64,
    } satisfies SlotFotoGuia;
  }, []);

  useEffect(() => {
    if (!cacheKey) {
      cacheHydratedRef.current = true;
      return;
    }

    let cancelled = false;
    cacheHydratedRef.current = false;
    setCacheRestored(false);

    (async () => {
      const borrador = await cargarBorradorFotos(cacheKey);
      if (cancelled) return;

      if (borrador) {
        const restoredSlots = await Promise.all(
          borrador.slots.map((s) => (s ? cachedToSlot(s) : Promise.resolve(null)))
        );
        if (cancelled) return;

        const restoredExtras: SlotFotoGuia[] = [];
        if (borrador.fotosExtra && Array.isArray(borrador.fotosExtra)) {
          for (const fe of borrador.fotosExtra) {
            if (fe) restoredExtras.push(await cachedToSlot(fe));
          }
        } else if (borrador.fotoExtra) {
          restoredExtras.push(await cachedToSlot(borrador.fotoExtra));
        }
        if (cancelled) return;

        setSlots(restoredSlots);
        setFotosExtra(restoredExtras.slice(0, MAX_EXTRAS));
        setComentario(borrador.comentario);
        if (restoredSlots.some(Boolean) || restoredExtras.length > 0) {
          setCacheRestored(true);
        }
      }

      cacheHydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, cachedToSlot]);

  const buildBorradorData = useCallback(() => ({
    slots: slotsRef.current.map((s) => (s ? slotToCached(s) : null)),
    fotosExtra: fotosExtraRef.current.map((s) => slotToCached(s)),
    comentario,
  }), [comentario, slotToCached]);

  const persistBorrador = useCallback(() => {
    if (!cacheKey || !cacheHydratedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void guardarBorradorFotos(cacheKey, buildBorradorData());
    }, 400);
  }, [cacheKey, buildBorradorData]);

  useEffect(() => {
    persistBorrador();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [persistBorrador]);

  // Guardado inmediato si la página pierde visibilidad (cierre, cambio de tab, etc.)
  useEffect(() => {
    if (!cacheKey) return;
    const flush = () => {
      if (document.visibilityState === "hidden" && cacheHydratedRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        void guardarBorradorFotos(cacheKey, buildBorradorData());
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [cacheKey, buildBorradorData]);

  // Migrate draft cache → service cache when servicioId arrives
  useEffect(() => {
    if (!serviceCacheKey || !draftCacheKey || serviceCacheKey === draftCacheKey) return;
    if (!cacheHydratedRef.current) return;
    const data = {
      slots: slots.map((s) => (s ? slotToCached(s) : null)),
      fotosExtra: fotosExtra.map((s) => slotToCached(s)),
      comentario,
    };
    void guardarBorradorFotos(serviceCacheKey, data).then(() =>
      limpiarBorradorFotos(draftCacheKey)
    );
  }, [serviceCacheKey]);

  const fotosCargadas = slots.filter(Boolean).length;
  const todasListas = fotosCargadas === FOTOS_REQUERIDAS;

  const onFotosListasRef = useRef(onFotosListas);
  onFotosListasRef.current = onFotosListas;
  const prevTodasListasRef = useRef(false);

  useEffect(() => {
    if (todasListas !== prevTodasListasRef.current) {
      prevTodasListasRef.current = todasListas;
      onFotosListasRef.current?.(todasListas);
    }
  }, [todasListas]);

  const slotsSignature = slots.map((s) => s?.base64 ?? "").join("|");
  const prefetchServicioId = prefetchUpload?.servicioId;
  const prefetchCarpeta = prefetchUpload?.carpeta;

  useEffect(() => {
    if (!prefetchServicioId || !prefetchCarpeta || !todasListas) {
      if (!prefetchServicioId || !prefetchCarpeta) {
        setFotosSubidas(null);
        setPrefetchError(null);
        prefetchPromiseRef.current = null;
        prefetchedSignatureRef.current = null;
        lastPrefetchOkRef.current = false;
      }
      return;
    }

    if (
      prefetchedSignatureRef.current === slotsSignature &&
      (lastPrefetchOkRef.current || prefetchPromiseRef.current)
    ) {
      return;
    }

    const signatureChanged = prefetchedSignatureRef.current !== slotsSignature;
    prefetchedSignatureRef.current = slotsSignature;

    const gen = ++prefetchGenRef.current;
    if (signatureChanged) {
      lastPrefetchOkRef.current = false;
      setFotosSubidas(null);
      setPrefetchError(null);
    }

    const fotosList = slots.map((s) => s!);
    const fotosMeta = fotosList.map((s) => ({ etiqueta: s.etiqueta }));
    const fotosBase64 = fotosList.map((s) => s.base64);

    const promise = fotoService
      .subirFotosEventoLote(prefetchServicioId, prefetchCarpeta, fotosMeta, fotosBase64)
      .then((uploaded) => {
        if (gen !== prefetchGenRef.current) return null;
        lastPrefetchOkRef.current = true;
        setFotosSubidas(uploaded);
        setPrefetchError(null);
        return uploaded;
      })
      .catch((err) => {
        if (gen !== prefetchGenRef.current) return null;
        lastPrefetchOkRef.current = false;
        console.warn("Precarga de fotos falló; se reintentará al confirmar.", err);
        setFotosSubidas(null);
        setPrefetchError(
          getFirebaseErrorMessage(err, "No se pudieron subir las fotos. Revisá la conexión.")
        );
        return null;
      })
      .finally(() => {
        if (gen === prefetchGenRef.current) {
          prefetchPromiseRef.current = null;
        }
      });

    prefetchPromiseRef.current = promise;
  }, [prefetchServicioId, prefetchCarpeta, todasListas, slotsSignature]);

  const abrirGuia = (startAt = 0) => {
    setModalStartStep(startAt);
    setModalOpen(true);
  };

  const handleSlotChange = (index: number, slot: SlotFotoGuia | null) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[index]?.previewUrl && next[index]?.previewUrl !== slot?.previewUrl) {
        URL.revokeObjectURL(next[index]!.previewUrl);
      }
      next[index] = slot;
      return next;
    });
  };

  const quitarFotoExtra = (index: number) => {
    setFotosExtra((prev) => {
      const next = [...prev];
      if (next[index]?.previewUrl) URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const abrirSelectorExtra = () => {
    pendingTargetRef.current = "extra";
    fileInputRef.current?.click();
  };

  const abrirGaleriaExtra = () => {
    pendingTargetRef.current = "extra";
    galeriaInputRef.current?.click();
  };

  const abrirGaleriaMasiva = () => {
    galeriaMasivaInputRef.current?.click();
  };

  const [procesandoGaleria, setProcesandoGaleria] = useState(false);

  const handleGaleriaMasiva = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorText(null);
    setProcesandoGaleria(true);

    try {
      const buffers = await Promise.all(
        Array.from(files).map(async (f) => ({
          buf: await f.arrayBuffer(),
          type: f.type || "image/jpeg",
        }))
      );

      e.target.value = "";

      const blobs = buffers.map((b) => new Blob([b.buf], { type: b.type }));

      const currentSlots = slotsRef.current;
      const emptySlotIndices = currentSlots
        .map((s, i) => (s ? -1 : i))
        .filter((i) => i >= 0);
      const extraSpace = MAX_EXTRAS - fotosExtraRef.current.length;
      const total = emptySlotIndices.length + extraSpace;

      const forSlots = blobs.slice(0, emptySlotIndices.length);
      const forExtras = blobs.slice(emptySlotIndices.length, total);

      if (blobs.length > total) {
        setErrorText(
          `Se seleccionaron ${blobs.length} fotos pero solo hay lugar para ${total}. Se usaron las primeras.`
        );
      }

      for (let i = 0; i < forSlots.length; i++) {
        const compressed = await compressImage(forSlots[i]);
        const previewUrl = URL.createObjectURL(compressed);
        const base64 = await fotoService.blobToBase64(compressed);
        const targetIndex = emptySlotIndices[i];
        const etiqueta = PASOS_FOTO[targetIndex].etiqueta;
        setSlots((prev) => {
          const next = [...prev];
          if (next[targetIndex]?.previewUrl) URL.revokeObjectURL(next[targetIndex]!.previewUrl);
          next[targetIndex] = { blob: compressed, previewUrl, etiqueta, base64 };
          return next;
        });
      }

      for (let i = 0; i < forExtras.length; i++) {
        const compressed = await compressImage(forExtras[i]);
        const previewUrl = URL.createObjectURL(compressed);
        const base64 = await fotoService.blobToBase64(compressed);
        setFotosExtra((prev) => [
          ...prev,
          { blob: compressed, previewUrl, etiqueta: "OBSERVACION" as const, base64 },
        ]);
      }
    } catch (err) {
      console.error("Error procesando fotos de galería:", err);
      setErrorText("No se pudieron procesar algunas imágenes. Intentá de nuevo.");
    } finally {
      setProcesandoGaleria(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || pendingTargetRef.current !== "extra") return;

    pendingTargetRef.current = null;
    setErrorText(null);
    try {
      const compressed = await compressImage(file);
      const [previewUrl, base64] = await Promise.all([
        Promise.resolve(URL.createObjectURL(compressed)),
        fotoService.blobToBase64(compressed),
      ]);
      setFotosExtra((prev) => [...prev, { blob: compressed, previewUrl, etiqueta: "OBSERVACION", base64 }]);
    } catch (err) {
      console.error(err);
      setErrorText("No se pudo procesar la imagen.");
    }
  };

  const handleConfirmarFotos = async () => {
    if (!todasListas) return;
    setIsUploading(true);
    setErrorText(null);

    try {
      const fotosList: SlotFotoGuia[] = slots.map((s) => s!);
      fotosList.push(...fotosExtra);

      const fotosMeta: Omit<Foto, "url" | "driveFileId">[] = fotosList.map((s) => ({
        etiqueta: s.etiqueta,
      }));

      const fotosBase64 = fotosList.map((s) => s.base64);

      let fotosSubidasConfirm: Foto[] | undefined = fotosSubidas ?? undefined;

      if (!fotosSubidasConfirm && prefetchServicioId && prefetchCarpeta) {
        if (prefetchPromiseRef.current) {
          const enCurso = await prefetchPromiseRef.current;
          if (enCurso) fotosSubidasConfirm = enCurso;
        }
        if (!fotosSubidasConfirm) {
          fotosSubidasConfirm = await fotoService.subirFotosEventoLote(
            prefetchServicioId,
            prefetchCarpeta,
            fotosMeta.slice(0, FOTOS_REQUERIDAS),
            fotosBase64.slice(0, FOTOS_REQUERIDAS)
          );
        }
      }

      if (fotosExtra.length > 0 && prefetchServicioId && prefetchCarpeta) {
        const extrasMeta = fotosExtra.map((fe) => ({ etiqueta: fe.etiqueta }));
        const extrasBase64 = fotosExtra.map((fe) => fe.base64);
        const extrasSubidas = await fotoService.subirFotosEventoLote(
          prefetchServicioId,
          prefetchCarpeta,
          extrasMeta,
          extrasBase64
        );
        fotosSubidasConfirm = fotosSubidasConfirm
          ? [...fotosSubidasConfirm, ...extrasSubidas]
          : extrasSubidas;
      }

      const previewFotos: Foto[] = fotosList.map((s) => ({
        url: s.previewUrl,
        etiqueta: s.etiqueta,
      }));

      await onConfirm({
        fotosMeta,
        fotosBase64,
        previewFotos,
        comentario: comentario.trim() || undefined,
        fotosSubidas: fotosSubidasConfirm,
      });

      if (limpiarCacheAlConfirmar) {
        if (cacheKey) await limpiarBorradorFotos(cacheKey);
        if (draftCacheKey && draftCacheKey !== cacheKey) await limpiarBorradorFotos(draftCacheKey);
      }
      setCacheRestored(false);
    } catch (err: unknown) {
      console.error(err);
      setErrorText(
        getFirebaseErrorMessage(err, "Error al confirmar las fotos. Revisá tu conexión e intentá de nuevo.")
      );
    } finally {
      setIsUploading(false);
    }
  };

  const labelConfirm = confirmLabel ?? "Confirmar fotos";
  const labelCorto = (titulo: string) =>
    titulo.replace("Foto ", "").replace("lado ", "");

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {permitirGaleria && (
        <>
          <input
            ref={galeriaInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={galeriaMasivaInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGaleriaMasiva}
          />
        </>
      )}

      <FotoGuiaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        slots={slots}
        onSlotChange={handleSlotChange}
        startAtStep={modalStartStep}
        permitirGaleria={permitirGaleria}
      />

      <div className="w-full min-w-0 bg-white p-4 border border-brand-seashell rounded-2xl shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-900 text-sm">{titulo}</h3>
          <span className="text-[10px] font-mono font-bold text-brand-orange shrink-0">
            {fotosCargadas}/{FOTOS_REQUERIDAS}
          </span>
        </div>
        <p className="text-xs text-gray-400">{descripcion}</p>
      </div>

      {cacheRestored && (
        <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl border border-amber-200/60 font-medium">
          Se recuperaron las fotos del borrador local. Si la página se recargó, no hace falta sacarlas de nuevo.
        </div>
      )}

      {prefetchError && todasListas && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/40 font-medium">
          {prefetchError}
        </div>
      )}

      {prefetchError && todasListas && !isUploading && (
        <button
          type="button"
          onClick={() => {
            setPrefetchError(null);
            lastPrefetchOkRef.current = false;
            prefetchedSignatureRef.current = null;
            prefetchGenRef.current += 1;
            const gen = prefetchGenRef.current;
            const fotosList = slots.map((s) => s!);
            const fotosMeta = fotosList.map((s) => ({ etiqueta: s.etiqueta }));
            const fotosBase64 = fotosList.map((s) => s.base64);
            prefetchedSignatureRef.current = slotsSignature;
            const promise = fotoService
              .subirFotosEventoLote(
                prefetchServicioId!,
                prefetchCarpeta!,
                fotosMeta,
                fotosBase64
              )
              .then((uploaded) => {
                if (gen !== prefetchGenRef.current) return null;
                lastPrefetchOkRef.current = true;
                setFotosSubidas(uploaded);
                setPrefetchError(null);
                return uploaded;
              })
              .catch((err) => {
                if (gen !== prefetchGenRef.current) return null;
                setPrefetchError(
                  getFirebaseErrorMessage(err, "No se pudieron subir las fotos.")
                );
                return null;
              })
              .finally(() => {
                if (gen === prefetchGenRef.current) {
                  prefetchPromiseRef.current = null;
                }
              });
            prefetchPromiseRef.current = promise;
          }}
          className="w-full py-2.5 text-xs font-bold text-brand-orange border border-brand-orange/40 rounded-xl hover:bg-brand-orange/5 cursor-pointer"
        >
          Reintentar subida de fotos
        </button>
      )}

      {errorText && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/40 font-medium">
          {errorText}
        </div>
      )}

      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={() => abrirGuia(todasListas ? 0 : fotosCargadas > 0 ? slots.findIndex((s) => !s) : 0)}
          disabled={isUploading}
          className={`${permitirGaleria ? "flex-1" : "w-full"} py-4 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-60 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm`}
        >
          <Camera className="w-5 h-5" />
          {fotosCargadas === 0
            ? "Sacar fotos"
            : todasListas
              ? "Revisar fotos"
              : "Continuar"}
        </button>
        {permitirGaleria && (
          <button
            type="button"
            onClick={abrirGaleriaMasiva}
            disabled={isUploading || procesandoGaleria}
            className="flex-1 py-4 border-2 border-brand-orange text-brand-orange hover:bg-brand-orange/5 disabled:opacity-60 font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            {procesandoGaleria ? (
              <>
                <div className="w-5 h-5 rounded-full border-2 border-brand-orange/30 border-t-brand-orange animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <ImagePlus className="w-5 h-5" />
                Subir desde galería
              </>
            )}
          </button>
        )}
      </div>

      {fotosCargadas > 0 && (
        <div className="grid grid-cols-2 gap-3 w-full min-w-0">
          {PASOS_FOTO.map((paso, index) => {
            const slot = slots[index];
            return (
              <button
                key={paso.etiqueta}
                type="button"
                onClick={() => abrirGuia(index)}
                disabled={isUploading}
                className="space-y-1.5 min-w-0 text-left cursor-pointer group"
              >
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                  {slot ? (
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />
                  )}
                  {labelCorto(paso.titulo)}
                </p>
                <div className="relative aspect-[4/3] rounded-xl border border-gray-200 bg-brand-bg overflow-hidden group-hover:ring-2 group-hover:ring-brand-orange/30 transition-shadow">
                  {slot ? (
                    <img src={slot.previewUrl} alt={paso.titulo} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Camera className="w-8 h-8" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {todasListas && (
        <div className="w-full min-w-0 space-y-3">
          {fotosExtra.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fotosExtra.map((fe, idx) => (
                <div key={idx} className="relative aspect-[4/3] rounded-xl border border-gray-200 bg-brand-bg overflow-hidden">
                  <img src={fe.previewUrl} alt={`Foto adicional ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => quitarFotoExtra(idx)}
                    disabled={isUploading}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white cursor-pointer"
                    aria-label={`Quitar foto adicional ${idx + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-2 left-2 text-[9px] font-bold uppercase tracking-wide bg-black/50 text-white px-2 py-0.5 rounded">
                    Extra {idx + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fotosExtra.length < MAX_EXTRAS && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={abrirSelectorExtra}
                disabled={isUploading}
                className="flex-1 py-3 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:text-brand-orange hover:border-brand-orange/50 hover:bg-brand-orange/5 cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Sacar foto extra
              </button>
              {permitirGaleria && (
                <button
                  type="button"
                  onClick={abrirGaleriaExtra}
                  disabled={isUploading}
                  className="flex-1 py-3 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:text-brand-orange hover:border-brand-orange/50 hover:bg-brand-orange/5 cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  Subir desde galería
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="w-full min-w-0 bg-white p-4 border border-brand-seashell rounded-2xl shadow-sm space-y-2">
        <label
          htmlFor={comentarioId}
          className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
        >
          <PenLine className="w-3.5 h-3.5" />
          Comentario (opcional)
        </label>
        <textarea
          id={comentarioId}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          disabled={isUploading}
          placeholder={comentarioPlaceholder}
          rows={3}
          className="w-full p-3 bg-brand-bg border border-gray-200 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 resize-none"
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        {onBack && (
          <FlowBackButton onClick={onBack} label={backLabel} disabled={isUploading} />
        )}
        <button
          type="button"
          onClick={handleConfirmarFotos}
          disabled={!todasListas || isUploading}
          className="w-full sm:flex-1 sm:max-w-none py-3 bg-brand-orange hover:bg-brand-orange/90 disabled:bg-brand-orange/40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
        >
          {isUploading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Confirmando...
            </>
          ) : (
            <>
              <ImagePlus className="w-4 h-4" />
              {labelConfirm}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default FotoLoteUpload;
