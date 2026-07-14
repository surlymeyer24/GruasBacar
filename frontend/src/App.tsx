import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { ServicioActivoProvider } from "./context/ServicioActivoProvider";

// Components
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleGuard from "./components/auth/RoleGuard";
import HomeRoute from "./components/auth/HomeRoute";
import DefaultRedirect from "./components/auth/DefaultRedirect";

// Pages
import LoginPage from "./pages/LoginPage";

import AdminDashboardPage from "./pages/AdminDashboardPage";
import SupervisorDashboardPage from "./pages/SupervisorDashboardPage";
import NuevaActaManualPage from "./pages/NuevaActaManualPage";
import GestionActasGuard from "./components/auth/GestionActasGuard";
import EnganchePage from "./pages/EnganchePage";
import TrasladoPage from "./pages/TrasladoPage";
import DesenganchePage from "./pages/DesenganchePage";
import HistorialPage from "./pages/HistorialPage";
import MisActasPage from "./pages/MisActasPage";
import ReportesPage from "./pages/ReportesPage";
import AdminPage from "./pages/AdminPage";
import TurnosPage from "./pages/TurnosPage";
import DocumentacionPage from "./pages/DocumentacionPage";

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
      <ServicioActivoProvider>
      <HashRouter>
        <Routes>
          {/* Public Routes */}

          <Route path="/login" element={<LoginPage />} />

          {/* Secure Portal Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomeRoute />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ADMIN">
                  <AdminDashboardPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/supervisor-dashboard"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="SUPERVISOR">
                  <SupervisorDashboardPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/supervisor/nueva-acta"
            element={
              <ProtectedRoute>
                <GestionActasGuard>
                  <NuevaActaManualPage />
                </GestionActasGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/enganche"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ENGANCHADOR" fallbackPath="/admin-dashboard">
                  <EnganchePage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/traslado"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ENGANCHADOR" fallbackPath="/admin-dashboard">
                  <TrasladoPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/desenganche"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ENGANCHADOR" fallbackPath="/admin-dashboard">
                  <DesenganchePage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/historial"
            element={
              <ProtectedRoute>
                <HistorialPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mis-actas"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ENGANCHADOR" fallbackPath="/historial">
                  <MisActasPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reportes"
            element={
              <ProtectedRoute>
                <ReportesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ADMIN">
                  <AdminPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/turnos"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ADMIN">
                  <TurnosPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          <Route
            path="/documentacion"
            element={
              <ProtectedRoute>
                <RoleGuard allowedRole="ADMIN">
                  <DocumentacionPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          {/* Fallback unknown paths */}
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </HashRouter>
      </ServicioActivoProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
