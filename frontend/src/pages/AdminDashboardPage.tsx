import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { 
  Settings, 
  History, 
  Truck, 
  Link2,
  Route,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { isMock, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getMockServices } from "../data/mockData";
import { Servicio, duplaEnganchadorDeAsignacion } from "@gruasbacar/shared";
import { obtenerEstadisticasAdmin, AdminDashboardStats } from "../services/adminStats.service";
import { formatFechaLarga, formatHoraEnVivo } from "../utils/formatters";
import { esOperador } from "@gruasbacar/shared";
import { asignacionDiariaVigente, configDiaFueOmitidaHoy, limpiarConfigDiaOmitidaHoy, marcarConfigDiaOmitidaHoy } from "../utils/asignacionDiaria";
import { ConfiguracionDiaModal } from "../components/operador/ConfiguracionDiaModal";

export const AdminDashboardPage: React.FC = () => {
  const { userData, updateServicioActivo, loading } = useAuth();
  const navigate = useNavigate();

  const [activeService, setActiveService] = useState<Servicio | null>(null);
  const [loadingActiveService, setLoadingActiveService] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);
  const [loadingAdminStats, setLoadingAdminStats] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [showConfigDia, setShowConfigDia] = useState(false);

  const isAdmin = userData?.roles?.includes("ADMIN");
  const isEnganchador = userData ? esOperador(userData.roles) : false;


  useEffect(() => {
    if (loading || !isAdmin || isMock) return;

    let cancelled = false;
    setLoadingAdminStats(true);
    obtenerEstadisticasAdmin()
      .then((stats) => {
        if (!cancelled) setAdminStats(stats);
      })
      .catch((err) => {
        console.error("Error cargando estadísticas admin:", err);
        if (!cancelled) setAdminStats({ actasEnEnganche: 0, actasEnTraslado: 0, actasFinalizadas: 0, actasEsteMes: 0, mesActualLabel: "", gruasActivas: 0, gruasEnOperacion: 0, serviciosActivos: [], usuariosEnTurno: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingAdminStats(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, loading, isMock]);

  if (loading) {
    return <LoadingSpinner fullScreen message="Sincronizando estado operacional..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        
        {/* Header Hero card */}
        <div className="relative py-6 px-6 bg-brand-purply text-white rounded-2xl shadow-xl border border-brand-cornflower/30 border-l-4 border-l-brand-cta">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-visible">
            <div className="min-w-0">
              <p className="text-brand-cta text-xs font-mono tracking-wider uppercase font-semibold">
                SISTEMA OPERACIONAL GRUAS BACAR
              </p>
              <h1 className="text-2xl font-bold tracking-tight mt-1">
                Dashboard de Administración
              </h1>
              <p className="text-sm text-brand-seashell mt-1 max-w-xl">
                Panel de administración y auditoría de la flota de remolques y actas de secuestros estatales.
              </p>
            </div>
            <div
              className="shrink-0 overflow-x-auto overflow-y-visible md:text-right max-w-full"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-sm text-brand-seashell whitespace-nowrap">
                {formatFechaLarga(now)}
              </p>
              <p className="text-xl font-mono font-semibold text-brand-cta tracking-wide whitespace-nowrap mt-0.5">
                {formatHoraEnVivo(now)}
              </p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-[50%] h-full bg-radial-gradient from-brand-cta/10 to-transparent pointer-events-none" />
        </div>

          <div className="space-y-6">
            
            {/* Quick Indicators Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-stretch">
              <Link
                to="/reportes"
                className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-violet-500 shadow-sm hover:shadow-md hover:border-violet-300 transition-all flex items-center justify-between gap-4 cursor-pointer"
              >
                <div>
                  <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas este mes</p>
                  <p className="text-2xl font-black text-brand-purply mt-1">
                    {loadingAdminStats ? "—" : (adminStats?.actasEsteMes ?? 0)}
                  </p>
                  <p className="text-[10px] text-brand-pale mt-0.5 capitalize">
                    {adminStats?.mesActualLabel ?? "—"}
                  </p>
                </div>
                <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0">
                  <CalendarDays className="w-6 h-6" />
                </div>
              </Link>

              <div className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas en Enganche</p>
                  <p className="text-2xl font-black text-brand-purply mt-1">
                    {loadingAdminStats ? "—" : (adminStats?.actasEnEnganche ?? 0)}
                  </p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Link2 className="w-6 h-6" />
                </div>
              </div>

              <div className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-brand-cta shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas en Traslado</p>
                  <p className="text-2xl font-black text-brand-purply mt-1">
                    {loadingAdminStats ? "—" : (adminStats?.actasEnTraslado ?? 0)}
                  </p>
                </div>
                <div className="p-3 bg-brand-cta/10 text-brand-cta rounded-xl shrink-0">
                  <Route className="w-6 h-6" />
                </div>
              </div>

              <div className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas Finalizadas</p>
                  <p className="text-2xl font-black text-brand-purply mt-1">
                    {loadingAdminStats ? "—" : (adminStats?.actasFinalizadas ?? 0)}
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              <div className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-brand-cornflower shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Grúas en Operación</p>
                  <p className="text-2xl font-black text-brand-purply mt-1">
                    {loadingAdminStats
                      ? "—"
                      : `${adminStats?.gruasEnOperacion ?? 0} de ${adminStats?.gruasActivas ?? 0}`}
                  </p>
                  <p className="text-[10px] text-brand-pale mt-0.5">Activas con servicio / flota habilitada</p>
                </div>
                <div className="p-3 bg-brand-cta/10 text-brand-cta rounded-xl shrink-0">
                  <Truck className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Monitoreo en Vivo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 bg-white rounded-2xl border border-brand-seashell shadow-sm overflow-hidden flex flex-col max-h-96">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <h3 className="text-sm font-bold text-brand-purply uppercase tracking-widest">Actas Abiertas ({adminStats?.serviciosActivos?.length ?? 0})</h3>
                </div>
                <div className="space-y-3 overflow-y-auto pr-1 pb-1">
                  {loadingAdminStats ? (
                    <p className="text-xs text-brand-pale text-center py-2">Cargando...</p>
                  ) : adminStats?.serviciosActivos?.length === 0 ? (
                    <p className="text-xs text-brand-pale text-center py-4 bg-brand-bg rounded-xl border border-brand-seashell border-dashed">No hay actas en curso.</p>
                  ) : (
                    adminStats?.serviciosActivos?.map((s, idx) => (
                      <div key={s.id ?? `${s.patente}-${s.numeroInfraccion}-${idx}`} className="p-3 bg-brand-bg rounded-xl border border-brand-seashell flex justify-between items-center hover:border-brand-cta/30 transition-colors">
                        <div>
                          <p className="font-mono text-sm font-bold text-brand-purply">{s.patente}</p>
                          <p className="text-[10px] text-brand-pale">Grúa: <span className="font-bold">{s.grua}</span> • N°: {s.numeroInfraccion}</p>
                        </div>
                        <span className="text-[9px] font-bold bg-brand-cta/10 text-brand-cta px-2 py-0.5 rounded-full border border-brand-cta/20 uppercase font-mono">
                          {s.estado.replace("_", " ")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-5 bg-white rounded-2xl border border-brand-seashell shadow-sm overflow-hidden flex flex-col max-h-96">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <h3 className="text-sm font-bold text-brand-purply uppercase tracking-widest">Operadores en Turno ({adminStats?.usuariosEnTurno?.length ?? 0})</h3>
                </div>
                <div className="space-y-3 overflow-y-auto pr-1 pb-1">
                  {loadingAdminStats ? (
                    <p className="text-xs text-brand-pale text-center py-2">Cargando...</p>
                  ) : adminStats?.usuariosEnTurno?.length === 0 ? (
                    <p className="text-xs text-brand-pale text-center py-4 bg-brand-bg rounded-xl border border-brand-seashell border-dashed">No hay operadores en turno hoy.</p>
                  ) : (
                    adminStats?.usuariosEnTurno?.map((u, idx) => (
                      <div key={u.uid ?? `turno-${idx}`} className="p-3 bg-brand-bg rounded-xl border border-brand-seashell hover:border-brand-cta/30 transition-colors">
                        <p className="font-sans text-sm font-bold text-brand-purply">{u.nombre}</p>
                        {u.asignacionDiaria ? (
                          <p className="text-[10px] text-brand-pale mt-0.5">Grúa: <span className="font-bold text-brand-purply/80">{u.asignacionDiaria.gruaPatente}</span> • D: {u.asignacionDiaria.duplaChofer} + {duplaEnganchadorDeAsignacion(u.asignacionDiaria)}</p>
                        ) : (
                          <p className="text-[10px] text-brand-pale mt-0.5">Servicio activo pero sin turno asignado</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Admin Command Portal links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="flex flex-col justify-between p-6 bg-white rounded-2xl border border-brand-seashell text-left hover:border-brand-cta/30 transition-colors shadow-sm hover:shadow-md">
                <div className="space-y-2">
                  <div className="p-3 bg-brand-cta text-white rounded-xl w-12 h-12 flex items-center justify-center shadow-md shadow-brand-cta/20">
                    <Settings className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-brand-purply pt-2">
                    Configuración de Flota
                  </h3>
                  <p className="text-sm text-brand-pale">
                    Administre los vehículos grúa asignados, inspectores actuantes, y configure las coordenadas de los corralones.
                  </p>
                </div>
                <Link
                  to="/admin"
                  className="mt-6 block w-full py-3 px-4 rounded-xl text-sm font-bold text-center bg-brand-cta/10 text-brand-cta border border-brand-cta/20 hover:bg-brand-cta hover:text-white transition-all cursor-pointer"
                >
                  Configurar flota
                </Link>
              </div>

              <div className="flex flex-col justify-between p-6 bg-white rounded-2xl border border-brand-seashell text-left hover:border-brand-cta/30 transition-colors shadow-sm hover:shadow-md">
                <div className="space-y-2">
                  <div className="p-3 bg-brand-cta text-white rounded-xl w-12 h-12 flex items-center justify-center shadow-md shadow-brand-cta/20">
                    <History className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-brand-purply pt-2">
                    Auditoría de Servicios
                  </h3>
                  <p className="text-sm text-brand-pale">
                    Inspeccione en tiempo real las actas digitales de secuestro, descargue reportes del estado de fotos guardadas.
                  </p>
                </div>
                <Link
                  to="/historial"
                  className="mt-6 block w-full py-3 px-4 rounded-xl text-sm font-bold text-center bg-brand-cta/10 text-brand-cta border border-brand-cta/20 hover:bg-brand-cta hover:text-white transition-all cursor-pointer"
                >
                  Consultar actas
                </Link>
              </div>

            </div>

          </div>
      </div>
    </Layout>
  );
};

export default AdminDashboardPage;
