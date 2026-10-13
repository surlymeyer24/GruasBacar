import React, { useEffect, useState } from "react";
import { Mail, Plus, Trash2, AlertCircle, Check, Loader2, UserCheck } from "lucide-react";
import { ConfigNotificacionesEmail, Usuario, esAdmin } from "@gruasbacar/shared";
import {
  obtenerConfigNotificaciones,
  guardarConfigNotificaciones,
} from "../../services/configNotificaciones.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  usuarios: Usuario[];
}

const AdminNotificacionesPanel: React.FC<Props> = ({ usuarios }) => {
  const [config, setConfig] = useState<ConfigNotificacionesEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const adminsActivos = usuarios.filter(
    (u) => u.activo !== false && esAdmin(u.roles)
  );

  useEffect(() => {
    obtenerConfigNotificaciones()
      .then((data) => setConfig(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleAdmin = (uid: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const tiene = prev.adminUids.includes(uid);
      return {
        ...prev,
        adminUids: tiene
          ? prev.adminUids.filter((u) => u !== uid)
          : [...prev.adminUids, uid],
      };
    });
    setDirty(true);
    setSuccess(false);
  };

  const seleccionarTodos = () => {
    setConfig((prev) =>
      prev ? { ...prev, adminUids: adminsActivos.map((u) => u.uid) } : prev
    );
    setDirty(true);
    setSuccess(false);
  };

  const deseleccionarTodos = () => {
    setConfig((prev) => (prev ? { ...prev, adminUids: [] } : prev));
    setDirty(true);
    setSuccess(false);
  };

  const agregarEmail = () => {
    const email = nuevoEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Formato de email inválido.");
      return;
    }
    if (config?.emailsExtra.includes(email)) {
      setEmailError("Ese email ya está en la lista.");
      return;
    }
    setConfig((prev) =>
      prev ? { ...prev, emailsExtra: [...prev.emailsExtra, email] } : prev
    );
    setNuevoEmail("");
    setEmailError(null);
    setDirty(true);
    setSuccess(false);
  };

  const quitarEmail = (email: string) => {
    setConfig((prev) =>
      prev
        ? { ...prev, emailsExtra: prev.emailsExtra.filter((e) => e !== email) }
        : prev
    );
    setDirty(true);
    setSuccess(false);
  };

  const guardar = async () => {
    if (!config) return;

    if (config.adminUids.length === 0 && config.emailsExtra.length === 0) {
      setError("Seleccioná al menos un administrador o agregá un email.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const saved = await guardarConfigNotificaciones(config);
      setConfig(saved);
      setDirty(false);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const todosSeleccionados =
    config !== null &&
    adminsActivos.length > 0 &&
    adminsActivos.every((u) => config.adminUids.includes(u.uid));

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand-pale" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold">{error || "No se pudo cargar la configuración."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4 text-brand-cta" />
          Emails de vencimientos
        </h3>
        <p className="text-xs text-brand-pale mt-1">
          Los avisos de vencimiento de carnets, ITV y pólizas se envían por email a los destinatarios seleccionados.
        </p>
      </div>

      {/* Admins checkbox list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Administradores
          </p>
          <button
            type="button"
            onClick={todosSeleccionados ? deseleccionarTodos : seleccionarTodos}
            className="text-[11px] font-semibold text-brand-cta hover:underline cursor-pointer"
          >
            {todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
        </div>

        {adminsActivos.length === 0 ? (
          <p className="text-xs text-brand-pale py-2">No hay administradores activos.</p>
        ) : (
          <div className="space-y-1">
            {adminsActivos.map((admin) => {
              const checked = config.adminUids.includes(admin.uid);
              return (
                <label
                  key={admin.uid}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? "bg-emerald-50/50 border-emerald-200"
                      : "bg-brand-bg border-brand-seashell hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAdmin(admin.uid)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-cta focus:ring-brand-cta cursor-pointer accent-red-700"
                  />
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-bold text-gray-800 truncate">{admin.nombre}</p>
                    {admin.email && (
                      <p className="text-[11px] text-brand-pale font-mono truncate">{admin.email}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200/50 shrink-0">
                    {admin.roles.includes("SUPERADMIN") ? "Superadmin" : "Admin"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Emails extra */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Emails adicionales
        </p>
        <p className="text-[11px] text-brand-pale">
          Direcciones externas que no tienen cuenta en el sistema.
        </p>

        {config.emailsExtra.length > 0 && (
          <div className="space-y-1.5">
            {config.emailsExtra.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-brand-bg rounded-lg border border-brand-seashell"
              >
                <span className="text-xs font-mono text-gray-700 truncate">{email}</span>
                <button
                  type="button"
                  onClick={() => quitarEmail(email)}
                  className="p-1 rounded hover:bg-rose-50 text-brand-pale hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                  title="Quitar email"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            agregarEmail();
          }}
          className="flex gap-2"
        >
          <input
            type="email"
            value={nuevoEmail}
            onChange={(e) => {
              setNuevoEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder="externo@email.com"
            className="flex-grow px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
          />
          <button
            type="submit"
            disabled={!nuevoEmail.trim()}
            className="px-3 py-2 bg-brand-cta text-white rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </form>
        {emailError && (
          <p className="text-[11px] text-red-600 font-semibold">{emailError}</p>
        )}
      </div>

      {/* Warning sin destinatarios */}
      {config.adminUids.length === 0 && config.emailsExtra.length === 0 && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[11px] font-semibold">
            Sin destinatarios: los emails de vencimiento no se enviarán a nadie.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-[11px] font-semibold">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-[11px] font-semibold">Configuración guardada correctamente.</p>
        </div>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={!dirty || saving}
        className="w-full py-2.5 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-40 text-white text-xs font-bold rounded-lg cursor-pointer flex justify-center items-center gap-1.5"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Guardando...
          </>
        ) : (
          "Guardar configuración"
        )}
      </button>
    </div>
  );
};

export default AdminNotificacionesPanel;
