import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { fotoService } from "../../services/foto.service";
import { servicioService } from "../../services/servicio.service";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { EstadoServicio } from "@gruasbacar/shared";
import { FotoLoteUpload, FotosLoteResult } from "../shared/FotoLoteUpload";
import LoadingSpinner from "../shared/LoadingSpinner";
import { FlowBackButton } from "../shared/FlowBackButton";
import { CheckCircle2, Truck } from "lucide-react";

interface FotoGuiadaProps {
  servicioId: string;
  estadoServicio?: EstadoServicio;
  onCompleted: () => void;
  onBack?: () => void;
  backLabel?: string;
}

export const FotoGuiada: React.FC<FotoGuiadaProps> = ({
  servicioId,
  estadoServicio,
  onCompleted,
  onBack,
  backLabel = "Volver al inicio",
}) => {
  const { getPosition } = useGeolocation();
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | undefined>();
  const [flowState, setFlowState] = useState<
    "LOADING" | "CAPTURING" | "SUBMITTING" | "READY_TRASLADO"
  >("LOADING");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fotosYaRegistradas, setFotosYaRegistradas] = useState(false);
  const submittingRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const prefetchUpload = useMemo(
    () => ({ servicioId, carpeta: "enganche" as const }),
    [servicioId]
  );

  const confirmarTraslado = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrorText(null);
    try {
      await servicioService.confirmarTraslado(servicioId);
      onCompletedRef.current();
    } finally {
      submittingRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const estado =
          estadoServicio ?? (await servicioService.obtenerEstadoServicio(servicioId));
        if (cancelled) return;

        if (estado === "EN_TRASLADO") {
          onCompletedRef.current();
          return;
        }

        const yaRegistrado = await servicioService.tieneEventoEnganche(servicioId);
        if (cancelled) return;

        if (yaRegistrado) {
          setFotosYaRegistradas(true);
          setFlowState("READY_TRASLADO");
        } else {
          setFlowState("CAPTURING");
        }
      } catch {
        if (!cancelled) setFlowState("CAPTURING");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servicioId, estadoServicio]);

  const handleConfirmFotos = async (result: FotosLoteResult) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFlowState("SUBMITTING");
    setErrorText(null);
    let fotosRegistradas = false;
    try {
      let activeGeo = geoCoords;
      if (!activeGeo) {
        try {
          activeGeo = await getPosition();
          setGeoCoords(activeGeo);
        } catch {
          // GPS opcional
        }
      }

      await fotoService.registrarEventoEnganche(
        servicioId,
        result.fotosMeta,
        activeGeo,
        result.fotosBase64,
        result.comentario,
        result.fotosSubidas
      );

      fotosRegistradas = true;
      setFotosYaRegistradas(true);
      await servicioService.confirmarTraslado(servicioId);
      onCompletedRef.current();
    } catch (err: unknown) {
      if (fotosRegistradas) {
        setFotosYaRegistradas(true);
        setErrorText(
          getFirebaseErrorMessage(err, "Error al iniciar el traslado. Intentá de nuevo.")
        );
      } else {
        setFlowState("CAPTURING");
        throw err;
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const handleContinuarTraslado = async () => {
    setFlowState("SUBMITTING");
    setErrorText(null);
    try {
      await confirmarTraslado();
    } catch (err: unknown) {
      setErrorText(
        getFirebaseErrorMessage(err, "Error al iniciar el traslado. Intentá de nuevo.")
      );
    }
  };

  if (flowState === "LOADING") {
    return <LoadingSpinner message="Verificando fotos del enganche..." />;
  }

  if (flowState === "SUBMITTING" && !errorText) {
    return (
      <div className="w-full min-w-0 bg-white border border-brand-seashell rounded-2xl p-8 text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-brand-cta border-t-transparent animate-spin mx-auto" />
        <h3 className="font-bold text-gray-900">
          {fotosYaRegistradas ? "Iniciando traslado..." : "Registrando fotos e iniciando traslado..."}
        </h3>
      </div>
    );
  }

  if (errorText && fotosYaRegistradas) {
    return (
      <div className="w-full min-w-0 bg-white border border-brand-seashell rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <p className="text-xs text-red-500 font-medium">{errorText}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-center">
          {onBack && <FlowBackButton onClick={onBack} label={backLabel} />}
          <button
            type="button"
            onClick={handleContinuarTraslado}
            className="w-full sm:w-auto px-6 py-3 bg-brand-cta hover:bg-brand-cta-hover text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            Continuar al traslado
          </button>
        </div>
      </div>
    );
  }

  if (flowState === "READY_TRASLADO") {
    return (
      <div className="w-full min-w-0 bg-white border border-brand-seashell rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-gray-900 text-sm">Fotos del enganche registradas</h3>
          <p className="text-xs text-gray-500">
            Las fotos ya están guardadas. Podés continuar al traslado cuando estés listo.
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-center">
          {onBack && <FlowBackButton onClick={onBack} label={backLabel} />}
          <button
            type="button"
            onClick={handleContinuarTraslado}
            className="w-full sm:w-auto px-6 py-3 bg-brand-cta hover:bg-brand-cta-hover text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            Continuar al traslado
          </button>
        </div>
      </div>
    );
  }

  return (
    <FotoLoteUpload
      titulo="Fotos del enganche"
      descripcion="Tocá el botón principal: te guiamos paso a paso (delantera, copiloto, trasera, piloto)."
      comentarioId="comentario-enganche"
      prefetchUpload={prefetchUpload}
      onBack={onBack}
      backLabel={backLabel}
      onConfirm={handleConfirmFotos}
    />
  );
};

export default FotoGuiada;
