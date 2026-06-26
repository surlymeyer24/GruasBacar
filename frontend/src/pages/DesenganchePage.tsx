import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { LlegadaCorralon } from "../components/desenganche/LlegadaCorralon";
import { FotoDesenganche } from "../components/desenganche/FotoDesenganche";
import { ConfirmacionFinal } from "../components/desenganche/ConfirmacionFinal";
import { FotosLoteResult } from "../components/shared/FotoLoteUpload";
import { corralonService } from "../services/corralon.service";
import { servicioService } from "../services/servicio.service";
import { limpiarBorradorFotos, claveBorradorFotos } from "../services/fotoCache.service";
import { Corralon, esOperador, rutaInicioPorRoles, geoEngancheDeServicio } from "@gruasbacar/shared";
import { ShieldAlert } from "lucide-react";

type PasosDesenganche = "LLEGADA" | "FOTOS_EGRESO" | "CONFIRMACION_FINAL";

function marcarPasoVisitado(prev: Set<PasosDesenganche>, paso: PasosDesenganche): Set<PasosDesenganche> {
  if (prev.has(paso)) return prev;
  const next = new Set(prev);
  next.add(paso);
  return next;
}

export const DesenganchePage: React.FC = () => {
  const { userData, updateServicioActivo, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<PasosDesenganche>("LLEGADA");
  const [pasosVisitados, setPasosVisitados] = useState<Set<PasosDesenganche>>(() => new Set(["LLEGADA"]));
  const [selectedCorralonId, setSelectedCorralonId] = useState("");
  const [encargadoDeposito, setEncargadoDeposito] = useState("");
  const [corralones, setCorralones] = useState<Corralon[]>([]);
  const [capturedFotos, setCapturedFotos] = useState<FotosLoteResult | null>(null);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [llegadaRegistrada, setLlegadaRegistrada] = useState(false);
  
  // Submission indicator
  const [isFinishing, setIsFinishing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const { servicio, loading: serviceLoading } = useServicioActivo();

  useEffect(() => {
    if (!profileLoading) {
      if (!userData || !esOperador(userData.roles)) {
        navigate(rutaInicioPorRoles(userData?.roles ?? []), { replace: true });
        return;
      }
      if (!userData?.servicioActivoId) {
        navigate(rutaInicioPorRoles(userData.roles), { replace: true });
        return;
      }
    }
  }, [userData, profileLoading, navigate]);

  useEffect(() => {
    if (!servicio) return;

    if (servicio.estado === "DESENGANCHADO") {
      updateServicioActivo(null)
        .catch((err) => console.error("Error al liberar servicio entregado:", err))
        .finally(() => {
          navigate("/", {
            replace: true,
            state: { successMsg: "Este servicio ya fue entregado. Grúa liberada." },
          });
        });
      return;
    }

    if (servicio.estado === "ANULADO") {
      updateServicioActivo(null)
        .catch((err) => console.error("Error al liberar servicio anulado:", err))
        .finally(() => {
          navigate(rutaInicioPorRoles(userData?.roles ?? []), { replace: true });
        });
      return;
    }

    if (servicio.estado === "ENGANCHADO") {
      navigate("/traslado", { replace: true });
    }
  }, [servicio, navigate, updateServicioActivo, userData?.roles]);

  useEffect(() => {
    if (!servicio) return;

    if (servicio.corralon && servicio.encargadoDeposito) {
      setSelectedCorralonId(servicio.corralon);
      setEncargadoDeposito(servicio.encargadoDeposito);
      setLlegadaRegistrada(true);
      setStep((current) => (current === "LLEGADA" ? "FOTOS_EGRESO" : current));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const yaRegistrada = await servicioService.tieneEventoLlegadaCorralon(servicio.id);
        if (!cancelled && yaRegistrada) {
          if (servicio.corralon) setSelectedCorralonId(servicio.corralon);
          if (servicio.encargadoDeposito) setEncargadoDeposito(servicio.encargadoDeposito);
          setLlegadaRegistrada(true);
          setStep((current) => (current === "LLEGADA" ? "FOTOS_EGRESO" : current));
        }
      } catch (err) {
        console.error("Error al verificar llegada al corralón:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servicio]);

  useEffect(() => {
    setPasosVisitados((prev) => marcarPasoVisitado(prev, step));
  }, [step]);

  useEffect(() => {
    if (servicio?.corralon && servicio?.encargadoDeposito) {
      setPasosVisitados((prev) => marcarPasoVisitado(prev, "FOTOS_EGRESO"));
    }
  }, [servicio?.corralon, servicio?.encargadoDeposito]);

  // Load corralon assets to display the friendly human name in paso 3
  useEffect(() => {
    const listCorralones = async () => {
      try {
        const active = await corralonService.getCorralonesActivos();
        setCorralones(active);
      } catch (err) {
        console.error("Error cataloging corralones:", err);
      }
    };
    listCorralones();
  }, []);

  const handleLlegadaCompleted = (
    corralonId: string,
    encargado: string,
    geo?: { lat: number; lng: number }
  ) => {
    setSelectedCorralonId(corralonId);
    setEncargadoDeposito(encargado);
    if (geo) {
      setGeoCoords(geo);
    }
    setLlegadaRegistrada(true);
    setStep("FOTOS_EGRESO");
  };

  const handleFotosCompleted = (result: FotosLoteResult) => {
    setCapturedFotos(result);
    setStep("CONFIRMACION_FINAL");
    setPasosVisitados((prev) => marcarPasoVisitado(prev, "CONFIRMACION_FINAL"));
  };

  const handleFinalConfirm = async (observacionExtra: string) => {
    if (!userData?.servicioActivoId || !capturedFotos) return;
    setIsFinishing(true);
    setPageError(null);
    try {
      const observacion = [capturedFotos.comentario, observacionExtra.trim()]
        .filter(Boolean)
        .join(" · ");

      await servicioService.confirmarDesenganche(
        userData.servicioActivoId,
        capturedFotos.fotosMeta,
        observacion || undefined,
        capturedFotos.fotosBase64,
        capturedFotos.fotosSubidas
      );
      await limpiarBorradorFotos(claveBorradorFotos(userData.servicioActivoId, "desenganche"));
      await updateServicioActivo(null);

      navigate("/", { replace: true, state: { successMsg: "Servicio de secuestro cerrado con éxito. Grúa liberada." } });
    } catch (err: any) {
      console.error(err);
      const msg: string = err.message || "";
      if (
        msg.includes("ya fue registrado") ||
        msg.includes("ya fue entregado") ||
        servicio?.estado === "DESENGANCHADO"
      ) {
        await updateServicioActivo(null);
        navigate("/", {
          replace: true,
          state: { successMsg: "Servicio de secuestro cerrado con éxito. Grúa liberada." },
        });
        return;
      }
      setPageError(msg || "Fallo crítico al completar la confirmación del desenganche.");
    } finally {
      setIsFinishing(false);
    }
  };

  const showBlockingLoader =
    (profileLoading && !userData) || (serviceLoading && !servicio);

  if (showBlockingLoader) {
    return <LoadingSpinner fullScreen message="Cargando..." />;
  }

  if (!servicio) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center p-12 text-center max-w-sm mx-auto space-y-4">
          <p className="text-sm font-semibold text-brand-pale">No se encontró ningún servicio activo para su usuario.</p>
          <button
            onClick={() => navigate(rutaInicioPorRoles(userData?.roles ?? []))}
            className="px-4 py-2 bg-brand-cta hover:bg-brand-cta-hover text-white font-extrabold text-xs rounded-xl shadow-md shadow-brand-cta/15"
          >
            Volver al Menú
          </button>
        </div>
      </Layout>
    );
  }

  const activeCorralonName = corralones.find(c => c.id === selectedCorralonId)?.nombre || "Corralón Seleccionado";

  return (
    <Layout>
      <div className="w-full min-w-0 max-w-2xl mx-auto space-y-6 overflow-x-hidden">
        
        <div className="w-full min-w-0 bg-white border border-brand-seashell p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2 bg-brand-cta/10 text-brand-cta rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-brand-purply tracking-tight leading-snug">
                {step === "LLEGADA" && "1. Ubicación del desenganche"}
                {step === "FOTOS_EGRESO" && "2. Fotos del desenganche"}
                {step === "CONFIRMACION_FINAL" && "3. Cerrar acta"}
              </h1>
              <p className="text-[10px] text-brand-pale mt-1">
                {step === "LLEGADA" && "Corralón de entrega y ubicación GPS del desenganche."}
                {step === "FOTOS_EGRESO" && "Subí 4 fotos del vehículo."}
                {step === "CONFIRMACION_FINAL" && "Revise y confirme el cierre del servicio."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[9px] text-brand-pale font-bold bg-brand-bg px-2.5 py-1 rounded shrink-0 self-start sm:self-center">
            <span className={step === "LLEGADA" ? "text-brand-cta underline" : ""}>Ubicación</span>
            <span>•</span>
            <span className={step === "FOTOS_EGRESO" ? "text-brand-cta underline" : ""}>Fotos</span>
            <span>•</span>
            <span className={step === "CONFIRMACION_FINAL" ? "text-emerald-600 underline" : ""}>Acta</span>
          </div>
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold">{pageError}</p>
          </div>
        )}

        {/* Pasos montados en keep-alive: ocultos con CSS para conservar estado al volver */}
        {pasosVisitados.has("LLEGADA") && (
          <div className={step === "LLEGADA" ? undefined : "hidden"}>
            <LlegadaCorralon
              servicioId={servicio.id}
              geoEnganche={geoEngancheDeServicio(servicio)}
              initialCorralonId={selectedCorralonId}
              initialEncargado={encargadoDeposito}
              llegadaYaRegistrada={llegadaRegistrada}
              onCompleted={handleLlegadaCompleted}
              onBack={() => navigate("/traslado")}
              backLabel="Volver al traslado"
            />
          </div>
        )}

        {pasosVisitados.has("FOTOS_EGRESO") && (
          <div className={step === "FOTOS_EGRESO" ? undefined : "hidden"}>
            <FotoDesenganche
              servicioId={servicio.id}
              onCompleted={handleFotosCompleted}
              onBack={() => setStep("LLEGADA")}
              backLabel="Volver"
            />
          </div>
        )}

        {pasosVisitados.has("CONFIRMACION_FINAL") && capturedFotos && (
          <div className={step === "CONFIRMACION_FINAL" ? undefined : "hidden"}>
            <ConfirmacionFinal
              corralonId={selectedCorralonId}
              corralonNombre={activeCorralonName}
              encargadoDeposito={encargadoDeposito}
              fotos={capturedFotos.previewFotos}
              initialObservacion={capturedFotos.comentario ?? ""}
              onConfirm={handleFinalConfirm}
              onBack={() => setStep("FOTOS_EGRESO")}
              backLabel="Cambiar fotos"
              isSubmitting={isFinishing}
            />
          </div>
        )}

      </div>
    </Layout>
  );
};

export default DesenganchePage;
