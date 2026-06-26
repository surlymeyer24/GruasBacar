import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../shared/LoadingSpinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading: sessionLoading } = useAuth();
  const location = useLocation();

  if (sessionLoading) {
    return <LoadingSpinner fullScreen message="Verificando sesión..." />;
  }

  if (!user) {
    // Save target route for redirecting back after sign in
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
