import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Truck, Link2, Route, CheckCircle2, CalendarDays } from "lucide-react";
import { isMock } from "../firebase";
import { Grua, duplaEnganchadorDeAsignacion, displayPatente, labelTipoFlota } from "@gruasbacar/shared";
import { obtenerEstadisticasAdmin, AdminDashboardStats } from "../services/adminStats.service";
import { formatFechaLarga, formatHoraEnVivo } from "../utils/formatters";
import { gruaService } from "../services/grua.service";
import { resolverDescripcionGrua, resolverPatenteGrua } from "../utils/gruaDisplay";

export const SupervisorDashboardPage: React.FC = () => {
  const { userData, sessionLoading, profileLoading } = useAuth();
  const authPending = sessionLoading || (profileLoading && !userData);

  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [gruasCatalog, setGruasCatalog] = useState<Grua[]>([]);
  const [now, setNow] = useState(() => new Date());

  const etiquetaGrua = (gruaId: string) => {
    const desc = resolverDescripcionGrua(gruaId, gruasCatalog);
    const pat = resolverPatenteGrua(gruaId, gruasCatalog);
    return { desc, pat, mostrarPatente: desc !== pat && pat !== "—" };
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authPending || isMock) return;

    let cancelled = false;
    setLoadingStats(true);
    obtenerEstadisticasAdmin()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        console.error("Error cargando estadísticas de supervisión:", err);
        if (!cancelled) {
          setStats({
            actasEnEnganche: 0,
            actasEnTraslado: 0,
            actasFinalizadas: 0,
            actasEsteMes: 0,
            mesActualLabel: "",
            gruasActivas: 0,
            gruasEnOperacion: 0,
            serviciosActivos: [],
            usuariosEnTurno: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });

    gruaService
      .getAllGruas()
      .then((gruas) => {
        if (!cancelled) setGruasCatalog(gruas);
      })
      .catch((err) => console.error("Error cargando catálogo de grúas:", err));

    return () => {
      cancelled = true;
    };
  }, [authPending, isMock]);

  if (authPending) {
    return <LoadingSpinner fullScreen message="Cargando panel de supervisión..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="relative py-6 px-6 bg-brand-purply text-white rounded-2xl shadow-xl border border-brand-cornflower/30 border-l-4 border-l-brand-cta">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-visible">
            <div className="min-w-0">
              <p className="text-brand-cta text-xs font-mono tracking-wider uppercase font-semibold">
                SISTEMA OPERACIONAL GRUAS BACAR
              </p>
              <h1 className="text-2xl font-bold tracking-tight mt-1">
                Dashboard de Supervisión
              </h1>
              <p className="text-sm text-brand-seashell mt-1 max-w-xl">
                Monitoreo en tiempo real de la flota y consulta de actas de servicio.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-stretch">
            <Link
              to="/reportes"
              className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-violet-500 shadow-sm hover:shadow-md hover:border-violet-300 transition-all flex items-center justify-between gap-4 cursor-pointer"
            >
              <div>
                <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas este mes</p>
                <p className="text-2xl font-black text-brand-purply mt-1">
                  {loadingStats ? "—" : (stats?.actasEsteMes ?? 0)}
                </p>
                <p className="text-[10px] text-brand-pale mt-0.5 capitalize">
                  {stats?.mesActualLabel ?? "—"}
                </p>
              </div>
              <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
            </Link>

            <Link
              to="/historial"
              className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-amber-500 shadow-sm hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between gap-4 cursor-pointer"
            >
              <div>
                <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas en Enganche</p>
                <p className="text-2xl font-black text-brand-purply mt-1">
                  {loadingStats ? "—" : (stats?.actasEnEnganche ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <Link2 className="w-6 h-6" />
              </div>
            </Link>

            <Link
              to="/historial"
              className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-brand-cta shadow-sm hover:shadow-md hover:border-brand-cta/30 transition-all flex items-center justify-between gap-4 cursor-pointer"
            >
              <div>
                <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas en Traslado</p>
                <p className="text-2xl font-black text-brand-purply mt-1">
                  {loadingStats ? "—" : (stats?.actasEnTraslado ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-brand-cta/10 text-brand-cta rounded-xl shrink-0">
                <Route className="w-6 h-6" />
              </div>
            </Link>

            <Link
              to="/historial"
              className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex items-center justify-between gap-4 cursor-pointer"
            >
              <div>
                <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Actas Finalizadas</p>
                <p className="text-2xl font-black text-brand-purply mt-1">
                  {loadingStats ? "—" : (stats?.actasFinalizadas ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </Link>

            <div className="p-5 bg-white rounded-2xl border border-brand-seashell border-l-4 border-l-brand-cta shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-brand-pale uppercase tracking-widest">Grúas en Operación</p>
                <p className="text-2xl font-black text-brand-purply mt-1">
                  {loadingStats
                    ? "—"
                    : `${stats?.gruasEnOperacion ?? 0} de ${stats?.gruasActivas ?? 0}`}
                </p>
                <p className="text-[10px] text-brand-pale mt-0.5">Con turno configurado hoy / flota habilitada</p>
              </div>
              <div className="p-3 bg-brand-cta/10 text-brand-cta rounded-xl shrink-0">
                <Truck className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white rounded-2xl border border-brand-seashell shadow-sm overflow-hidden flex flex-col max-h-96">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-bold text-brand-purply uppercase tracking-widest">
                  Actas Abiertas ({stats?.serviciosActivos?.length ?? 0})
                </h3>
              </div>
              <div className="space-y-3 overflow-y-auto scrollbar-hide pr-1 pb-1">
                {loadingStats ? (
                  <p className="text-xs text-brand-pale text-center py-2">Cargando...</p>
                ) : stats?.serviciosActivos?.length === 0 ? (
                  <p className="text-xs text-brand-pale text-center py-4 bg-brand-bg rounded-xl border border-brand-seashell border-dashed">
                    No hay actas en curso.
                  </p>
                ) : (
                  stats?.serviciosActivos?.map((s, idx) => {
                    const grua = etiquetaGrua(s.grua);
                    return (
                    <div
                      key={s.id ?? `${s.patente}-${s.numeroInfraccion}-${idx}`}
                      className="p-3 bg-brand-bg rounded-xl border border-brand-seashell flex justify-between items-center hover:border-brand-cta/30 transition-colors"
                    >
                      <div>
                        <p className="font-mono text-sm font-bold text-brand-purply">{displayPatente(s.patente, s.descripcionVehiculo)}</p>
                        <p className="text-[10px] text-brand-pale">
                          Grúa:{" "}
                          <span className="font-bold text-brand-purply/80">
                            {grua.desc}
                            {grua.mostrarPatente ? (
                              <span className="font-mono text-brand-pale/70 ml-1">({grua.pat})</span>
                            ) : null}
                          </span>
                          {s.numeroInfraccion ? ` • N°: ${s.numeroInfraccion}` : ""}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold bg-brand-cta/10 text-brand-cta px-2 py-0.5 rounded-full border border-brand-cta/20 uppercase font-mono">
                        {s.estado.replace("_", " ")}
                      </span>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-5 bg-white rounded-2xl border border-brand-seashell shadow-sm overflow-hidden flex flex-col max-h-96">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-bold text-brand-purply uppercase tracking-widest">
                  Operadores en Turno ({stats?.usuariosEnTurno?.length ?? 0})
                </h3>
              </div>
              <div className="space-y-3 overflow-y-auto scrollbar-hide pr-1 pb-1">
                {loadingStats ? (
                  <p className="text-xs text-brand-pale text-center py-2">Cargando...</p>
                ) : stats?.usuariosEnTurno?.length === 0 ? (
                  <p className="text-xs text-brand-pale text-center py-4 bg-brand-bg rounded-xl border border-brand-seashell border-dashed">
                    No hay operadores en turno hoy.
                  </p>
                ) : (
                  stats?.usuariosEnTurno?.map((u, idx) => (
                    <div
                      key={u.uid ?? `turno-${idx}`}
                      className="p-3 bg-brand-bg rounded-xl border border-brand-seashell hover:border-brand-cta/30 transition-colors"
                    >
                      <p className="font-sans text-sm font-bold text-brand-purply">{u.nombre}</p>
                      {u.asignacionDiaria ? (
                        <p className="text-[10px] text-brand-pale mt-0.5">
                          Grúa:{" "}
                          <span className="font-bold text-brand-purply/80">
                            {u.asignacionDiaria.gruaDescripcion || u.asignacionDiaria.gruaPatente}{u.asignacionDiaria.gruaDescripcion && u.asignacionDiaria.gruaPatente ? <span className="font-mono text-brand-pale/70 ml-1">({u.asignacionDiaria.gruaPatente})</span> : null}
                          </span>{" "}
                          {u.asignacionDiaria.tipoFlota ? <span className="bg-brand-bg px-1.5 py-0.5 rounded text-[9px] font-medium text-brand-purply border border-brand-seashell">{labelTipoFlota(u.asignacionDiaria.tipoFlota)}</span> : null}{" "}
                          • D: {u.asignacionDiaria.duplaChofer} +{" "}
                          {duplaEnganchadorDeAsignacion(u.asignacionDiaria)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-brand-pale mt-0.5">
                          Servicio activo pero sin turno asignado
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SupervisorDashboardPage;
