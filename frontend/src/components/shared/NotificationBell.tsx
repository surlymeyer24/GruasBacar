import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { Notificacion, RUTA_NOTIF_TURNOS, RUTA_NOTIF_HISTORIAL } from "@gruasbacar/shared";
import { useNotifications } from "../../context/NotificationProvider";

function tiempoRelativo(creadaEn: unknown): string {
  const ms = (() => {
    if (!creadaEn) return 0;
    if (typeof creadaEn === "object" && creadaEn !== null && "toMillis" in creadaEn) {
      return (creadaEn as { toMillis: () => number }).toMillis();
    }
    const parsed = new Date(String(creadaEn)).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  })();
  if (!ms) return "";
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return `hace ${Math.floor(diffH / 24)} d`;
}

function rutaAccion(notif: Notificacion): string | null {
  const ruta = notif.datos?.accionRuta;
  if (ruta) return ruta;
  if (notif.tipo === "SOLICITUD_RECONFIG_TURNO") return RUTA_NOTIF_TURNOS;
  if (notif.tipo === "FOTO_SUBIDA_ERROR") {
    const servicioId = notif.datos?.servicioId;
    if (servicioId) return `${RUTA_NOTIF_HISTORIAL}?servicio=${encodeURIComponent(servicioId)}`;
    return RUTA_NOTIF_HISTORIAL;
  }
  if (notif.tipo === "CARNET_POR_VENCER_30D" || notif.tipo === "CARNET_POR_VENCER_15D" || notif.tipo === "CARNET_POR_VENCER_7D") {
    return "/documentacion";
  }
  return null;
}

export const NotificationBell: React.FC = () => {
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas } = useNotifications();
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!abierto) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [abierto]);

  const handleClickNotif = async (notif: Notificacion) => {
    if (!notif.leida) {
      try {
        await marcarLeida(notif.id);
      } catch (err) {
        console.error(err);
      }
    }
    const ruta = rutaAccion(notif);
    if (ruta) {
      setAbierto(false);
      navigate(ruta);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative p-2 rounded-lg text-brand-seashell/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        aria-label={`Notificaciones${noLeidas > 0 ? `, ${noLeidas} sin leer` : ""}`}
      >
        <Bell className="w-5 h-5" />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-brand-cta text-[10px] font-bold text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-brand-seashell shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-brand-seashell bg-brand-seashell/30">
            <p className="text-xs font-bold text-brand-purply uppercase tracking-wide">
              Notificaciones
            </p>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodasLeidas().catch(console.error)}
                className="flex items-center gap-1 text-[10px] font-semibold text-brand-cta hover:text-brand-cta-hover cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="px-4 py-6 text-xs text-center text-brand-pale">
                No tenés notificaciones
              </p>
            ) : (
              <ul className="divide-y divide-brand-seashell/60">
                {notificaciones.map((notif) => (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotif(notif)}
                      className={`w-full text-left px-3 py-3 hover:bg-brand-seashell/20 transition-colors cursor-pointer ${
                        !notif.leida ? "bg-brand-cta/5" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-brand-purply leading-snug">
                          {notif.titulo}
                        </p>
                        {!notif.leida && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-brand-cta mt-1" />
                        )}
                      </div>
                      <p className="text-[11px] text-brand-pale mt-1 line-clamp-2">
                        {notif.cuerpo}
                      </p>
                      <p className="text-[10px] text-brand-pale/70 mt-1">
                        {tiempoRelativo(notif.creadaEn)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(notificaciones.some((n) => n.tipo === "SOLICITUD_RECONFIG_TURNO") ||
            notificaciones.some((n) => n.tipo === "FOTO_SUBIDA_ERROR") ||
            notificaciones.some((n) => n.tipo === "CARNET_POR_VENCER_30D" || n.tipo === "CARNET_POR_VENCER_15D" || n.tipo === "CARNET_POR_VENCER_7D")) && (
            <div className="border-t border-brand-seashell px-3 py-2 bg-brand-seashell/20 flex flex-wrap gap-3">
              {notificaciones.some((n) => n.tipo === "SOLICITUD_RECONFIG_TURNO") && (
                <Link
                  to={RUTA_NOTIF_TURNOS}
                  onClick={() => setAbierto(false)}
                  className="text-[11px] font-semibold text-brand-cta hover:underline"
                >
                  Ir a Turnos
                </Link>
              )}
              {notificaciones.some((n) => n.tipo === "FOTO_SUBIDA_ERROR") && (
                <Link
                  to={RUTA_NOTIF_HISTORIAL}
                  onClick={() => setAbierto(false)}
                  className="text-[11px] font-semibold text-brand-cta hover:underline"
                >
                  Ir a Historial
                </Link>
              )}
              {notificaciones.some((n) => n.tipo === "CARNET_POR_VENCER_30D" || n.tipo === "CARNET_POR_VENCER_15D" || n.tipo === "CARNET_POR_VENCER_7D") && (
                <Link
                  to="/documentacion"
                  onClick={() => setAbierto(false)}
                  className="text-[11px] font-semibold text-brand-cta hover:underline"
                >
                  Ir a Documentación
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
