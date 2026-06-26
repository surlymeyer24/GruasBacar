import React, { useRef, useState } from "react";
import { Camera, RefreshCw, Upload, Sparkles, Check, AlertCircle } from "lucide-react";

interface FotoCaptureProps {
  onCapture: (blob: Blob) => void;
  isLoading?: boolean;
  etiquetaText: string;
}

export const FotoCapture: React.FC<FotoCaptureProps> = ({
  onCapture,
  isLoading = false,
  etiquetaText
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setPhotoBlob(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPhotoBlob(null);
  };

  const handleUploadClick = () => {
    if (photoBlob) {
      onCapture(photoBlob);
    }
  };

  return (
    <div className="bg-zinc-950 text-white rounded-2xl border border-zinc-850 p-4 sm:p-6 space-y-6 flex flex-col justify-between overflow-hidden relative shadow-2xl min-h-[460px] animate-in fade-in duration-200">
      
      {/* Hidden input constraint for real live environment camera only */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment" // Forces the native camera shutter on mobile!
        className="hidden"
      />

      {/* Top Banner with guidelines */}
      <div className="flex justify-between items-center bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-800">
        <div>
          <span className="text-[9px] font-mono font-extrabold text-brand-orange uppercase tracking-widest leading-none">Guía de Inspección</span>
          <h4 className="text-xs font-bold text-zinc-100 uppercase mt-0.5 tracking-tight">{etiquetaText}</h4>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 bg-zinc-950 text-[10px] font-bold text-zinc-400 rounded-lg border border-zinc-800">
          <Camera className="w-3.5 h-3.5 text-brand-orange" />
          CÁMARA REQUERIDA
        </div>
      </div>

      {/* Main Preview/Visual capture block */}
      <div className="relative flex-grow flex items-center justify-center bg-zinc-900 rounded-xl border border-dashed border-zinc-800 aspect-video overflow-hidden min-h-[220px]">
        {previewUrl ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-full object-contain"
            />
            
            {/* Grid overlay */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20 divide-x divide-y divide-white border border-white" />
          </div>
        ) : (
          <div className="text-center p-6 space-y-4 max-w-sm flex flex-col items-center">
            <div 
              onClick={triggerCamera}
              className="p-4 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange rounded-full border border-brand-orange/20 cursor-pointer transition-all duration-150 transform hover:scale-105 active:scale-95"
            >
              <Camera className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-300">Fotografiar Carrocería</p>
              <p className="text-[11px] text-zinc-500">
                Presione el botón para abrir la cámara e inmortalizar el sector indicado. Evite reflejos o contraluces.
              </p>
            </div>
            
            <button
              type="button"
              onClick={triggerCamera}
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-755 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
            >
              Iniciar Obturador
            </button>
          </div>
        )}
      </div>

      {/* Controller Buttons */}
      <div className="pt-2">
        {previewUrl ? (
          <div className="flex gap-3 justify-center">
            
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              className="flex-1 py-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-xs font-bold text-gray-300 rounded-xl cursor-pointer flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
              Tomar Otra
            </button>

            <button
              type="button"
              onClick={handleUploadClick}
              disabled={isLoading}
              className="flex-1 py-3 bg-brand-orange hover:bg-red-600 text-xs font-extrabold text-zinc-950 rounded-xl cursor-pointer flex justify-center items-center gap-2 transition-colors shadow-lg disabled:bg-red-400"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-950/30 border-t-zinc-950 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Confirmar Foto
                </>
              )}
            </button>

          </div>
        ) : (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] text-zinc-400 flex items-center gap-2">
            <AlertCircle className="w-4.5 h-4.5 text-brand-orange/80 shrink-0" />
            <p>La geolocalización satelital se adjuntará automáticamente para auditoría municipal.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default FotoCapture;
