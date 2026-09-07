import React, { Suspense, lazy } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { ServicioActivoProvider } from "./context/ServicioActivoProvider";
import LoadingSpinner from "./components/shared/LoadingSpinner";

// Components (eager: gates / routing shell)
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleGuard from "./components/auth/RoleGuard";
import HomeRoute from "./components/auth/HomeRoute";
import DefaultRedirect from "./components/auth/DefaultRedirect";
import GestionActasGuard from "./components/auth/GestionActasGuard";
import EntornoTestBanner from "./components/shared/EntornoTestBanner";
import EntornoEmuladorBanner from "./components/shared/EntornoEmuladorBanner";

// Login queda eager (ruta pública)
import LoginPage from "./pages/LoginPage";

const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const SupervisorDashboardPage = lazy(() => import("./pages/SupervisorDashboardPage"));
const NuevaActaManualPage = lazy(() => import("./pages/NuevaActaManualPage"));
const EnganchePage = lazy(() => import("./pages/EnganchePage"));
const TrasladoPage = lazy(() => import("./pages/TrasladoPage"));
const DesenganchePage = lazy(() => import("./pages/DesenganchePage"));
const HistorialPage = lazy(() => import("./pages/HistorialPage"));
const MisActasPage = lazy(() => import("./pages/MisActasPage"));
const ReportesPage = lazy(() => import("./pages/ReportesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const TurnosPage = lazy(() => import("./pages/TurnosPage"));
const DocumentacionPage = lazy(() => import("./pages/DocumentacionPage"));

function RouteFallback() {
  return <LoadingSpinner fullScreen message="Cargando..." />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
      <ServicioActivoProvider>
      <EntornoEmuladorBanner />
      <EntornoTestBanner />
      <HashRouter>
        <Suspense fallback={<RouteFallback />}>
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
        </Suspense>
      </HashRouter>
      </ServicioActivoProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
