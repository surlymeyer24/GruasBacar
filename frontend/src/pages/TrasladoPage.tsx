import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { useServicioActivo } from "../hooks/useServicioActivo";
import { PantallaTraslado } from "../components/traslado/PantallaTraslado";
import { esOperador, rutaInicioPorRoles } from "@gruasbacar/shared";

export const TrasladoPage: React.FC = () => {
  const { userData, profileLoading, updateServicioActivo } = useAuth();
  const navigate = useNavigate();

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
    if (servicio) {
      if (servicio.estado === "ENGANCHADO") {
        navigate("/enganche");
      } else if (servicio.estado === "DESENGANCHADO" || servicio.estado === "ANULADO") {
        updateServicioActivo(null).then(() => {
          navigate(rutaInicioPorRoles(userData?.roles ?? []), { replace: true });
        });
      }
    }
  }, [servicio, navigate, updateServicioActivo, userData?.roles]);

  const handleDesengancheClick = () => {
    navigate("/desenganche");
  };

  const showBlockingLoader =
    (profileLoading && !userData) || (serviceLoading && !servicio);

  if (showBlockingLoader) {
    return <LoadingSpinner fullScreen message="Sincronizando ruta de traslado activa..." />;
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

  return (
    <Layout>
      <PantallaTraslado
        servicio={servicio}
        onDesengancheClick={handleDesengancheClick}
      />
    </Layout>
  );
};

export default TrasladoPage;
