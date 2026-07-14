import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { EngancheCaptura } from "../components/enganche/EngancheCaptura";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { AsignacionDiaria, esOperador, rutaInicioPorRoles } from "@gruasbacar/shared";
import { asignacionDiariaVigente, limpiarConfigDiaOmitidaHoy } from "../utils/asignacionDiaria";
import { ConfiguracionDiaModal } from "../components/operador/ConfiguracionDiaModal";
import { ShieldCheck } from "lucide-react";

export const EnganchePage: React.FC = () => {
  const { userData, updateServicioActivo, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [showConfigDia, setShowConfigDia] = useState(false);
  const [turnoLocal, setTurnoLocal] = useState<AsignacionDiaria | null>(null);

  const turnoHoy = asignacionDiariaVigente(userData?.asignacionDiaria) ?? turnoLocal;
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
