import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";
import { RolUsuario, esOperador, rutaInicioPorRoles, tieneRol } from "@gruasbacar/shared";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRole: RolUsuario;
  fallbackPath?: string;
}

function cumpleRolRequerido(roles: RolUsuario[], allowedRole: RolUsuario): boolean {
  if (allowedRole === "ENGANCHADOR" || allowedRole === "CHOFER") {
    return esOperador(roles);
  }
  return tieneRol(roles, allowedRole);
}

function destinoFallback(
  roles: RolUsuario[],
  allowedRole: RolUsuario,
  fallbackPath?: string
): string {
  if (fallbackPath) return fallbackPath;
  // Nunca rebotar a "/" si el usuario no es operador (evita bucles con HomeRoute).
  if ((allowedRole === "ENGANCHADOR" || allowedRole === "CHOFER") && !esOperador(roles)) {
    return rutaInicioPorRoles(roles);
  }
  if (allowedRole === "ADMIN" && !roles.includes("ADMIN")) {
    return esOperador(roles) ? "/" : rutaInicioPorRoles(roles);
  }
  return rutaInicioPorRoles(roles);
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  allowedRole,
  fallbackPath,
}) => {
  const { userData, sessionLoading, profileLoading } = useAuth();

  if (sessionLoading || (profileLoading && !userData)) {
    return <LoadingSpinner fullScreen message="Validando permisos..." />;
  }

  if (!userData) {
    return <Navigate to="/login" replace />;
  }

  if (!cumpleRolRequerido(userData.roles, allowedRole)) {
    return (
      <Navigate
        to={destinoFallback(userData.roles, allowedRole, fallbackPath)}
        replace
      />
    );
  }

  return <>{children}</>;
};

export default RoleGuard;
