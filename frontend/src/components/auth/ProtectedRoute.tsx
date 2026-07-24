import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, pendienteActivacion, sessionLoading, logout } = useAuth();
  const location = useLocation();

  if (sessionLoading) {
    return <LoadingSpinner fullScreen message="Verificando sesión..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (pendienteActivacion) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{
          maxWidth: 420,
          background: "#fff",
          borderRadius: 12,
          padding: "2.5rem 2rem",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#128274;</div>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem", color: "#1a1a1a" }}>
            Cuenta pendiente de activación
          </h2>
          <p style={{ margin: "0 0 1.5rem", color: "#555", lineHeight: 1.5 }}>
            Tu cuenta fue creada pero todavía no está habilitada para operar.
            Contactá al administrador para que te dé de alta en el sistema.
          </p>
          <button
            onClick={() => logout()}
            style={{
              padding: "0.6rem 1.5rem",
              border: "none",
              borderRadius: 8,
              background: "#e53e3e",
              color: "#fff",
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
