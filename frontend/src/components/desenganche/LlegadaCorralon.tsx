import React, { useState, useEffect } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { corralonService } from "../../services/corralon.service";
import { resolverIdCorralonSem } from "../../utils/corralonDisplay";
import { servicioService } from "../../services/servicio.service";
import { Corralon, GeoPoint } from "@gruasbacar/shared";
import { Building2, AlertCircle, ArrowRight, User, MapPin } from "lucide-react";
import { MapaCoordenadasPreview } from "../shared/MapaCoordenadasPreview";
import { FlowBackButton } from "../shared/FlowBackButton";
import { CustomSelect } from "../shared/CustomSelect";

interface LlegadaCorralonProps {
  servicioId: string;
  geoEnganche?: GeoPoint | null;
  onCompleted: (corralonId: string, encargadoDeposito: string, geo?: { lat: number; lng: number }) => void;
  onBack?: () => void;
  backLabel?: string;
  initialCorralonId?: string;
  initialEncargado?: string;
  /** La llegada al corralón ya quedó registrada; confirmar solo continúa a fotos. */
  llegadaYaRegistrada?: boolean;
}

export const LlegadaCorralon: React.FC<LlegadaCorralonProps> = ({
  servicioId,
  geoEnganche,
  onCompleted,
  onBack,
  backLabel = "Volver al traslado",
  initialCorralonId = "",
  initialEncargado = "",
  llegadaYaRegistrada = false,
}) => {
  const { coordinates, getPosition } = useGeolocation(true);
  const [corralones, setCorralones] = useState<Corralon[]>([]);
  const [selectedCorralonId, setSelectedCorralonId] = useState(initialCorralonId);
  const [encargadoDeposito, setEncargadoDeposito] = useState(initialEncargado);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCorralonId) setSelectedCorralonId(initialCorralonId);
  }, [initialCorralonId]);

  useEffect(() => {
    if (initialEncargado) setEncargadoDeposito(initialEncargado);
  }, [initialEncargado]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const active = await corralonService.getCorralonesActivos();
        setCorralones(active);
        const semId = resolverIdCorralonSem(active);
        if (semId) {
          setSelectedCorralonId((prev) => prev || semId);
        }
      } catch (err) {
        console.error("Error loading corralones:", err);
        setApiError("No se pudieron cargar los corralones de depósito.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCorralonId) {
      setApiError("Debe seleccionar un corralón de destino.");
      return;
    }
    if (!encargadoDeposito.trim()) {
      setApiError("Indicá el nombre del encargado del depósito.");
      return;
    }

    setIsSubmitting(true);
    setApiError(null);
    try {
      if (llegadaYaRegistrada) {
        onCompleted(
          selectedCorralonId,
          encargadoDeposito.trim(),
          coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : undefined
        );
        return;
      }

      let geo: { lat: number; lng: number } | undefined = coordinates
        ? { lat: coordinates.lat, lng: coordinates.lng }
        : undefined;

      if (!geo) {
        try {
          const fresh = await Promise.race([
            getPosition(),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500)),
          ]);
          if (fresh) {
            geo = { lat: fresh.lat, lng: fresh.lng };
          }
        } catch {
          // GPS opcional; el evento puede quedar sin coordenadas
        }
      }

      await servicioService.registrarLlegada(
        servicioId,
        selectedCorralonId,
        encargadoDeposito.trim(),
        geo
      );
      onCompleted(selectedCorralonId, encargadoDeposito.trim(), geo);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Fallo al registrar la llegada al corralón en el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const corralonOptions = corralones.map((c) => ({
    value: c.id,
    label: c.nombre,
  }));

  const selectedCorralon = corralones.find((c) => c.id === selectedCorralonId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-orange border-t-transparent animate-spin" />
        <span className="text-xs text-gray-500">Cargando corralones habilitados...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-150">
      
      {/* Title */}
      <div>
        <span className="text-[10px] bg-indigo-50 text-indigo-600 font-extrabold px-2.5 py-1 rounded-full uppercase font-mono tracking-wider">
          PASO 1 DE 3 · DESENGANCHE
        </span>
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mt-3">
          <Building2 className="w-5 h-5 text-brand-cta" />
          Ubicación del desenganche
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Indicá el corralón de entrega y la ubicación donde se realiza el desenganche.
        </p>
      </div>

      {geoEnganche && (
        <div className="space-y-2 p-4 bg-emerald-50/40 border border-emerald-200/50 rounded-xl">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Origen del traslado (enganche)
            </span>
          </div>
          <MapaCoordenadasPreview lat={geoEnganche.lat} lng={geoEnganche.lng} />
        </div>
      )}

      {apiError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/50 flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-wider">
            Corralón de entrega
          </label>

          <CustomSelect
            value={selectedCorralonId}
            onChange={setSelectedCorralonId}
            options={corralonOptions}
            placeholder="Seleccioná corralón..."
            ariaLabel="Corralón de entrega"
            icon={Building2}
          />
        </div>

        {selectedCorralon && (
          <div className="flex items-start gap-3 p-3.5 bg-brand-bg rounded-xl border border-brand-seashell/70">
            <div className="shrink-0 p-2 bg-white rounded-lg border border-brand-seashell/50">
              <MapPin className="w-3.5 h-3.5 text-brand-cta" />
            </div>
            <div className="min-w-0">
              <span className="font-bold block uppercase text-[9px] tracking-wider text-brand-pale">
                Dirección de descarga
              </span>
              <p className="mt-0.5 text-xs text-brand-purply leading-snug">{selectedCorralon.direccion}</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-wider">
            Encargado del depósito
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale pointer-events-none" />
            <input
              type="text"
              value={encargadoDeposito}
              onChange={(e) => setEncargadoDeposito(e.target.value)}
              placeholder="Nombre de quien recibe en el corralón"
              className="w-full pl-10 pr-4 py-2.5 bg-brand-bg border border-brand-seashell rounded-2xl text-sm text-brand-purply placeholder:text-brand-pale/70 focus:border-brand-cta/40 focus:ring-2 focus:ring-brand-cta/25 outline-none transition-all"
              required
            />
          </div>
        </div>

        <div className="pt-4 border-t border-brand-seashell flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          {onBack && (
            <FlowBackButton onClick={onBack} label={backLabel} disabled={isSubmitting} />
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto sm:ml-auto px-6 py-3 bg-brand-cta hover:bg-brand-cta-hover disabled:bg-brand-cta/60 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer focus:ring-2 focus:ring-brand-cta"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                {llegadaYaRegistrada ? "Continuando..." : "Registrando arribo..."}
              </>
            ) : (
              <>
                {llegadaYaRegistrada ? "Continuar a fotos" : "Confirmar llegada"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default LlegadaCorralon;
