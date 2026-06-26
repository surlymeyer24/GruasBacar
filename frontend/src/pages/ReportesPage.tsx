import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ReportesPanel from "../components/reportes/ReportesPanel";
import { puedeVerHistorialCompleto, rutaInicioPorRoles } from "@gruasbacar/shared";

export const ReportesPage: React.FC = () => {
  const { userData, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen message="Cargando reportes..." />;
  }

  if (!userData) {
    return <Navigate to="/login" replace />;
  }

  if (!puedeVerHistorialCompleto(userData.roles)) {
    return <Navigate to={rutaInicioPorRoles(userData.roles)} replace />;
  }

  return (
    <Layout>
      <ReportesPanel />
    </Layout>
  );
};

export default ReportesPage;
