import React, { useMemo, useState } from "react";
import { AlertCircle, ListPlus, Plus, Power, UserCog, Users, Shield } from "lucide-react";
import { RolUsuario, Usuario, normalizeRoles, legajoYaUsado, labelRolUsuario } from "@gruasbacar/shared";
import AdminListFilters from "./AdminListFilters";
import { CustomMultiSelect } from "../shared/CustomMultiSelect";
import {
  actualizarUsuario,
  crearUsuario,
  desactivarUsuario,
  listarUsuarios,
} from "../../services/usuario.service";

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "ENGANCHADOR", label: "Enganchador" },
  { value: "CHOFER", label: "Chofer" },
];

const USUARIO_ESTADO_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activos" },
  { value: "INACTIVE", label: "Inactivos" },
];

const USUARIO_ROL_OPTIONS = [
  { value: "ALL", label: "Todos los roles" },
  { value: "ADMIN", label: "Administrador" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "ENGANCHADOR", label: "Enganchador" },
  { value: "CHOFER", label: "Chofer" },
];

function rolLabel(rol: string): string {
  return ROLES.find((r) => r.value === rol)?.label ?? labelRolUsuario(rol);
}

function mensajeError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return "Ocurrió un error inesperado.";
}

interface AdminUsuariosPanelProps {
  usuarios: Usuario[];
  onUsuariosChange: (usuarios: Usuario[]) => void;
}

export const AdminUsuariosPanel: React.FC<AdminUsuariosPanelProps> = ({
  usuarios,
  onUsuariosChange,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [roles, setRoles] = useState<RolUsuario[]>(["ENGANCHADOR"]);
  const [legajo, setLegajo] = useState("");

  const [editUid, setEditUid] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editRoles, setEditRoles] = useState<RolUsuario[]>(["ENGANCHADOR"]);
  const [editLegajo, setEditLegajo] = useState("");

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("ALL");
  const [rolFilter, setRolFilter] = useState("ALL");

  const filteredUsuarios = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usuarios.filter((u) => {
      const activo = u.activo !== false;
      if (estadoFilter === "ACTIVE" && !activo) return false;
      if (estadoFilter === "INACTIVE" && activo) return false;
      if (rolFilter !== "ALL" && !normalizeRoles(u.roles, u.rol).includes(rolFilter as RolUsuario)) return false;
      if (!q) return true;
      return (
        u.nombre.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.legajo?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [usuarios, search, estadoFilter, rolFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !nombre.trim()) {
      setError("Completá email, contraseña y nombre.");
      return;
    }
    if (roles.length === 0) {
      setError("Debes seleccionar al menos un rol.");
      return;
    }
    if (!legajo.trim()) {
      setError("El legajo es obligatorio.");
      return;
    }
    if (legajoYaUsado(legajo, usuarios)) {
      setError("Ya existe un usuario con ese legajo.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await crearUsuario({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        nombre: nombre.trim(),
        roles,
        legajo: legajo.trim(),
      });
      setEmail("");
      setPassword("");
      setNombre("");
      setLegajo("");
      setRoles(["ENGANCHADOR"]);
      const fresh = await listarUsuarios();
      onUsuariosChange(fresh.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    } catch (err) {
      console.error(err);
      setError(mensajeError(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: Usuario) => {
    setEditUid(u.uid);
    setEditNombre(u.nombre);
    setEditRoles(normalizeRoles(u.roles, u.rol));
    setEditLegajo(u.legajo ?? "");
  };

  const cancelEdit = () => {
    setEditUid(null);
    setEditNombre("");
    setEditLegajo("");
  };

  const handleSaveEdit = async () => {
    if (!editUid || !editNombre.trim()) return;
    if (editRoles.length === 0) {
      setError("Debes seleccionar al menos un rol.");
      return;
    }
    if (!editLegajo.trim()) {
      setError("El legajo es obligatorio.");
      return;
    }
    if (legajoYaUsado(editLegajo, usuarios, editUid)) {
      setError("Ya existe un usuario con ese legajo.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const legajoFinal = editLegajo.trim();
      await actualizarUsuario({
        uid: editUid,
        nombre: editNombre.trim(),
        roles: editRoles,
        legajo: legajoFinal,
      });
      cancelEdit();
      onUsuariosChange(
        usuarios
          .map((u) =>
            u.uid === editUid
              ? {
                  ...u,
                  nombre: editNombre.trim(),
                  roles: editRoles,
                  legajo: legajoFinal,
                }
              : u
          )
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      );
    } catch (err) {
      console.error(err);
      setError(mensajeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDesactivar = async (uid: string) => {
    if (!window.confirm("¿Desactivar este usuario? No podrá iniciar sesión.")) return;

    setSaving(true);
    setError(null);
    try {
      await desactivarUsuario(uid);
      onUsuariosChange(
        usuarios.map((u) => (u.uid === uid ? { ...u, activo: false } : u))
      );
    } catch (err) {
      console.error(err);
      setError(mensajeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white overflow-hidden">
      {error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <div className={`p-4 border-b border-brand-seashell/80 ${error ? "pt-3" : ""}`}>
        <AdminListFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre, email o legajo..."
          status={estadoFilter}
          onStatusChange={setEstadoFilter}
          statusOptions={USUARIO_ESTADO_OPTIONS}
          className="mb-0"
          extraFilter={{
            value: rolFilter,
            onChange: setRolFilter,
            options: USUARIO_ROL_OPTIONS,
            ariaLabel: "Filtrar por rol",
            icon: Shield,
          }}
        />
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="border border-brand-seashell rounded-xl overflow-hidden">
          <div className="p-4 bg-brand-bg border-b border-brand-seashell flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-purply flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-cta" />
              Usuarios del sistema ({filteredUsuarios.length}{search || estadoFilter !== "ALL" || rolFilter !== "ALL" ? ` de ${usuarios.length}` : ""})
            </h3>
          </div>

          {filteredUsuarios.length === 0 ? (
            <p className="p-6 text-sm text-brand-pale text-center">
              {usuarios.length === 0
                ? "No hay usuarios registrados."
                : "No hay usuarios que coincidan con la búsqueda o el filtro."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredUsuarios.map((u) => {
                const activo = u.activo !== false;
                const editing = editUid === u.uid;

                return (
                  <div key={u.uid} className="p-4 hover:bg-slate-50/50">
                    {editing ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-sm"
                          placeholder="Nombre"
                        />
                        <div className="flex flex-wrap gap-2 mb-2">
                          {ROLES.map(r => (
                            <label key={r.value} className="flex items-center gap-1.5 text-xs">
                              <input 
                                type="checkbox" 
                                checked={editRoles.includes(r.value)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditRoles([...editRoles, r.value]);
                                  } else {
                                    setEditRoles(editRoles.filter((er) => er !== r.value));
                                  }
                                }}
                                className="w-3.5 h-3.5 text-brand-cta rounded border-brand-seashell focus:ring-brand-cta"
                              />
                              {r.label}
                            </label>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={editLegajo}
                          onChange={(e) => setEditLegajo(e.target.value)}
                          className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-sm"
                          placeholder="Nro Legajo"
                          required
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs font-bold bg-brand-cta text-white rounded-lg disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-sm text-gray-900">{u.nombre}</p>
                          <p className="text-xs text-brand-pale mt-0.5">{u.email ?? "Sin email"}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {normalizeRoles(u.roles, u.rol).map(r => (
                              <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/50">
                                {rolLabel(r)}
                              </span>
                            ))}
                            {u.legajo && (
                              <span className="text-[10px] font-mono text-brand-pale">Legajo {u.legajo}</span>
                            )}
                            {!activo && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200/50">
                                INACTIVO
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            disabled={!activo || saving}
                            className="p-1.5 rounded-lg border border-brand-seashell hover:border-brand-cta text-brand-pale hover:text-brand-cta disabled:opacity-40"
                            title="Editar usuario"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>
                          {activo && (
                            <button
                              type="button"
                              onClick={() => handleDesactivar(u.uid)}
                              disabled={saving}
                              className="p-1.5 rounded-lg border border-brand-seashell hover:border-rose-500 text-brand-pale hover:text-rose-500 disabled:opacity-40"
                              title="Desactivar usuario"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-brand-seashell shadow-sm h-fit space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-105">
          <ListPlus className="w-5 h-5 text-brand-cta" />
          <h3 className="font-bold text-sm text-gray-900">Nuevo usuario</h3>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-2 lg:hidden">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold">{error}</p>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-widest mb-1.5">
              Nombre completo
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-widest mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-widest mb-1.5">
              Contraseña inicial
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-widest mb-1.5">
              Roles
            </label>
            <CustomMultiSelect
              value={roles}
              onChange={(next) => setRoles(next as RolUsuario[])}
              options={ROLES}
              ariaLabel="Roles del usuario"
              icon={Shield}
              size="filter"
              placeholder="Seleccioná uno o más roles"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-pale uppercase tracking-widest mb-1.5">
              Legajo
            </label>
            <input
              type="text"
              value={legajo}
              onChange={(e) => setLegajo(e.target.value)}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-brand-cta hover:bg-red-600 disabled:bg-red-400 text-white text-xs font-bold rounded-lg flex justify-center items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Crear usuario
          </button>
        </form>
      </div>
      </div>
    </div>
  );
};

export default AdminUsuariosPanel;
