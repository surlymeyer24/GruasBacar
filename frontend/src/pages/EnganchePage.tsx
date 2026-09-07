import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { EngancheCaptura } from "../components/enganche/EngancheCaptura";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { AsignacionDiaria, esOperador, rutaInicioPorRoles, parseFirestoreLikeDate, displayPatente } from "@gruasbacar/shared";
import { asignacionDiariaVigente, limpiarConfigDiaOmitidaHoy } from "../utils/asignacionDiaria";
import { ConfiguracionDiaModal } from "../components/operador/ConfiguracionDiaModal";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { ShieldCheck } from "lucide-react";
import { isMock, db, esEntornoTest } from "../firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

export const EnganchePage: React.FC = () => {
  const { userData, updateServicioActivo, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [showConfigDia, setShowConfigDia] = useState(false);
  const [turnoLocal, setTurnoLocal] = useState<AsignacionDiaria | null>(null);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);

  const turnoRaw = asignacionDiariaVigente(userData?.asignacionDiaria) ?? turnoLocal;
  const [gruaDescResuelta, setGruaDescResuelta] = useState<string | null>(null);

  useEffect(() => {
    if (!turnoRaw?.gruaPatente || turnoRaw.gruaDescripcion || isMock || !db) {
      setGruaDescResuelta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const q = query(collection(db, "gruas"), where("patente", "==", turnoRaw.gruaPatente), limit(1));
      const snap = await getDocs(q);
      if (!cancelled && !snap.empty) {
        const desc = (snap.docs[0].data().descripcion as string | undefined)?.trim();
        if (desc) setGruaDescResuelta(desc);
      }
    })();
    return () => { cancelled = true; };
  }, [turnoRaw?.gruaPatente, turnoRaw?.gruaDescripcion]);

  const turnoHoy = turnoRaw && gruaDescResuelta && !turnoRaw.gruaDescripcion
    ? { ...turnoRaw, gruaDescripcion: gruaDescResuelta }
    : turnoRaw;
  const requiereConfigTurno = !turnoHoy && !userData?.servicioActivoId;

  const { servicio: activeServicio, loading: hookLoading } = useServicioActivo();

  useEffect(() => {
    if (!profileLoading) {
      if (!userData || !esOperador(userData.roles)) {
        navigate(rutaInicioPorRoles(userData?.roles ?? []), { replace: true });
        return;
      }

      if (!asignacionDiariaVigente(userData?.asignacionDiaria) && !userData?.servicioActivoId) {
        setShowConfigDia(true);
      }
    }
  }, [userData, profileLoading, navigate]);

  useEffect(() => {
    if (activeServicio) {
      if (activeServicio.estado === "EN_TRASLADO") {
        navigate("/traslado");
      } else if (activeServicio.estado === "DESENGANCHADO" || activeServicio.estado === "ANULADO") {
        updateServicioActivo(null);
      }
    } else if (!hookLoading && userData?.servicioActivoId) {
      updateServicioActivo(null);
    }
  }, [activeServicio, hookLoading]);

  const TIMEOUT_ENGANCHE_MS = 7 * 60 * 1000;
  useEffect(() => {
    if (!activeServicio || activeServicio.estado !== "ENGANCHADO") {
      setShowTimeoutModal(false);
      return;
    }
    const creadoEn = parseFirestoreLikeDate(activeServicio.creadoEn);
    if (!creadoEn) return;
    const elapsed = Date.now() - creadoEn.getTime();
    if (elapsed >= TIMEOUT_ENGANCHE_MS) {
      setShowTimeoutModal(true);
    } else {
      const timer = setTimeout(() => setShowTimeoutModal(true), TIMEOUT_ENGANCHE_MS - elapsed);
      return () => clearTimeout(timer);
    }
  }, [activeServicio]);

  const handleConfigDiaSaved = (asignacion: AsignacionDiaria) => {
    limpiarConfigDiaOmitidaHoy();
    setTurnoLocal(asignacion);
    setShowConfigDia(false);
  };

  const handleConfigDiaClose = () => {
    setShowConfigDia(false);
    navigate("/");
  };

  const handleServiceCreated = async (servicioId: string, patente: string) => {
    await updateServicioActivo(servicioId, {
      skipFetch: true,
      resumen: {
        id: servicioId,
        estado: "ENGANCHADO",
        patente,
        ...(esEntornoTest ? { esTest: true } : {}),
      },
    });
  };

  const handleCompletedFlow = () => {
    navigate("/traslado");
  };

  const showBlockingLoader =
    (profileLoading && !userData) || (hookLoading && !activeServicio && !!userData?.servicioActivoId);

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

      <ConfirmDialog
        isOpen={showTimeoutModal}
        onClose={async () => {
          try {
            await updateServicioActivo(null);
            navigate("/");
          } catch (e) {
            console.error(e);
            window.alert("No se pudo anular el enganche. Intentá de nuevo o contactá al administrador.");
          }
        }}
        onConfirm={() => setShowTimeoutModal(false)}
        title="Enganche abierto"
        message={<>Tu enganche de <span className="font-mono font-bold text-brand-cta">{displayPatente(activeServicio?.patente, activeServicio?.descripcionVehiculo)}</span> lleva más de 10 minutos. ¿Querés seguir con el servicio o anularlo?</>}
        confirmText="Sí, seguir"
        cancelText="Anular enganche"
        cancelDanger
        blocking
      />
      <div className="w-full min-w-0 max-w-2xl mx-auto space-y-6 overflow-x-hidden">

        {/* Header */}
        <div className="w-full min-w-0 bg-white border border-brand-seashell p-4 rounded-xl shadow-sm flex items-start gap-3">
          <div className="p-2 bg-brand-cta/10 text-brand-cta rounded-lg shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-black text-brand-purply tracking-tight leading-snug">
              Nuevo Enganche
            </h1>
            <p className="text-[10px] text-brand-pale mt-1">
              Ingresá la patente y sacá las 4 fotos del vehículo.
            </p>
          </div>
        </div>

        {!requiereConfigTurno && turnoHoy && (
          <EngancheCaptura
            turno={turnoHoy}
            userId={userData!.uid}
            userDisplayName={userData!.nombre}
            userLegajo={userData?.legajo}
            servicioActivoId={userData?.servicioActivoId}
            estadoServicio={activeServicio?.estado}
            onCompleted={handleCompletedFlow}
            onServiceCreated={handleServiceCreated}
            onBack={() => navigate("/")}
            backLabel="Volver al inicio"
          />
        )}
      </div>
    </Layout>
  );
};

export default EnganchePage;
