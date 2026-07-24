import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { fotoService } from "../../services/foto.service";
import { servicioService } from "../../services/servicio.service";
import { getFirebaseErrorMessage, esErrorDeRed } from "../../utils/firebaseError";
import {
  normalizarPatenteInput,
  AsignacionDiaria,
  EstadoServicio,
  enganchadorDeDupla,
  duplaEnganchadorDeAsignacion,
} from "@gruasbacar/shared";
import { FotoLoteUpload, FotosLoteResult } from "../shared/FotoLoteUpload";
import { claveBorradorDraft } from "../../services/fotoCache.service";
import { PatenteInput, validatePatenteText } from "../shared/PatenteInput";
import LoadingSpinner from "../shared/LoadingSpinner";
import { FlowBackButton } from "../shared/FlowBackButton";
import { CheckCircle2, Truck, Tag, Users } from "lucide-react";

interface EngancheCapturaProps {
  turno: AsignacionDiaria;
  userId: string;
  userDisplayName: string;
  userLegajo?: string;
  servicioActivoId?: string | null;
  estadoServicio?: EstadoServicio;
  onCompleted: () => void;
  onServiceCreated: (servicioId: string, patente: string) => void;
  onBack?: () => void;
  backLabel?: string;
}

export const EngancheCaptura: React.FC<EngancheCapturaProps> = ({
  turno,
  userId,
  userDisplayName,
  userLegajo,
  servicioActivoId,
  estadoServicio,
  onCompleted,
  onServiceCreated,
  onBack,
  backLabel = "Volver al inicio",
}) => {
  const { getPosition } = useGeolocation();

  const PATENTE_KEY = `gruasbacar_patente_${turno.duplaId}`;
  const DESC_VEH_KEY = `gruasbacar_descveh_${turno.duplaId}`;
  const [patente, setPatenteRaw] = useState(() => {
    try { return sessionStorage.getItem(PATENTE_KEY) ?? ""; } catch { return ""; }
  });
  const setPatente = useCallback((v: string) => {
    setPatenteRaw(v);
    try { sessionStorage.setItem(PATENTE_KEY, v); } catch { /* quota */ }
  }, [PATENTE_KEY]);
  const [descripcionVehiculo, setDescripcionVehiculoRaw] = useState(() => {
    try { return sessionStorage.getItem(DESC_VEH_KEY) ?? ""; } catch { return ""; }
  });
  const setDescripcionVehiculo = useCallback((v: string) => {
    setDescripcionVehiculoRaw(v);
    try { sessionStorage.setItem(DESC_VEH_KEY, v); } catch { /* quota */ }
  }, [DESC_VEH_KEY]);

  const [patenteError, setPatenteError] = useState<string | null>(null);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | undefined>();
  const [flowState, setFlowState] = useState<
    "LOADING" | "CAPTURING" | "SUBMITTING" | "READY_TRASLADO"
  >(servicioActivoId ? "LOADING" : "CAPTURING");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fotosYaRegistradas, setFotosYaRegistradas] = useState(false);
  const [activeServicioId, setActiveServicioId] = useState<string | null>(servicioActivoId ?? null);
  const activeServicioIdRef = useRef<string | null>(activeServicioId);
  const [creandoServicio, setCreandoServicio] = useState(false);
  const submittingRef = useRef(false);
  const creandoServicioRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const prefetchUpload = useMemo(
    () =>
      activeServicioId
        ? { servicioId: activeServicioId, carpeta: "enganche" as const }
        : undefined,
    [activeServicioId]
  );

  const draftCacheKey = useMemo(
    () => claveBorradorDraft(turno.duplaId, "enganche"),
    [turno.duplaId]
  );

  const crearServicioAnticipado = async () => {
    if (creandoServicioRef.current || activeServicioIdRef.current || submittingRef.current) return;
    const patErr = validatePatenteText(patente);
    if (patErr) return;

    creandoServicioRef.current = true;
    setCreandoServicio(true);
    try {
      let geo = geoCoords;
      if (!geo) {
        try {
          geo = await getPosition();
          setGeoCoords(geo);
        } catch { /* GPS opcional */ }
      }

      const normalizedPatente = normalizarPatenteInput(patente);
      const res = await servicioService.iniciarEnganche(
        {
          patente: normalizedPatente,
          ...(descripcionVehiculo.trim() ? { descripcionVehiculo: descripcionVehiculo.trim() } : {}),
          grua: turno.gruaPatente,
          gruaPatente: turno.gruaPatente,
          dupla: turno.duplaId,
          duplaChofer: turno.duplaChofer,
          duplaEnganchador: duplaEnganchadorDeAsignacion(turno),
          legajoEnganchador: userLegajo,
          geo,
        },
        userId,
        userDisplayName
      );
      activeServicioIdRef.current = res.servicioId;
      setActiveServicioId(res.servicioId);
      onServiceCreated(res.servicioId, normalizedPatente);
    } catch (err) {
      if (!esErrorDeRed(err)) {
        setErrorText(
          getFirebaseErrorMessage(err, "No se pudo iniciar el enganche. Intentá de nuevo.")
        );
      }
    } finally {
      creandoServicioRef.current = false;
      setCreandoServicio(false);
    }
  };

  const handleFotosListas = useCallback((listas: boolean) => {
    if (listas) crearServicioAnticipado();
  }, [patente, activeServicioId, geoCoords]);

  const confirmarTrasladoConRetry = async (sId: string, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await servicioService.confirmarTraslado(sId);
        return;
      } catch (err) {
        if (attempt < maxRetries && esErrorDeRed(err)) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  };

  const confirmarTraslado = async (sId: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrorText(null);
    try {
      await confirmarTrasladoConRetry(sId);
      onCompletedRef.current();
    } finally {
      submittingRef.current = false;
    }
  };

  useEffect(() => {
    if (!servicioActivoId || submittingRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const estado =
          estadoServicio ?? (await servicioService.obtenerEstadoServicio(servicioActivoId));
        if (cancelled || submittingRef.current) return;

        if (estado === "EN_TRASLADO") {
          onCompletedRef.current();
          return;
        }

        const yaRegistrado = await servicioService.tieneEventoEnganche(servicioActivoId);
        if (cancelled || submittingRef.current) return;

        if (yaRegistrado) {
          setFotosYaRegistradas(true);
          setFlowState("READY_TRASLADO");
        } else {
          setFlowState("CAPTURING");
        }
      } catch {
        if (!cancelled && !submittingRef.current) setFlowState("CAPTURING");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servicioActivoId, estadoServicio]);

  const handleConfirmFotos = async (result: FotosLoteResult) => {
    if (submittingRef.current) return;

    const patErr = validatePatenteText(patente);
    if (patErr && !activeServicioId) {
      setPatenteError(patErr);
      setErrorText("Completá la patente antes de confirmar.");
      return;
    }

    if (creandoServicioRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!creandoServicioRef.current) { clearInterval(check); resolve(); }
        }, 100);
      });
    }

    submittingRef.current = true;
    setErrorText(null);

    let sId = activeServicioIdRef.current;
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

      if (!sId) {
        const normalizedPatente = normalizarPatenteInput(patente);
        const res = await servicioService.iniciarEnganche(
          {
            patente: normalizedPatente,
            ...(descripcionVehiculo.trim() ? { descripcionVehiculo: descripcionVehiculo.trim() } : {}),
            grua: turno.gruaPatente,
            gruaPatente: turno.gruaPatente,
            dupla: turno.duplaId,
            duplaChofer: turno.duplaChofer,
            duplaEnganchador: duplaEnganchadorDeAsignacion(turno),
            legajoEnganchador: userLegajo,
            geo: activeGeo,
          },
          userId,
          userDisplayName
        );
        sId = res.servicioId;
        activeServicioIdRef.current = sId;
        setActiveServicioId(sId);
        onServiceCreated(sId, normalizedPatente);
      }

      const geoEnganche = result.geoExif ?? activeGeo;
      console.info("[EngancheCaptura] geo →", { geoExif: result.geoExif, activeGeo, geoEnganche });

      await fotoService.registrarEventoEnganche(
        sId,
        result.fotosMeta,
        geoEnganche,
        result.fotosBase64,
        result.comentario,
        result.fotosSubidas
      );

      fotosRegistradas = true;
      setFotosYaRegistradas(true);
      setFlowState("SUBMITTING");
      await confirmarTrasladoConRetry(sId);
      try { sessionStorage.removeItem(PATENTE_KEY); sessionStorage.removeItem(DESC_VEH_KEY); } catch { /* ok */ }
      onCompletedRef.current();
    } catch (err: unknown) {
      if (fotosRegistradas && sId) {
        setFotosYaRegistradas(true);
        setErrorText(
          getFirebaseErrorMessage(err, "Error al iniciar el traslado. Intentá de nuevo.")
        );
      } else {
        setErrorText(
          getFirebaseErrorMessage(err, "No se pudo confirmar el enganche. Intentá de nuevo.")
        );
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const handleContinuarTraslado = async () => {
    if (!activeServicioId) return;
    setFlowState("SUBMITTING");
    setErrorText(null);
    try {
      await confirmarTraslado(activeServicioId);
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
          {fotosYaRegistradas ? "Iniciando traslado..." : "Registrando enganche..."}
        </h3>
      </div>
    );
  }

  if (errorText && fotosYaRegistradas && activeServicioId) {
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
    <div className="w-full min-w-0 space-y-4 overflow-x-hidden">
      {/* Resumen compacto del turno */}
      <div className="w-full bg-white p-4 border border-brand-seashell rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs text-brand-pale">
          <span className="inline-flex items-center gap-1.5 font-bold">
            <Tag className="w-3.5 h-3.5 text-brand-cta" />
            <span className="text-brand-purply">{turno.gruaDescripcion || turno.gruaPatente}{turno.gruaDescripcion && turno.gruaPatente ? <span className="font-mono text-brand-pale ml-1.5">({turno.gruaPatente})</span> : null}</span>
          </span>
          <span className="text-brand-seashell">·</span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Users className="w-3.5 h-3.5 text-brand-cta" />
            {turno.duplaChofer}
            <span className="text-brand-pale/50">+</span>
            {duplaEnganchadorDeAsignacion(turno)}
          </span>
        </div>
      </div>

      {/* Campo de patente */}
      <div className="w-full bg-white p-4 border border-brand-seashell rounded-2xl shadow-sm">
        <PatenteInput
          value={patente}
          onChange={setPatente}
          error={patenteError}
          onErrorChange={setPatenteError}
          descripcionVehiculo={descripcionVehiculo}
          onDescripcionVehiculoChange={setDescripcionVehiculo}
        />
      </div>

      {errorText && !fotosYaRegistradas && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/40 font-medium">
          {errorText}
        </div>
      )}

      {/* Fotos */}
      <FotoLoteUpload
        titulo="Fotos del enganche"
        descripcion="Tocá el botón principal: te guiamos paso a paso (delantera, copiloto, trasera, piloto)."
        comentarioId="comentario-enganche"
        prefetchUpload={prefetchUpload}
        draftCacheKey={draftCacheKey}
        confirmLabel={creandoServicio ? "Preparando..." : "Confirmar enganche"}
        onBack={onBack}
        backLabel={backLabel}
        onConfirm={handleConfirmFotos}
        onFotosListas={handleFotosListas}
        maxExtras={5}
      />
    </div>
  );
};
