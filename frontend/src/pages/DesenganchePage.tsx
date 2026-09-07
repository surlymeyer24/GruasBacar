import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { DesengancheCaptura } from "../components/desenganche/DesengancheCaptura";
import { ConfirmacionFinal } from "../components/desenganche/ConfirmacionFinal";
import { DesengancheCompletado } from "../components/desenganche/DesengancheCompletado";
import { FotosLoteResult } from "../components/shared/FotoLoteUpload";
import { servicioService } from "../services/servicio.service";
import { limpiarBorradorFotos, claveBorradorFotos } from "../services/fotoCache.service";
import { esOperador, rutaInicioPorRoles, geoEngancheDeServicio, Servicio } from "@gruasbacar/shared";
import { corralonService } from "../services/corralon.service";
import { Corralon } from "@gruasbacar/shared";
import { ShieldAlert } from "lucide-react";
import { esErrorDeRed } from "../utils/firebaseError";
import { resolverLabelGrua, tipoFlotaDeServicio } from "../utils/gruaDisplay";

type PasosDesenganche = "CAPTURA" | "CONFIRMACION_FINAL" | "COMPLETADO";

export const DesenganchePage: React.FC = () => {
  const { userData, updateServicioActivo, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<PasosDesenganche>("CAPTURA");
  const [selectedCorralonId, setSelectedCorralonId] = useState("");
  const [corralones, setCorralones] = useState<Corralon[]>([]);
  const [capturedFotos, setCapturedFotos] = useState<FotosLoteResult | null>(null);
  const [llegadaRegistrada, setLlegadaRegistrada] = useState(false);

  const [isFinishing, setIsFinishing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [servicioCompletado, setServicioCompletado] = useState<Servicio | null>(null);
  const [corralonCompletadoNombre, setCorralonCompletadoNombre] = useState("");

  const { servicio, loading: serviceLoading } = useServicioActivo();
  const completadoRef = useRef(false);

  useEffect(() => {
    if (step === "COMPLETADO" || completadoRef.current) return;
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
  }, [userData, profileLoading, navigate, step]);

  useEffect(() => {
    if (step === "COMPLETADO" || completadoRef.current) return;
    if (!servicio) return;

    if (servicio.estado === "DESENGANCHADO") {
      updateServicioActivo(null)
        .catch((err) => console.error("Error al liberar servicio entregado:", err))
        .finally(() => {
          if (completadoRef.current) return;
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
          if (completadoRef.current) return;
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
    if (servicio.corralon) {
      setSelectedCorralonId(servicio.corralon);
      setLlegadaRegistrada(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const yaRegistrada = await servicioService.tieneEventoLlegadaCorralon(servicio.id);
        if (!cancelled && yaRegistrada) {
          if (servicio.corralon) setSelectedCorralonId(servicio.corralon);
          setLlegadaRegistrada(true);
        }
      } catch (err) {
        console.error("Error al verificar llegada al corralón:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [servicio]);

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

  const handleCapturaCompleted = (corralonId: string, fotos: FotosLoteResult) => {
    setSelectedCorralonId(corralonId);
    setLlegadaRegistrada(true);
    setCapturedFotos(fotos);
    setStep("CONFIRMACION_FINAL");
  };

  const confirmarConRetry = async (servicioId: string, observacion: string | undefined) => {
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await servicioService.confirmarDesenganche(
          servicioId,
          capturedFotos!.fotosMeta,
          observacion,
          capturedFotos!.fotosBase64,
          capturedFotos!.fotosSubidas
        );
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

  const handleFinalConfirm = async (observacionExtra: string) => {
    if (!userData?.servicioActivoId || !capturedFotos) return;
    setIsFinishing(true);
    setPageError(null);
    try {
      const observacion = [capturedFotos.comentario, observacionExtra.trim()]
        .filter(Boolean)
        .join(" · ");

      await confirmarConRetry(
        userData.servicioActivoId,
        observacion || undefined
      );

      completadoRef.current = true;
      if (servicio) {
        setServicioCompletado({ ...servicio, estado: "DESENGANCHADO" });
        setCorralonCompletadoNombre(activeCorralonName);
      }
      setStep("COMPLETADO");

      limpiarBorradorFotos(claveBorradorFotos(userData.servicioActivoId, "desenganche")).catch(console.warn);

      updateServicioActivo(null).catch((err) =>
        console.error("Error al liberar servicio activo:", err)
      );
    } catch (err: any) {
      console.error(err);
      const msg: string = err.message || "";
      if (
        msg.includes("ya fue registrado") ||
        msg.includes("ya fue entregado") ||
        servicio?.estado === "DESENGANCHADO"
      ) {
        completadoRef.current = true;
        if (servicio) {
          setServicioCompletado({ ...servicio, estado: "DESENGANCHADO" });
          setCorralonCompletadoNombre(activeCorralonName);
        }
        setStep("COMPLETADO");
        updateServicioActivo(null).catch((err2) =>
          console.error("Error al liberar servicio activo:", err2)
        );
        return;
      }
      setPageError(msg || "Fallo crítico al completar la confirmación del desenganche.");
    } finally {
      setIsFinishing(false);
    }
  };

  const showBlockingLoader =
    step !== "COMPLETADO" && ((profileLoading && !userData) || (serviceLoading && !servicio));

  if (showBlockingLoader) {
    return <LoadingSpinner fullScreen message="Cargando..." />;
  }

  if (!servicio && step !== "COMPLETADO") {
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

  const activeCorralon = corralones.find(c => c.id === selectedCorralonId);
  const activeCorralonName = activeCorralon?.nombre || "Corralón Seleccionado";

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
                {step === "CAPTURA" && "1. Destino y fotos del desenganche"}
                {step === "CONFIRMACION_FINAL" && "2. Cerrar acta"}
                {step === "COMPLETADO" && "Servicio completado"}
              </h1>
              <p className="text-[10px] text-brand-pale mt-1">
                {step === "CAPTURA" && "Seleccioná el destino y subí las 4 fotos del vehículo."}
                {step === "CONFIRMACION_FINAL" && "Revise y confirme el cierre del servicio."}
                {step === "COMPLETADO" && "El vehículo fue entregado. Podés compartir el acta."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[9px] text-brand-pale font-bold bg-brand-bg px-2.5 py-1 rounded shrink-0 self-start sm:self-center">
            <span className={step === "CAPTURA" ? "text-brand-cta underline" : ""}>Captura</span>
            <span>•</span>
            <span className={step === "CONFIRMACION_FINAL" ? "text-emerald-600 underline" : ""}>Acta</span>
            <span>•</span>
            <span className={step === "COMPLETADO" ? "text-emerald-600 underline" : ""}>Listo</span>
          </div>
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold">{pageError}</p>
          </div>
        )}

        {step === "CAPTURA" && servicio && (
          <DesengancheCaptura
            servicioId={servicio.id}
            geoEnganche={geoEngancheDeServicio(servicio)}
            initialCorralonId={selectedCorralonId}
            llegadaYaRegistrada={llegadaRegistrada}
            onCompleted={handleCapturaCompleted}
            onBack={() => navigate("/traslado")}
            backLabel="Volver al traslado"
          />
        )}

        {step === "CONFIRMACION_FINAL" && capturedFotos && (
          <ConfirmacionFinal
            corralonId={selectedCorralonId}
            corralonNombre={activeCorralonName}
            tipoDestino={activeCorralon?.tipo}
            fotos={capturedFotos.previewFotos}
            initialObservacion={capturedFotos.comentario ?? ""}
            onConfirm={handleFinalConfirm}
            onBack={() => setStep("CAPTURA")}
            backLabel="Cambiar fotos"
            isSubmitting={isFinishing}
          />
        )}

        {step === "COMPLETADO" && servicioCompletado && (
          <DesengancheCompletado
            servicio={servicioCompletado}
            corralonNombre={corralonCompletadoNombre}
            patenteGrua={resolverLabelGrua(servicioCompletado.grua)}
            tipoFlota={tipoFlotaDeServicio(servicioCompletado)}
            onVolverInicio={() => navigate("/", { replace: true, state: { successMsg: "Servicio de secuestro cerrado con éxito. Grúa liberada." } })}
          />
        )}

      </div>
    </Layout>
  );
};

export default DesenganchePage;
