import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";
import { esOperador, rutaInicioPorRoles } from "@gruasbacar/shared";
import HomePage from "../../pages/HomePage";

/** Home operador; admin sin rol de campo va al dashboard admin. */
export const HomeRoute: React.FC = () => {
  const { userData, sessionLoading, profileLoading } = useAuth();

  if (sessionLoading || profileLoading) {
    return <LoadingSpinner fullScreen message="Cargando..." />;
  }

  if (!userData) {
    return <Navigate to="/login" replace />;
  }

  if (!esOperador(userData.roles)) {
    return <Navigate to={rutaInicioPorRoles(userData.roles)} replace />;
  }

  return <HomePage />;
};

export default HomeRoute;
