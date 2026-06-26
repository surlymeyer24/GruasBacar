import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";
import { rutaInicioPorRoles } from "@gruasbacar/shared";

export const DefaultRedirect: React.FC = () => {
  const { userData, sessionLoading, profileLoading } = useAuth();

  if (sessionLoading || profileLoading) {
    return <LoadingSpinner fullScreen message="Redirigiendo..." />;
  }

  if (!userData) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={rutaInicioPorRoles(userData.roles)} replace />;
};

export default DefaultRedirect;
