import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";
import { puedeGestionarActas, rutaInicioPorRoles } from "@gruasbacar/shared";

interface GestionActasGuardProps {
  children: React.ReactNode;
}

export const GestionActasGuard: React.FC<GestionActasGuardProps> = ({ children }) => {
  const { userData, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen message="Validando permisos..." />;
  }

  if (!userData || !puedeGestionarActas(userData.roles)) {
    return <Navigate to={userData ? rutaInicioPorRoles(userData.roles) : "/login"} replace />;
  }

  return <>{children}</>;
};

export default GestionActasGuard;
