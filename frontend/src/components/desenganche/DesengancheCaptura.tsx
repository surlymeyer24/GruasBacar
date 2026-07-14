import React, { useState, useEffect, useMemo } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { corralonService } from "../../services/corralon.service";
import { servicioService } from "../../services/servicio.service";
import { resolverIdCorralonSem } from "../../utils/corralonDisplay";
import { Corralon, GeoPoint } from "@gruasbacar/shared";
import { FotoLoteUpload, FotosLoteResult } from "../shared/FotoLoteUpload";
import { claveBorradorDraft } from "../../services/fotoCache.service";
import { CustomSelect, CustomSelectGroup } from "../shared/CustomSelect";
import { Building2, MapPin, AlertCircle, Shield } from "lucide-react";

interface DesengancheCapturaProps {
  servicioId: string;
  geoEnganche?: GeoPoint | null;
  initialCorralonId?: string;
  llegadaYaRegistrada?: boolean;
  onCompleted: (corralonId: string, fotos: FotosLoteResult) => void;
  onBack?: () => void;
  backLabel?: string;
}

export const DesengancheCaptura: React.FC<DesengancheCapturaProps> = ({
  servicioId,
  geoEnganche,
  initialCorralonId = "",
  llegadaYaRegistrada = false,
  onCompleted,
  onBack,
  backLabel = "Volver al traslado",
}) => {
  const { coordinates, getPosition } = useGeolocation(true);
  const [corralones, setCorralones] = useState<Corralon[]>([]);
  const [selectedCorralonId, setSelectedCorralonId] = useState(initialCorralonId);
  const [isLoadingCorralones, setIsLoadingCorralones] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [llegadaRegistrada, setLlegadaRegistrada] = useState(llegadaYaRegistrada);

  useEffect(() => {
    if (initialCorralonId) setSelectedCorralonId(initialCorralonId);
  }, [initialCorralonId]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingCorralones(true);
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
        setIsLoadingCorralones(false);
      }
    };
    loadData();
  }, []);

  const prefetchUpload = useMemo(
    () => ({ servicioId, carpeta: "desenganche" as const }),
    [servicioId]
  );

  const corralonGroups = useMemo((): CustomSelectGroup[] | undefined => {
    const seccionales = corralones.filter((c) => c.tipo === "SECCIONAL");
    if (seccionales.length === 0) return undefined;
    const corrs = corralones.filter((c) => c.tipo !== "SECCIONAL");
    return [
      { label: "Corralones", options: corrs.map((c) => ({ value: c.id, label: c.nombre })) },
      { label: "Seccionales Policiales", options: seccionales.map((c) => ({ value: c.id, label: c.nombre })) },
    ];
  }, [corralones]);

  const corralonOptions = corralones.map((c) => ({
    value: c.id,
    label: c.nombre,
  }));

  const selectedCorralon = corralones.find((c) => c.id === selectedCorralonId);

  const handleConfirmFotos = async (result: FotosLoteResult) => {
    if (!selectedCorralonId) {
      setApiError("Debe seleccionar un destino de entrega.");
      return;
    }

    setApiError(null);

    if (!llegadaRegistrada) {
      let geo: { lat: number; lng: number } | undefined = coordinates
        ? { lat: coordinates.lat, lng: coordinates.lng }
        : undefined;

      if (!geo) {
        try {
          const fresh = await Promise.race([
            getPosition(),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500)),
          ]);
          if (fresh) geo = { lat: fresh.lat, lng: fresh.lng };
        } catch {
          // GPS opcional
        }
      }

      await servicioService.registrarLlegada(servicioId, selectedCorralonId, geo);
      setLlegadaRegistrada(true);
    }

    onCompleted(selectedCorralonId, result);
  };

  if (isLoadingCorralones) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-orange border-t-transparent animate-spin" />
        <span className="text-xs text-gray-500">Cargando destinos habilitados...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
      {/* Selector de corralón */}
      <div className="w-full bg-white p-4 border border-brand-seashell rounded-2xl shadow-sm space-y-3">
        <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-wider">
          Corralón / Destino de entrega
        </label>
        <CustomSelect
          value={selectedCorralonId}
          onChange={setSelectedCorralonId}
          options={corralonOptions}
          groups={corralonGroups}
          placeholder="Seleccioná destino..."
          ariaLabel="Corralón de entrega"
          icon={Building2}
        />
        {selectedCorralon && (
          <div className="flex items-start gap-3 p-3 bg-brand-bg rounded-xl border border-brand-seashell/70">
            <div className="shrink-0 p-1.5 bg-white rounded-lg border border-brand-seashell/50">
              {selectedCorralon.tipo === "SECCIONAL" ? (
                <Shield className="w-3.5 h-3.5 text-blue-600" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-brand-cta" />
              )}
            </div>
            <div className="min-w-0">
              <span className="font-bold block uppercase text-[9px] tracking-wider text-brand-pale">
                Dirección
              </span>
              <p className="mt-0.5 text-xs text-brand-purply leading-snug">{selectedCorralon.direccion}</p>
            </div>
          </div>
        )}
      </div>

      {apiError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/50 flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Fotos del desenganche */}
      <FotoLoteUpload
        titulo="Fotos del desenganche"
        descripcion="Tocá el botón principal: te guiamos paso a paso (delantera, copiloto, trasera, piloto)."
        comentarioId="comentario-desenganche"
        comentarioPlaceholder="Ej: entrega con llaves, daño preexistente..."
        prefetchUpload={prefetchUpload}
        draftCacheKey={claveBorradorDraft(servicioId, "desenganche")}
        limpiarCacheAlConfirmar={false}
        permitirGaleria
        confirmLabel="Confirmar fotos"
        maxExtras={3}
        onBack={onBack}
        backLabel={backLabel}
        onConfirm={handleConfirmFotos}
      />
    </div>
  );
};
