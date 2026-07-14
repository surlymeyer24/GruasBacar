import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Notificacion } from "@gruasbacar/shared";
import { useAuth } from "../hooks/useAuth";
import {
  escucharNotificaciones,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
} from "../services/notificacion.service";
import { escucharMensajesForeground } from "../services/fcm.service";

interface ToastNotificacion {
  id: string;
  titulo: string;
  cuerpo: string;
}

interface NotificationContextValue {
  notificaciones: Notificacion[];
  noLeidas: number;
  loading: boolean;
  toast: ToastNotificacion | null;
  cerrarToast: () => void;
  marcarLeida: (id: string) => Promise<void>;
  marcarTodasLeidas: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function tiempoNotificacion(creadaEn: unknown): number {
  if (!creadaEn) return 0;
  if (typeof creadaEn === "object" && creadaEn !== null && "toMillis" in creadaEn) {
    return (creadaEn as { toMillis: () => number }).toMillis();
  }
  const parsed = new Date(String(creadaEn)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { userData } = useAuth();
  const uid = userData?.uid ?? null;

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastNotificacion | null>(null);
  const vistoInicialRef = useRef(false);
  const idsPreviosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) {
      setNotificaciones([]);
      setLoading(false);
      vistoInicialRef.current = false;
      idsPreviosRef.current = new Set();
      return;
    }

    setLoading(true);
    const unsub = escucharNotificaciones(
      uid,
      (items) => {
        if (!vistoInicialRef.current) {
          idsPreviosRef.current = new Set(items.map((n) => n.id));
          vistoInicialRef.current = true;
          setNotificaciones(items);
          setLoading(false);
          return;
        }

        const nuevas = items.filter(
          (n) => !n.leida && !idsPreviosRef.current.has(n.id)
        );
        if (nuevas.length > 0) {
          const masReciente = [...nuevas].sort(
            (a, b) => tiempoNotificacion(b.creadaEn) - tiempoNotificacion(a.creadaEn)
          )[0];
          setToast({
            id: masReciente.id,
            titulo: masReciente.titulo,
            cuerpo: masReciente.cuerpo,
          });
        }

        idsPreviosRef.current = new Set(items.map((n) => n.id));
        setNotificaciones(items);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return escucharMensajesForeground(() => {
      // onSnapshot already handles UI updates; this prevents the browser
      // from showing a duplicate native notification while the app is open.
    });
  }, [uid]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const marcarLeida = useCallback(async (id: string) => {
    await marcarNotificacionLeida(id);
    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
    );
  }, []);

  const marcarTodasLeidas = useCallback(async () => {
    await marcarTodasNotificacionesLeidas();
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
  }, []);

  const noLeidas = useMemo(
    () => notificaciones.filter((n) => !n.leida).length,
    [notificaciones]
  );

  const value = useMemo(
    () => ({
      notificaciones,
      noLeidas,
      loading,
      toast,
      cerrarToast: () => setToast(null),
      marcarLeida,
      marcarTodasLeidas,
    }),
    [notificaciones, noLeidas, loading, toast, marcarLeida, marcarTodasLeidas]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-md"
          role="status"
        >
          <div className="rounded-xl border border-brand-cta/30 bg-brand-purply text-white shadow-xl px-4 py-3 flex gap-3 items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-brand-cta">{toast.titulo}</p>
              <p className="text-xs text-brand-seashell/90 mt-0.5 line-clamp-3">{toast.cuerpo}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 text-brand-pale hover:text-white text-xs font-bold cursor-pointer"
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications debe usarse dentro de NotificationProvider");
  }
  return ctx;
}
