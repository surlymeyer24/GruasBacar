import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { DatosForm, DatosFormFields } from "../components/enganche/DatosForm";
import { ResumenConfirmacion } from "../components/enganche/ResumenConfirmacion";
import { FotoGuiada } from "../components/enganche/FotoGuiada";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { useGeolocation } from "../hooks/useGeolocation";
import { servicioService } from "../services/servicio.service";
import { getFirebaseErrorMessage } from "../utils/firebaseError";
import { Servicio, AsignacionDiaria, esOperador, rutaInicioPorRoles, duplaEnganchadorDeAsignacion, enganchadorDeDuplaServicio } from "@gruasbacar/shared";
import { asignacionDiariaVigente, limpiarConfigDiaOmitidaHoy } from "../utils/asignacionDiaria";
import { ConfiguracionDiaModal } from "../components/operador/ConfiguracionDiaModal";
import { AlertCircle, ShieldCheck } from "lucide-react";
import {
  clearEngancheDraft,
  getEngancheDraft,
  setEngancheDraft,
} from "../services/engancheDraft.cache";

type PasosEnganche = "DATOS" | "CONFIRMACION" | "FOTOS";

const FORM_VACIO: DatosFormFields = {
  numeroInfraccion: "",
  patente: "",
  grua: "",
  gruaPatente: "",
  gruaDescripcion: "",
  dupla: "",
  duplaChofer: "",
  duplaEnganchador: "",
  inspector: "",
};

function marcarPasoVisitado(prev: Set<PasosEnganche>, paso: PasosEnganche): Set<PasosEnganche> {
  if (prev.has(paso)) return prev;
  const next = new Set(prev);
  next.add(paso);
  return next;
}

function formValuesDesdeServicio(servicio: Servicio, prev: DatosFormFields): DatosFormFields {
  return {
    ...prev,
    patente: servicio.patente?.trim() || prev.patente,
    numeroInfraccion: servicio.numeroInfraccion?.trim() || prev.numeroInfraccion,
    grua: servicio.grua?.trim() || prev.grua,
    duplaChofer: servicio.dupla?.chofer?.trim() || prev.duplaChofer,
    duplaEnganchador: enganchadorDeDuplaServicio(servicio.dupla) || prev.duplaEnganchador,
    inspector: servicio.dupla?.inspector?.trim() || prev.inspector,
  };
}

export const EnganchePage: React.FC = () => {
  const { userData, updateServicioActivo, profileLoading } = useAuth();
  const navigate = useNavigate();

  // Active step flow — restaurar borrador de sesión al montar (se limpia si hay servicio activo)
  const [paso, setPaso] = useState<PasosEnganche>(() => getEngancheDraft()?.paso ?? "DATOS");
  const [formValues, setFormValues] = useState<DatosFormFields>(
    () => getEngancheDraft()?.formValues ?? FORM_VACIO
  );
  const [pasosVisitados, setPasosVisitados] = useState<Set<PasosEnganche>>(
    () => new Set(getEngancheDraft()?.pasosVisitados ?? ["DATOS"])
  );

  // Flow states
  const [activeServicioId, setActiveServicioId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Dialog state
  const [showConfigDia, setShowConfigDia] = useState(false);
  const [turnoLocal, setTurnoLocal] = useState<AsignacionDiaria | null>(null);
  const revisionManualRef = useRef(false);

  const turnoHoy = asignacionDiariaVigente(userData?.asignacionDiaria) ?? turnoLocal;
  const requiereConfigTurno = !turnoHoy && !userData?.servicioActivoId;

  // Use useServicioActivo hook once we have an active ID
  const { servicio: activeServicio, loading: hookLoading } = useServicioActivo();
  const { coordinates, getPosition } = useGeolocation();

  const resolverGeoEnganche = async (): Promise<{ lat: number; lng: number } | undefined> => {
    if (coordinates) return coordinates;
    try {
      const posicion = await Promise.race([
        getPosition(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500)),
      ]);
      return posicion;
    } catch {
      return undefined;
    }
  };

  const irAPaso = useCallback(
    (next: PasosEnganche) => {
      if (next === "DATOS" || next === "CONFIRMACION") {
        revisionManualRef.current = true;
      }
      if (activeServicio && (next === "DATOS" || next === "CONFIRMACION")) {
        setFormValues((prev) => formValuesDesdeServicio(activeServicio, prev));
      }
      setPaso(next);
    },
    [activeServicio]
  );

  useEffect(() => {
    if (!profileLoading) {
      if (!userData || !esOperador(userData.roles)) {
        navigate(rutaInicioPorRoles(userData?.roles ?? []), { replace: true });
        return;
      }

      const turno = asignacionDiariaVigente(userData?.asignacionDiaria);

      if (turno && !userData?.servicioActivoId) {
        setFormValues((prev) => ({
          ...prev,
          inspector: turno.inspector,
          duplaChofer: turno.duplaChofer,
          duplaEnganchador: duplaEnganchadorDeAsignacion(turno),
          gruaPatente: turno.gruaPatente,
        }));
      }

      if (!turno && !userData?.servicioActivoId) {
        setShowConfigDia(true);
      }
      
      // If user ready has a service recorded
      if (userData?.servicioActivoId) {
        setActiveServicioId(userData.servicioActivoId);
        setPaso("FOTOS");
        setPasosVisitados((prev) => {
          const next = new Set(prev);
          next.add("DATOS");
          next.add("CONFIRMACION");
          next.add("FOTOS");
          return next;
        });
      }
    }
  }, [userData, profileLoading, navigate]);

  useEffect(() => {
    setPasosVisitados((prev) => marcarPasoVisitado(prev, paso));
  }, [paso]);

  useEffect(() => {
    setEngancheDraft({
      formValues,
      paso,
      pasosVisitados: [...pasosVisitados],
    });
  }, [formValues, paso, pasosVisitados]);

  // Rellenar patente/acta desde el servicio activo si el borrador quedó vacío.
  useEffect(() => {
    if (!activeServicio) return;
    setFormValues((prev) => {
      if (prev.patente.trim() && prev.numeroInfraccion.trim()) return prev;
      return formValuesDesdeServicio(activeServicio, prev);
    });
  }, [activeServicio]);

  // Adjust step dynamically based on loaded active service state if needed
  useEffect(() => {
    if (activeServicio) {
      if (activeServicio.estado === "ENGANCHADO" && !revisionManualRef.current) {
        setPaso("FOTOS");
      } else if (activeServicio.estado === "EN_TRASLADO") {
        navigate("/traslado");
      } else if (activeServicio.estado === "DESENGANCHADO" || activeServicio.estado === "ANULADO") {
        // Closed, update user active and clean
        updateServicioActivo(null);
        setActiveServicioId(null);
        clearEngancheDraft();
        setFormValues(FORM_VACIO);
        setPasosVisitados(new Set(["DATOS"]));
        setPaso("DATOS");
      }
    }
  }, [activeServicio]);

  const handleDatosSubmit = (values: DatosFormFields) => {
    setFormValues(values);
    setPaso("CONFIRMACION");
  };

  const handleConfirmAction = async () => {
    if (!userData) return;
    setLoadingAction(true);
    setPageError(null);

    const servicioIdExistente = activeServicioId || userData.servicioActivoId;
    const engancheYaIniciado =
      Boolean(servicioIdExistente) &&
      (!activeServicio || activeServicio.estado === "ENGANCHADO");

    try {
      if (engancheYaIniciado) {
        setActiveServicioId(servicioIdExistente);
        revisionManualRef.current = false;
        setEngancheDraft({
          formValues,
          paso: "FOTOS",
          pasosVisitados: ["DATOS", "CONFIRMACION", "FOTOS"],
        });
        setPaso("FOTOS");
        return;
      }

      let geo: { lat: number; lng: number } | undefined = await resolverGeoEnganche();

      const res = await servicioService.iniciarEnganche(
        { ...formValues, geo, legajoEnganchador: userData.legajo },
        userData.uid,
        userData.nombre
      );

      const patente = formValues.patente.replace(/[\s-]/g, "").toUpperCase();
      const numeroInfraccion = formValues.numeroInfraccion.toUpperCase().trim();

      await updateServicioActivo(res.servicioId, {
        skipFetch: true,
        resumen: {
          id: res.servicioId,
          estado: "ENGANCHADO",
          patente,
          numeroInfraccion,
        },
      });
      setActiveServicioId(res.servicioId);
      revisionManualRef.current = false;
      setEngancheDraft({
        formValues,
        paso: "FOTOS",
        pasosVisitados: ["DATOS", "CONFIRMACION", "FOTOS"],
      });

      // 3. Increment visual step
      setPaso("FOTOS");
    } catch (err: unknown) {
      console.error(err);
      setPageError(getFirebaseErrorMessage(err, "No se pudo confirmar el enganche. Intentá de nuevo."));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfigDiaSaved = (asignacion: AsignacionDiaria) => {
    limpiarConfigDiaOmitidaHoy();
    setTurnoLocal(asignacion);
    setShowConfigDia(false);
    setFormValues((prev) => ({
      ...prev,
      inspector: asignacion.inspector,
      duplaChofer: asignacion.duplaChofer,
      duplaEnganchador: duplaEnganchadorDeAsignacion(asignacion),
      gruaPatente: asignacion.gruaPatente,
    }));
  };

  const handleConfigDiaClose = () => {
    setShowConfigDia(false);
    navigate("/");
  };

  const handleCompletedFlow = async () => {
    // Photos completed and trasladado confirmed inside FotoGuiada, redirecting
    navigate("/traslado");
  };

  const showBlockingLoader =
    (profileLoading && !userData) || (hookLoading && !activeServicio && paso !== "FOTOS");

  if (showBlockingLoader) {
    return <LoadingSpinner fullScreen message="Cargando..." />;
  }

  return (
    <Layout>
      <ConfiguracionDiaModal
        isOpen={showConfigDia}
        blocking
        allowDismiss
        dismissLabel="Volver al inicio"
        initialAsignacion={userData?.asignacionDiaria}
        onClose={handleConfigDiaClose}
        onSaved={handleConfigDiaSaved}
      />

      <div className="w-full min-w-0 max-w-2xl mx-auto space-y-6 overflow-x-hidden">
        
        {/* Simple Progress stepper card */}
        <div className="w-full min-w-0 bg-white border border-brand-seashell p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2 bg-brand-cta/10 text-brand-cta rounded-lg shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-brand-purply tracking-tight leading-snug">
                {paso === "DATOS" && "1. Carga de Datos"}
                {paso === "CONFIRMACION" && "2. Verificar Datos"}
                {paso === "FOTOS" && "3. Inspección de Fotos"}
              </h1>
              <p className="text-[10px] text-brand-pale mt-1">
                {paso === "DATOS" && "Especifique el vehículo infractor y los recursos."}
                {paso === "CONFIRMACION" && "Revise los datos y confirme el enganche."}
                {paso === "FOTOS" && "Subí 4 fotos del vehículo."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px] text-brand-pale font-extrabold bg-brand-bg px-2.5 py-1 rounded shrink-0 self-start sm:self-center">
            <span className={paso === "DATOS" ? "text-brand-cta font-bold underline" : ""}>Datos</span>
            <span>•</span>
            <span className={paso === "CONFIRMACION" ? "text-brand-cta font-bold underline" : ""}>Firma</span>
            <span>•</span>
            <span className={paso === "FOTOS" ? "text-brand-cta font-bold underline" : ""}>Fotos</span>
          </div>
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold">{pageError}</p>
          </div>
        )}

        {/* Pasos montados en keep-alive: ocultos con CSS para conservar estado al volver */}
        {!requiereConfigTurno && pasosVisitados.has("DATOS") && (
          <div className={paso === "DATOS" ? undefined : "hidden"}>
            <DatosForm
              values={formValues}
              onChange={setFormValues}
              onSubmit={handleDatosSubmit}
              onBack={() => navigate("/")}
              backLabel="Volver al inicio"
            />
          </div>
        )}

        {!requiereConfigTurno && pasosVisitados.has("CONFIRMACION") && (
          <div className={paso === "CONFIRMACION" ? undefined : "hidden"}>
            <ResumenConfirmacion
              values={formValues}
              onBack={() => irAPaso("DATOS")}
              onConfirm={handleConfirmAction}
              isSubmitting={loadingAction}
              servicioYaIniciado={Boolean(
                (activeServicioId || userData?.servicioActivoId) &&
                  (!activeServicio || activeServicio.estado === "ENGANCHADO")
              )}
            />
          </div>
        )}

        {!requiereConfigTurno &&
          pasosVisitados.has("FOTOS") &&
          (activeServicioId || userData?.servicioActivoId) && (
            <div className={paso === "FOTOS" ? undefined : "hidden"}>
              <FotoGuiada
                servicioId={activeServicioId || userData!.servicioActivoId!}
                estadoServicio={activeServicio?.estado}
                onCompleted={handleCompletedFlow}
                onBack={() => irAPaso("CONFIRMACION")}
                backLabel="Volver al resumen"
              />
            </div>
          )}

      </div>
    </Layout>
  );
};

export default EnganchePage;
