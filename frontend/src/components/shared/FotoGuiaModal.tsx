import React, { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "../../utils/compressImage";
import { extractGpsFromFile, GeoCoords } from "../../utils/extractGps";
import { fotoService } from "../../services/foto.service";
import { EtiquetaFoto } from "@gruasbacar/shared";
import {
  Camera,
  Check,
  ChevronRight,
  ImagePlus,
  RotateCcw,
  X,
  Zap,
  ZapOff,
} from "lucide-react";

export const PASOS_FOTO = [
  { etiqueta: "DELANTERA" as EtiquetaFoto, titulo: "Delantera" },
  { etiqueta: "LADO_DERECHO" as EtiquetaFoto, titulo: "Lado copiloto" },
  { etiqueta: "TRASERA" as EtiquetaFoto, titulo: "Trasera" },
  { etiqueta: "LADO_IZQUIERDO" as EtiquetaFoto, titulo: "Lado piloto" },
] as const;

export interface SlotFotoGuia {
  blob: Blob;
  previewUrl: string;
  etiqueta: EtiquetaFoto;
  base64: string;
}

interface PendingCapture {
  blob: Blob;
  previewUrl: string;
  base64: string;
}

interface FotoGuiaModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: (SlotFotoGuia | null)[];
  onSlotChange: (index: number, slot: SlotFotoGuia | null) => void;
  fotosExtra?: SlotFotoGuia[];
  onExtraAdd?: (extra: SlotFotoGuia) => void;
  maxExtras?: number;
  onGeoExif?: (geo: GeoCoords) => void;
  startAtStep?: number;
  permitirGaleria?: boolean;
  /** Persistencia síncrona JUSTO antes de abrir la cámara nativa fallback. */
  onBeforeNativeCapture?: (stepIndex: number) => void;
  /** Notifica el paso activo para restaurar si la pestaña se recarga. */
  onStepChange?: (stepIndex: number) => void;
}

const CAN_GET_USER_MEDIA =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

export const FotoGuiaModal: React.FC<FotoGuiaModalProps> = ({
  isOpen,
  onClose,
  slots,
  onSlotChange,
  fotosExtra = [],
  onExtraAdd,
  maxExtras = 5,
  onGeoExif,
  startAtStep,
  permitirGaleria = false,
  onBeforeNativeCapture,
  onStepChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const pendingPreviewRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<"camera" | "review">("camera");
  const [guidedIndex, setGuidedIndex] = useState(0);
  const [extraMode, setExtraMode] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [useFallback, setUseFallback] = useState(!CAN_GET_USER_MEDIA);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchActive, setTorchActive] = useState(false);

  // ── Camera management ──────────────────────────────────────────────────

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamReady(false);
    setTorchSupported(false);
    setTorchActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    if (useFallback) return;
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(!!caps?.torch);
        } catch {
          setTorchSupported(false);
        }
      }
      setStreamReady(true);
    } catch {
      setUseFallback(true);
    }
  }, [useFallback, stopStream]);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (
        startAtStep !== undefined &&
        startAtStep >= 0 &&
        startAtStep < PASOS_FOTO.length
      ) {
        setGuidedIndex(startAtStep);
        setExtraMode(false);
      } else {
        const firstEmpty = slots.findIndex((s) => !s);
        if (firstEmpty >= 0) {
          setGuidedIndex(firstEmpty);
          setExtraMode(false);
        } else {
          setExtraMode(true);
        }
      }
      setPhase("camera");
      setPendingCapture(null);
      pendingPreviewRef.current = null;
      setErrorText(null);
      startStream();
    } else {
      stopStream();
    }
  }, [isOpen]);

  // Notify parent of step changes
  useEffect(() => {
    if (!isOpen) return;
    onStepChange?.(extraMode ? -1 : guidedIndex);
  }, [isOpen, guidedIndex, extraMode]);

  useEffect(
    () => () => {
      stopStream();
      if (pendingPreviewRef.current) {
        URL.revokeObjectURL(pendingPreviewRef.current);
      }
    },
    [stopStream]
  );

  if (!isOpen) return null;

  // ── Computed ───────────────────────────────────────────────────────────

  const emptyOtherGuided = slots.reduce(
    (n, s, i) => (i !== guidedIndex && !s ? n + 1 : n),
    0
  );
  const isLastEmptyGuided = !extraMode && emptyOtherGuided === 0;
  const showListo = extraMode || isLastEmptyGuided;
  const canTakeMoreExtras = fotosExtra.length < maxExtras;

  const currentLabel = extraMode
    ? `Foto extra ${fotosExtra.length + 1}`
    : `Foto ${guidedIndex + 1}/${PASOS_FOTO.length} · ${PASOS_FOTO[guidedIndex].titulo}`;

  // ── Processing ─────────────────────────────────────────────────────────

  const processBlob = async (blob: Blob, extractGps: boolean) => {
    setProcessing(true);
    setErrorText(null);
    try {
      if (extractGps && onGeoExif) {
        extractGpsFromFile(blob).then((gps) => {
          if (gps) onGeoExif(gps);
        });
      }
      const compressed = await compressImage(blob);
      const [previewUrl, base64] = await Promise.all([
        Promise.resolve(URL.createObjectURL(compressed)),
        fotoService.blobToBase64(compressed),
      ]);
      setPendingCapture({ blob: compressed, previewUrl, base64 });
      pendingPreviewRef.current = previewUrl;
      setPhase("review");
    } catch (err: unknown) {
      const isMemory =
        err instanceof RangeError ||
        (err instanceof Error &&
          /memory|allocation|out of memory/i.test(err.message));
      setErrorText(
        isMemory
          ? "Memoria insuficiente. Cerrá otras pestañas e intentá de nuevo."
          : "No se pudo procesar la imagen. Intentá de nuevo."
      );
    } finally {
      setProcessing(false);
    }
  };

  // ── Torch toggle ───────────────────────────────────────────────────────

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchActive;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchActive(next);
    } catch {}
  };

  // ── Capture via ImageCapture API or canvas fallback ─────────────────────

  const captureFromStream = async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !video.videoWidth || processing || !stream) return;

    // ImageCapture.takePhoto() produces correctly oriented JPEG with EXIF
    const IC = (globalThis as Record<string, unknown>).ImageCapture as
      | (new (t: MediaStreamTrack) => {
          takePhoto(settings?: { fillLightMode?: string }): Promise<Blob>;
          getPhotoCapabilities?(): Promise<{ fillLightMode?: { value?: string[] } }>;
        })
      | undefined;

    if (IC) {
      setProcessing(true);
      try {
        const ic = new IC(stream.getVideoTracks()[0]);
        const photoOpts: { fillLightMode?: string } = {};
        if (torchActive) {
          try {
            const photoCaps = await ic.getPhotoCapabilities?.();
            const modes = photoCaps?.fillLightMode?.value ?? [];
            if (modes.includes("flash")) photoOpts.fillLightMode = "flash";
          } catch {}
        }
        const blob = await ic.takePhoto(photoOpts);
        await processBlob(blob, true);
        return;
      } catch {
        setProcessing(false);
      }
    }

    // Canvas fallback with orientation heuristic (Safari / older browsers)
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const screenPortrait = window.innerHeight > window.innerWidth;
    const videoLandscape = vw > vh;
    const needsRotation = screenPortrait && videoLandscape;

    const canvas = document.createElement("canvas");
    if (needsRotation) {
      canvas.width = vh;
      canvas.height = vw;
    } else {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (needsRotation) {
      ctx.translate(vh, 0);
      ctx.rotate(Math.PI / 2);
    }

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) processBlob(blob, false);
      },
      "image/jpeg",
      0.92
    );
  };

  // ── Fallback: native camera / gallery via file input ────────────────────

  const abrirCamaraFallback = () => {
    if (processing) return;
    setErrorText(null);
    onBeforeNativeCapture?.(extraMode ? -1 : guidedIndex);
    fileInputRef.current?.click();
  };

  const abrirGaleria = () => {
    if (processing) return;
    setErrorText(null);
    galeriaInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processBlob(file, true);
  };

  // ── Review actions ─────────────────────────────────────────────────────

  const handleContinuar = () => {
    if (!pendingCapture) return;
    pendingPreviewRef.current = null;

    if (extraMode) {
      onExtraAdd?.({ ...pendingCapture, etiqueta: "OBSERVACION" });
      if (fotosExtra.length + 1 >= maxExtras) {
        setPendingCapture(null);
        onClose();
        return;
      }
    } else {
      onSlotChange(guidedIndex, {
        ...pendingCapture,
        etiqueta: PASOS_FOTO[guidedIndex].etiqueta,
      });

      if (isLastEmptyGuided) {
        setExtraMode(true);
      } else {
        let next = -1;
        for (let i = guidedIndex + 1; i < PASOS_FOTO.length; i++) {
          if (!slots[i]) {
            next = i;
            break;
          }
        }
        if (next < 0) {
          for (let i = 0; i < guidedIndex; i++) {
            if (!slots[i]) {
              next = i;
              break;
            }
          }
        }
        setGuidedIndex(next >= 0 ? next : guidedIndex + 1);
      }
    }

    setPendingCapture(null);
    setPhase("camera");
    setErrorText(null);
  };

  const handleListo = () => {
    if (pendingCapture) {
      pendingPreviewRef.current = null;
      if (extraMode) {
        onExtraAdd?.({ ...pendingCapture, etiqueta: "OBSERVACION" });
      } else {
        onSlotChange(guidedIndex, {
          ...pendingCapture,
          etiqueta: PASOS_FOTO[guidedIndex].etiqueta,
        });
      }
      setPendingCapture(null);
    }
    onClose();
  };

  const handleRehacer = () => {
    if (pendingCapture?.previewUrl) {
      URL.revokeObjectURL(pendingCapture.previewUrl);
      pendingPreviewRef.current = null;
    }
    setPendingCapture(null);
    setPhase("camera");
    setErrorText(null);
  };

  const handleClose = () => {
    if (pendingCapture?.previewUrl) {
      URL.revokeObjectURL(pendingCapture.previewUrl);
      pendingPreviewRef.current = null;
    }
    setPendingCapture(null);
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const showLiveCamera = streamReady && !useFallback && phase === "camera";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div>
          <p className="text-sm font-bold text-white/90">{currentLabel}</p>
          {!extraMode && (
            <div className="flex gap-1.5 mt-1.5">
              {PASOS_FOTO.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    slots[i]
                      ? "bg-emerald-400"
                      : i === guidedIndex
                        ? "bg-brand-orange"
                        : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {torchSupported && showLiveCamera && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl cursor-pointer ${
                torchActive
                  ? "bg-brand-orange text-white"
                  : "text-white/70 hover:bg-white/10"
              }`}
              aria-label={torchActive ? "Apagar flash" : "Encender flash"}
            >
              {torchActive ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-white/70 hover:bg-white/10 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hidden file inputs (fallback + gallery) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {permitirGaleria && (
        <input
          ref={galeriaInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {/* Main area */}
      <div className="flex-1 relative min-h-0">
        {/* Video — always rendered to keep stream alive, hidden during review */}
        {!useFallback && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              showLiveCamera ? "block" : "hidden"
            }`}
          />
        )}

        {/* Camera: waiting for stream */}
        {phase === "camera" && !useFallback && !streamReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span className="text-xs font-bold text-white/70">
              Abriendo cámara...
            </span>
          </div>
        )}

        {/* Camera: fallback tap-to-open */}
        {phase === "camera" && useFallback && (
          <button
            type="button"
            onClick={abrirCamaraFallback}
            disabled={processing}
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-900 cursor-pointer disabled:cursor-wait"
          >
            <div className="p-4 rounded-full bg-brand-orange/20 text-brand-orange">
              <Camera className="w-10 h-10" />
            </div>
            <span className="text-sm font-bold text-brand-orange">
              Tocá para sacar la foto
            </span>
          </button>
        )}

        {/* Review: captured photo preview */}
        {phase === "review" && pendingCapture && (
          <img
            src={pendingCapture.previewUrl}
            alt="Foto capturada"
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
        )}

        {/* Processing overlay */}
        {processing && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 z-10">
            <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span className="text-xs font-bold text-white">Procesando...</span>
          </div>
        )}
      </div>

      {/* Error */}
      {errorText && (
        <div className="px-4 py-2 bg-red-900/80 text-red-200 text-xs text-center shrink-0">
          {errorText}
        </div>
      )}

      {/* Bottom actions */}
      <div className="px-4 py-4 shrink-0 space-y-2">
        {/* Camera mode: capture + optional gallery */}
        {phase === "camera" && showLiveCamera && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={captureFromStream}
              disabled={processing}
              className="flex-1 py-4 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-60 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <Camera className="w-5 h-5" />
              Capturar
            </button>
            {permitirGaleria && (
              <button
                type="button"
                onClick={abrirGaleria}
                disabled={processing}
                className="py-4 px-5 border border-white/20 rounded-2xl text-white/70 hover:bg-white/10 cursor-pointer flex items-center justify-center"
                aria-label="Subir desde galería"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Review mode: action buttons */}
        {phase === "review" && pendingCapture && (
          <>
            <button
              type="button"
              onClick={handleRehacer}
              className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold text-white/70 hover:bg-white/10 cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Rehacer foto
            </button>

            <div className="flex gap-2">
              {showListo && (
                <button
                  type="button"
                  onClick={handleListo}
                  className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <Check className="w-5 h-5" />
                  Listo
                </button>
              )}

              {(!extraMode || canTakeMoreExtras) && (
                <button
                  type="button"
                  onClick={handleContinuar}
                  className="flex-1 py-4 bg-brand-orange hover:bg-brand-orange/90 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  Continuar
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FotoGuiaModal;
