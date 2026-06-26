import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { 
  Plus, 
  History, 
  Truck, 
  CalendarDays,
  Users,
  Shield,
  Pencil,
  Tag,
} from "lucide-react";
import { isMock, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getMockServices } from "../data/mockData";
import { Servicio, servicioActivoVigente, rutaFlujoOperadorPorEstado, ServicioActivoResumen } from "@gruasbacar/shared";
import { obtenerEstadisticasAdmin, AdminDashboardStats } from "../services/adminStats.service";
import { formatFechaLarga, formatHoraEnVivo } from "../utils/formatters";
import { asignacionDiariaVigente, configDiaFueOmitidaHoy, limpiarConfigDiaOmitidaHoy, marcarConfigDiaOmitidaHoy } from "../utils/asignacionDiaria";
import { ConfiguracionDiaModal } from "../components/operador/ConfiguracionDiaModal";
import { esOperador, labelTipoFlota, duplaEnganchadorDeAsignacion } from "@gruasbacar/shared";

function servicioDesdeResumen(resumen: ServicioActivoResumen | null | undefined): Servicio | null {
  if (!servicioActivoVigente(resumen)) return null;
  return {
    id: resumen!.id,
    patente: resumen!.patente,
    numeroInfraccion: resumen!.numeroInfraccion,
    estado: resumen!.estado,
  } as Servicio;
}

export const HomePage: React.FC = () => {
  const { userData, updateServicioActivo, sessionLoading, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [activeService, setActiveService] = useState<Servicio | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [showConfigDia, setShowConfigDia] = useState(false);

  const isAdmin = userData?.roles?.includes("ADMIN");
  const isEnganchador = userData ? esOperador(userData.roles) : false;
  const turnoHoy = asignacionDiariaVigente(userData?.asignacionDiaria);
  const authReady = !sessionLoading && !profileLoading;

  useEffect(() => {
    if (authReady && isEnganchador && !turnoHoy && !configDiaFueOmitidaHoy()) {
      setShowConfigDia(true);
    }
  }, [authReady, isEnganchador, turnoHoy]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authReady || !userData) return;

    const fromResumen = servicioDesdeResumen(userData.servicioActivoResumen);
    if (fromResumen) {
      setActiveService(fromResumen);
      return;
    }

    if (!userData.servicioActivoId) {
      setActiveService(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let srv: Servicio | undefined;
        if (!isMock && db) {
          const docSnap = await getDoc(doc(db, "servicios", userData.servicioActivoId!));
          if (docSnap.exists()) {
            srv = { ...(docSnap.data() as Servicio), id: docSnap.id };
          }
        } else {
          srv = getMockServices().find((s) => s.id === userData.servicioActivoId);
        }

        if (cancelled) return;

        if (srv && srv.estado !== "DESENGANCHADO" && srv.estado !== "ANULADO") {
          setActiveService(srv);
        } else {
          try {
            await updateServicioActivo(null);
          } catch (err) {
            console.error("Error al sincronizar servicio activo:", err);
          }
          setActiveService(null);
        }
      } catch (err) {
        console.error("Error loading active service details:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userData, authReady, updateServicioActivo]);

  if (sessionLoading || profileLoading) {
    return <LoadingSpinner fullScreen message="Sincronizando estado operacional..." />;
  }

  return (
    <Layout>
      <ConfiguracionDiaModal
        isOpen={showConfigDia}
        allowDismiss
        initialAsignacion={userData?.asignacionDiaria}
        onClose={() => {
          marcarConfigDiaOmitidaHoy();
          setShowConfigDia(false);
        }}
        onSaved={() => {
          limpiarConfigDiaOmitidaHoy();
          setShowConfigDia(false);
        }}
      />
      <div className="space-y-6">
        
        {/* Header Hero card */}
        <div className="relative py-6 px-6 bg-brand-purply text-white rounded-2xl shadow-xl border border-brand-cornflower/30 border-l-4 border-l-brand-cta">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-visible">
            <div className="min-w-0">
              <p className="text-brand-cta text-xs font-mono tracking-wider uppercase font-semibold">
                SISTEMA OPERACIONAL GRUAS BACAR
              </p>
              <h1 className="text-2xl font-bold tracking-tight mt-1">
                ¡Bienvenido/a, {userData?.nombre}!
              </h1>
              <p className="text-sm text-brand-seashell mt-1 max-w-xl">
                {isAdmin && isEnganchador
                  ? "Panel de control general: podés gestionar la flota y también registrar nuevos enganches."
                  : isAdmin 
                  ? "Panel de administración y auditoría de la flota de remolques y actas de secuestros estatales."
                  : "Listo para registrar nuevos enganches y traslados de vehículos infractores en la vía pública."}
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

        {/* DRIVER FLUX */}
        {isEnganchador && (
          <div className="max-w-md mx-auto space-y-6 py-4">

            {turnoHoy && (
              <div className="relative overflow-hidden bg-white rounded-2xl border border-brand-seashell shadow-sm">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-cta via-brand-cta/80 to-brand-cornflower/40" aria-hidden />

                <div className="p-4 pt-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 p-2.5 bg-brand-cta/10 rounded-xl border border-brand-cta/15">
                        <CalendarDays className="w-4 h-4 text-brand-cta" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-brand-purply tracking-tight">
                          Turno de hoy
                        </p>
                        <p className="text-[10px] text-brand-pale mt-0.5">
                          Asignación vigente
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowConfigDia(true)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-brand-cta hover:text-brand-cta-hover hover:bg-brand-cta/5 rounded-lg uppercase tracking-wide cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Cambiar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-2.5 p-2.5 bg-brand-bg rounded-xl border border-brand-seashell/60">
                      <div className="shrink-0 p-1.5 bg-white rounded-lg border border-brand-seashell/50">
                        <Tag className="w-3.5 h-3.5 text-brand-pale" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-brand-pale uppercase tracking-widest">Tipo</p>
                        <span className="inline-block mt-0.5 text-[10px] font-bold text-brand-cta bg-brand-cta/10 px-2 py-0.5 rounded-full border border-brand-cta/20 uppercase">
                          {labelTipoFlota(turnoHoy.tipoFlota)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-2.5 bg-brand-bg rounded-xl border border-brand-seashell/60">
                      <div className="shrink-0 p-1.5 bg-white rounded-lg border border-brand-seashell/50">
                        <Truck className="w-3.5 h-3.5 text-brand-pale" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-brand-pale uppercase tracking-widest">Grúa</p>
                        <p className="font-mono text-xs font-extrabold text-brand-purply tracking-wider truncate mt-0.5">
                          {turnoHoy.gruaPatente}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-2.5 bg-brand-bg rounded-xl border border-brand-seashell/60">
                      <div className="shrink-0 p-1.5 bg-white rounded-lg border border-brand-seashell/50">
                        <Shield className="w-3.5 h-3.5 text-brand-pale" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-brand-pale uppercase tracking-widest">Inspector</p>
                        <p className="text-xs font-semibold text-brand-purply truncate mt-0.5">
                          {turnoHoy.inspector}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-2 flex items-start gap-2.5 p-2.5 bg-brand-bg rounded-xl border border-brand-seashell/60">
                      <div className="shrink-0 p-1.5 bg-white rounded-lg border border-brand-seashell/50 mt-0.5">
                        <Users className="w-3.5 h-3.5 text-brand-pale" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-brand-pale uppercase tracking-widest">Dupla</p>
                        <p className="text-xs text-brand-purply mt-0.5 leading-snug">
                          <span className="font-semibold">{turnoHoy.duplaChofer}</span>
                          <span className="text-brand-pale mx-1.5">+</span>
                          <span className="font-semibold">{duplaEnganchadorDeAsignacion(turnoHoy)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Active Service Status Banner */}
            {activeService && (
              <div className="bg-brand-cta/5 border border-brand-cta/20 p-5 rounded-2xl space-y-4 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-brand-purply text-brand-cta rounded-xl shrink-0 border border-brand-cornflower/20">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-brand-purply uppercase tracking-wide">
                      Servicio Activo Detectado
                    </h3>
                    <p className="text-xs text-brand-pale mt-0.5">
                      Tienes un vehículo registrado en proceso de remolque. Puedes continuar la carga o resetear para comenzar de cero.
                    </p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-brand-seashell flex items-center justify-between gap-2 shadow-sm">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-brand-pale uppercase tracking-widest block">Vehículo</span>
                    <span className="font-mono text-sm font-extrabold text-brand-purply px-2 py-0.5 bg-brand-bg rounded border border-brand-seashell">
                      {activeService.patente}
                    </span>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] font-bold text-brand-pale uppercase tracking-widest block">Acta / Infracción</span>
                    <span className="font-mono text-xs font-semibold text-brand-purply block">
                      #{activeService.numeroInfraccion}
                    </span>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] font-bold text-brand-pale uppercase tracking-widest block">Estado</span>
                    <span className="text-[9px] font-bold bg-brand-cta/10 text-brand-cta px-2 py-0.5 rounded-full border border-brand-cta/20 uppercase font-mono">
                      {activeService.estado}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => {
                      if (activeService.estado === "ENGANCHADO") {
                        navigate("/enganche");
                      } else if (activeService.estado === "EN_TRASLADO") {
                        navigate("/traslado");
                      } else {
                        navigate(rutaFlujoOperadorPorEstado(activeService.estado));
                      }
                    }}
                    className="py-2.5 px-4 bg-brand-cta hover:bg-brand-cta-hover text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-brand-cta/10 active:scale-95"
                  >
                    Reanudar Proceso
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm("¿Seguro que desea liberar la grúa para este servicio activo? Podrá registrar un nuevo enganche.")) {
                        try {
                          await updateServicioActivo(null);
                          setActiveService(null);
                        } catch (e) {
                          console.error(e);
                          window.alert("No se pudo liberar la grúa. Intentá de nuevo o contactá al administrador.");
                        }
                      }
                    }}
                    className="py-2.5 px-4 bg-brand-bg hover:bg-brand-seashell/40 text-brand-purply font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-brand-seashell active:scale-95"
                  >
                    Liberar Grúa
                  </button>
                </div>
              </div>
            )}

            <div className="text-center py-12 px-6 bg-white rounded-2xl shadow-sm border border-brand-seashell border-t-4 border-t-brand-cta space-y-6">
              <div className="inline-flex p-4 bg-brand-cta/10 rounded-full text-brand-cta mx-auto">
                <Truck className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-brand-purply tracking-tight">
                  Hola, {userData?.nombre}
                </h2>
                <p className="text-xs text-brand-pale max-w-sm mx-auto font-sans">
                  Para iniciar el registro de un nuevo servicio de remolque en la vía pública, presione el botón de abajo.
                </p>
              </div>

              <button
                onClick={() => navigate("/enganche")}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-brand-cta hover:bg-brand-cta-hover text-white font-black rounded-xl shadow-lg shadow-brand-cta/15 transition-all text-sm cursor-pointer active:scale-95 uppercase tracking-wider"
                id="btn-nuevo-enganche"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
                NUEVO ENGANCHE
              </button>
              {!turnoHoy && (
                <p className="text-[10px] text-brand-pale font-medium">
                  Si aún no configuraste el turno de hoy, te lo pediremos al iniciar el enganche.
                </p>
              )}
              
              <div className="pt-6 border-t border-brand-seashell flex justify-center">
                <Link 
                  to="/historial" 
                  className="flex items-center gap-2 text-xs font-bold text-brand-cta hover:text-brand-cta-hover transition-colors uppercase tracking-wider"
                >
                  <History className="w-4 h-4" />
                  Ver Tu Historial De Servicios
                </Link>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default HomePage;
