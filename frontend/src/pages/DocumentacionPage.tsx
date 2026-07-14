import React, { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import AdminListFilters from "../components/admin/AdminListFilters";
import { CustomSelect } from "../components/shared/CustomSelect";
import { CustomDatePicker } from "../components/shared/CustomDatePicker";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import {
  FileText,
  Plus,
  AlertCircle,
  Pencil,
  Power,
  X,
  Calendar,
  Hash,
  User,
  Truck,
  CheckCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  CarnetDeConducir,
  CarnetEstadoVencimiento,
  calcularEstadoCarnet,
  diasParaVencimiento,
  RegistroITV,
  ITVEstadoVencimiento,
  calcularEstadoITV,
  Grua,
} from "@gruasbacar/shared";
import * as carnetService from "../services/carnet.service";
import * as itvService from "../services/itv.service";
import { gruaService } from "../services/grua.service";
import { useAdminCatalog } from "../hooks/useAdminCatalog";
import { esOperador } from "@gruasbacar/shared";

type Tab = "carnets" | "itv";
type EstadoFilter = "ALL" | "VIGENTE" | "POR_VENCER" | "VENCIDO";

const ESTADO_FILTER_OPTIONS: { value: EstadoFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "VIGENTE", label: "Vigentes" },
  { value: "POR_VENCER", label: "Por vencer" },
  { value: "VENCIDO", label: "Vencidos" },
];

const ESTADO_STYLE: Record<
  CarnetEstadoVencimiento | ITVEstadoVencimiento,
  { label: string; badge: string; border: string }
> = {
  VIGENTE: {
    label: "VIGENTE",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
    border: "border-l-emerald-500",
  },
  POR_VENCER_30D: {
    label: "VENCE EN 30 DÍAS",
    badge: "bg-amber-50 text-amber-700 border-amber-200/50",
    border: "border-l-amber-400",
  },
  POR_VENCER_15D: {
    label: "VENCE EN 15 DÍAS",
    badge: "bg-orange-50 text-orange-700 border-orange-200/50",
    border: "border-l-orange-500",
  },
  POR_VENCER_7D: {
    label: "VENCE EN 7 DÍAS",
    badge: "bg-rose-50 text-rose-700 border-rose-200/50",
    border: "border-l-rose-500",
  },
  VENCIDO: {
    label: "VENCIDO",
    badge: "bg-red-100 text-red-800 border-red-300/50",
    border: "border-l-red-600",
  },
};

function estiloParaEstado(estado: CarnetEstadoVencimiento | ITVEstadoVencimiento, dias: number) {
  const base = ESTADO_STYLE[estado];
  if (estado === "POR_VENCER_30D" || estado === "POR_VENCER_15D" || estado === "POR_VENCER_7D") {
    return { ...base, label: `VENCE EN ${dias} DÍAS` };
  }
  return base;
}

function matchesEstadoFilter(estado: CarnetEstadoVencimiento | ITVEstadoVencimiento, filter: EstadoFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "VIGENTE") return estado === "VIGENTE";
  if (filter === "VENCIDO") return estado === "VENCIDO";
  return estado === "POR_VENCER_30D" || estado === "POR_VENCER_15D" || estado === "POR_VENCER_7D";
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

// ── Carnets Tab ────────────────────────────────────────────

const CarnetsTab: React.FC<{
  operadores: { uid: string; nombre: string; legajo?: string; roles?: string[] }[];
}> = ({ operadores }) => {
  const [carnets, setCarnets] = useState<CarnetDeConducir[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedUid, setSelectedUid] = useState("");
  const [legajo, setLegajo] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");

  const [editId, setEditId] = useState<string | null>(null);
  const [editFecha, setEditFecha] = useState("");

  const [deactivateTarget, setDeactivateTarget] = useState<CarnetDeConducir | null>(null);

  const fetchCarnets = useCallback(async () => {
    try {
      const data = await carnetService.listarCarnets();
      setCarnets(data);
    } catch (err) {
      setError("Error al cargar los carnets.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCarnets();
  }, [fetchCarnets]);

  const filtered = useMemo(() => {
    return carnets.filter((c) => {
      if (!c.activo) return false;
      const estado = calcularEstadoCarnet(c.fechaVencimiento);
      if (!matchesEstadoFilter(estado, estadoFilter as EstadoFilter)) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.nombre.toLowerCase().includes(q) ||
        c.legajo.toLowerCase().includes(q) ||
        String(c.numero).padStart(6, "0").includes(q)
      );
    });
  }, [carnets, search, estadoFilter]);

  const handleSelectOperador = (uid: string) => {
    setSelectedUid(uid);
    const op = operadores.find((u) => u.uid === uid);
    setLegajo(op?.legajo ?? "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const op = operadores.find((u) => u.uid === selectedUid);
    if (!op || !fechaVencimiento) {
      setError("Seleccione un operador y complete la fecha de vencimiento.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await carnetService.crearCarnet({
        nombre: op.nombre,
        legajo: op.legajo ?? legajo.trim(),
        fechaVencimiento,
      });
      setSelectedUid("");
      setLegajo("");
      setFechaVencimiento("");
      setShowForm(false);
      await fetchCarnets();
    } catch (err) {
      setError((err as Error).message || "Error al crear el carnet.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: CarnetDeConducir) => {
    setEditId(c.id);
    setEditFecha(c.fechaVencimiento);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditFecha("");
  };

  const saveEdit = async () => {
    if (!editId || !editFecha) return;
    setSaving(true);
    setError(null);
    try {
      await carnetService.actualizarCarnet({ carnetId: editId, fechaVencimiento: editFecha });
      setCarnets((prev) =>
        prev.map((c) => (c.id === editId ? { ...c, fechaVencimiento: editFecha } : c))
      );
      cancelEdit();
    } catch (err) {
      setError((err as Error).message || "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    setError(null);
    try {
      await carnetService.desactivarCarnet(deactivateTarget.id);
      setCarnets((prev) =>
        prev.map((c) => (c.id === deactivateTarget.id ? { ...c, activo: false } : c))
      );
      setDeactivateTarget(null);
    } catch (err) {
      setError((err as Error).message || "Error al desactivar.");
    } finally {
      setSaving(false);
    }
  };

  const activosCount = carnets.filter((c) => c.activo).length;

  if (loading) {
    return <LoadingSpinner message="Cargando carnets..." />;
  }

  return (
    <>
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-bold rounded-xl cursor-pointer transition-colors shadow-sm"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nuevo carnet"}
        </button>
      </div>

      {showForm && (
        <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white p-5">
          <h3 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand-cta" />
            Registrar nuevo carnet
          </h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Operador
              </label>
              <CustomSelect
                value={selectedUid}
                onChange={(val) => handleSelectOperador(val)}
                options={operadores.map((u) => ({
                  value: u.uid,
                  label: `${u.nombre}${u.legajo ? ` — Legajo ${u.legajo}` : ""}`,
                }))}
                placeholder="Seleccionar operador..."
                icon={User}
                size="sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Legajo
              </label>
              <input
                type="text"
                value={legajo}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-250 rounded-lg text-xs font-mono text-gray-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Fecha de vencimiento
              </label>
              <div className="flex gap-2">
                <CustomDatePicker
                  value={fechaVencimiento}
                  onChange={setFechaVencimiento}
                  placeholder="Fecha de vencimiento..."
                  className="flex-grow"
                  size="sm"
                  required
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Registrar
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white overflow-hidden">
        <div className="p-3 border-b border-brand-seashell/50 bg-gray-50/50">
          <AdminListFilters
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre, legajo o número..."
            status={estadoFilter}
            onStatusChange={setEstadoFilter}
            statusOptions={ESTADO_FILTER_OPTIONS}
            className="mb-0"
          />
        </div>

        <div className="p-4">
          <p className="text-xs font-semibold text-brand-pale mb-4">
            {filtered.length} carnet{filtered.length !== 1 ? "s" : ""}
            {search || estadoFilter !== "ALL" ? ` de ${activosCount}` : ""}
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-brand-pale">
                {activosCount === 0
                  ? "No hay carnets registrados."
                  : "No hay carnets que coincidan con la búsqueda o el filtro."}
              </p>
              {activosCount === 0 && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-cta hover:bg-brand-cta-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Registrar el primer carnet
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((c) => {
                const estado = calcularEstadoCarnet(c.fechaVencimiento);
                const dias = diasParaVencimiento(c.fechaVencimiento);
                const estilo = estiloParaEstado(estado, dias);
                const editing = editId === c.id;

                return (
                  <div
                    key={c.id}
                    className={`relative border border-brand-seashell rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow border-l-4 ${estilo.border}`}
                  >
                    {editing ? (
                      <div className="p-4 space-y-3">
                        <p className="text-sm font-bold text-gray-900">{c.nombre}</p>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                            Nueva fecha de vencimiento
                          </label>
                          <CustomDatePicker
                            value={editFecha}
                            onChange={setEditFecha}
                            placeholder="Nueva fecha..."
                            size="sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            className="flex-1 px-3 py-1.5 text-xs font-bold bg-brand-cta text-white rounded-lg disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex-1 px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <span
                            className={`text-[10px] font-mono tracking-wide px-2 py-0.5 rounded-md border font-bold ${estilo.badge}`}
                          >
                            {estilo.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="p-1 rounded-md border border-transparent hover:border-indigo-300 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors"
                              title="Editar fecha"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeactivateTarget(c)}
                              disabled={saving}
                              className="p-1 rounded-md border border-transparent hover:border-rose-300 text-brand-pale hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
                              title="Dar de baja"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="font-bold text-sm text-gray-900 leading-snug">
                          {c.nombre}
                        </p>

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-brand-pale">
                            <Hash className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span className="font-mono font-bold text-red-600">
                              {String(c.numero).padStart(6, "0")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-brand-pale">
                            <User className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span>
                              Legajo <span className="font-mono font-semibold text-gray-700">{c.legajo}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-brand-pale">
                            <Calendar className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span>
                              Vence <span className="font-semibold text-gray-700">{formatFecha(c.fechaVencimiento)}</span>
                            </span>
                          </div>
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

      <ConfirmDialog
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
        title="Dar de baja carnet"
        message={`¿Desactivar el carnet #${deactivateTarget ? String(deactivateTarget.numero).padStart(6, "0") : ""} de ${deactivateTarget?.nombre ?? ""}?`}
        confirmText="Confirmar baja"
        cancelText="Cancelar"
        danger
      />
    </>
  );
};

// ── ITV Tab ────────────────────────────────────────────────

const ITVTab: React.FC = () => {
  const [registros, setRegistros] = useState<RegistroITV[]>([]);
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [selectedGruaId, setSelectedGruaId] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [fechaTurno, setFechaTurno] = useState("");

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");

  const [editId, setEditId] = useState<string | null>(null);
  const [editFechaVenc, setEditFechaVenc] = useState("");
  const [editFechaTurno, setEditFechaTurno] = useState("");
  const [editRenovado, setEditRenovado] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<RegistroITV | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [itvData, gruasData] = await Promise.all([
        itvService.listarITV(),
        gruaService.getGruasActivas(),
      ]);
      setRegistros(itvData);
      setGruas(gruasData);
    } catch (err) {
      setError("Error al cargar los registros de ITV.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return registros.filter((r) => {
      if (!r.activo) return false;
      const estado = calcularEstadoITV(r.fechaVencimiento);
      if (!matchesEstadoFilter(estado, estadoFilter as EstadoFilter)) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        r.gruaPatente.toLowerCase().includes(q) ||
        String(r.numero).padStart(6, "0").includes(q)
      );
    });
  }, [registros, search, estadoFilter]);

  const handleSelectGrua = (gruaId: string) => {
    setSelectedGruaId(gruaId);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const grua = gruas.find((g) => g.id === selectedGruaId);
    if (!grua || !fechaVencimiento) {
      setError("Seleccione una grúa y complete la fecha de vencimiento.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await itvService.crearITV({
        gruaId: grua.id,
        gruaPatente: grua.patente,
        fechaVencimiento,
        fechaTurnoRenovacion: fechaTurno || undefined,
      });
      setSelectedGruaId("");
      setFechaVencimiento("");
      setFechaTurno("");
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError((err as Error).message || "Error al crear el registro ITV.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: RegistroITV) => {
    setEditId(r.id);
    setEditFechaVenc(r.fechaVencimiento);
    setEditFechaTurno(r.fechaTurnoRenovacion ?? "");
    setEditRenovado(r.renovado);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditFechaVenc("");
    setEditFechaTurno("");
    setEditRenovado(false);
  };

  const saveEdit = async () => {
    if (!editId || !editFechaVenc) return;
    setSaving(true);
    setError(null);
    try {
      await itvService.actualizarITV({
        itvId: editId,
        fechaVencimiento: editFechaVenc,
        fechaTurnoRenovacion: editFechaTurno || null,
        renovado: editRenovado,
      });
      setRegistros((prev) =>
        prev.map((r) =>
          r.id === editId
            ? {
                ...r,
                fechaVencimiento: editFechaVenc,
                fechaTurnoRenovacion: editFechaTurno || undefined,
                renovado: editRenovado,
              }
            : r
        )
      );
      cancelEdit();
    } catch (err) {
      setError((err as Error).message || "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    setError(null);
    try {
      await itvService.desactivarITV(deactivateTarget.id);
      setRegistros((prev) =>
        prev.map((r) => (r.id === deactivateTarget.id ? { ...r, activo: false } : r))
      );
      setDeactivateTarget(null);
    } catch (err) {
      setError((err as Error).message || "Error al desactivar.");
    } finally {
      setSaving(false);
    }
  };

  const activosCount = registros.filter((r) => r.activo).length;

  if (loading) {
    return <LoadingSpinner message="Cargando registros ITV..." />;
  }

  return (
    <>
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-bold rounded-xl cursor-pointer transition-colors shadow-sm"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nueva ITV"}
        </button>
      </div>

      {showForm && (
        <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white p-5">
          <h3 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand-cta" />
            Registrar nueva ITV
          </h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Grúa
              </label>
              <CustomSelect
                value={selectedGruaId}
                onChange={(val) => handleSelectGrua(val)}
                options={gruas.map((g) => ({
                  value: g.id,
                  label: g.descripcion?.trim() ? `${g.descripcion} — ${g.patente}` : g.patente,
                }))}
                placeholder="Seleccionar grúa..."
                icon={Truck}
                size="sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Fecha de vencimiento
              </label>
              <CustomDatePicker
                value={fechaVencimiento}
                onChange={setFechaVencimiento}
                placeholder="Fecha de vencimiento..."
                size="sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Turno renovación (opcional)
              </label>
              <CustomDatePicker
                value={fechaTurno}
                onChange={setFechaTurno}
                placeholder="Turno renovación..."
                size="sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full px-5 py-2 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white overflow-hidden">
        <div className="p-3 border-b border-brand-seashell/50 bg-gray-50/50">
          <AdminListFilters
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por patente o número..."
            status={estadoFilter}
            onStatusChange={setEstadoFilter}
            statusOptions={ESTADO_FILTER_OPTIONS}
            className="mb-0"
          />
        </div>

        <div className="p-4">
          <p className="text-xs font-semibold text-brand-pale mb-4">
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
            {search || estadoFilter !== "ALL" ? ` de ${activosCount}` : ""}
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-brand-pale">
                {activosCount === 0
                  ? "No hay registros ITV."
                  : "No hay registros que coincidan con la búsqueda o el filtro."}
              </p>
              {activosCount === 0 && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-cta hover:bg-brand-cta-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Registrar la primera ITV
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((r) => {
                const estado = calcularEstadoITV(r.fechaVencimiento);
                const dias = diasParaVencimiento(r.fechaVencimiento);
                const estilo = estiloParaEstado(estado, dias);
                const editing = editId === r.id;

                return (
                  <div
                    key={r.id}
                    className={`relative border border-brand-seashell rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow border-l-4 ${estilo.border}`}
                  >
                    {editing ? (
                      <div className="p-4 space-y-3">
                        <p className="text-sm font-bold text-gray-900">{gruas.find((g) => g.patente === r.gruaPatente)?.descripcion || r.gruaPatente}</p>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                            Fecha de vencimiento
                          </label>
                          <CustomDatePicker
                            value={editFechaVenc}
                            onChange={setEditFechaVenc}
                            placeholder="Fecha de vencimiento..."
                            size="sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                            Turno renovación
                          </label>
                          <CustomDatePicker
                            value={editFechaTurno}
                            onChange={setEditFechaTurno}
                            placeholder="Turno renovación..."
                            size="sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editRenovado}
                            onChange={(e) => setEditRenovado(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-brand-cta focus:ring-brand-cta"
                          />
                          <span className="text-xs font-semibold text-gray-700">Renovada</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            className="flex-1 px-3 py-1.5 text-xs font-bold bg-brand-cta text-white rounded-lg disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex-1 px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <span
                            className={`text-[10px] font-mono tracking-wide px-2 py-0.5 rounded-md border font-bold ${estilo.badge}`}
                          >
                            {estilo.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              className="p-1 rounded-md border border-transparent hover:border-indigo-300 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeactivateTarget(r)}
                              disabled={saving}
                              className="p-1 rounded-md border border-transparent hover:border-rose-300 text-brand-pale hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
                              title="Dar de baja"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="font-bold text-sm text-gray-900 leading-snug flex items-center gap-2">
                          <Truck className="w-4 h-4 text-brand-cta shrink-0" />
                          {gruas.find((g) => g.patente === r.gruaPatente)?.descripcion || r.gruaPatente}
                        </p>
                        {gruas.find((g) => g.patente === r.gruaPatente)?.descripcion && (
                          <p className="font-mono text-[10px] text-brand-pale ml-6">{r.gruaPatente}</p>
                        )}

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-brand-pale">
                            <Hash className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span className="font-mono font-bold text-red-600">
                              {String(r.numero).padStart(6, "0")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-brand-pale">
                            <Calendar className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span>
                              Vence <span className="font-semibold text-gray-700">{formatFecha(r.fechaVencimiento)}</span>
                            </span>
                          </div>
                          {r.fechaTurnoRenovacion && (
                            <div className="flex items-center gap-2 text-xs text-brand-pale">
                              <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                              <span>
                                Turno <span className="font-semibold text-gray-700">{formatFecha(r.fechaTurnoRenovacion)}</span>
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className={`w-3.5 h-3.5 shrink-0 ${r.renovado ? "text-emerald-500" : "text-gray-300"}`} />
                            <span className={r.renovado ? "font-semibold text-emerald-700" : "text-brand-pale"}>
                              {r.renovado ? "Renovada" : "Sin renovar"}
                            </span>
                          </div>
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

      <ConfirmDialog
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
        title="Dar de baja ITV"
        message={`¿Desactivar el registro ITV #${deactivateTarget ? String(deactivateTarget.numero).padStart(6, "0") : ""} de la grúa ${deactivateTarget?.gruaPatente ?? ""}?`}
        confirmText="Confirmar baja"
        cancelText="Cancelar"
        danger
      />
    </>
  );
};

// ── Page ───────────────────────────────────────────────────

export const DocumentacionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("carnets");
  const { data: catalogData } = useAdminCatalog();

  const operadores = useMemo(() => {
    if (!catalogData?.usuarios) return [];
    return catalogData.usuarios.filter(
      (u) => u.activo !== false && esOperador(u.roles ?? [])
    );
  }, [catalogData?.usuarios]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "carnets", label: "Carnets", icon: <FileText className="w-4 h-4" /> },
    { key: "itv", label: "ITV", icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-brand-cta" />
            Documentación
          </h1>
          <p className="text-sm text-brand-pale mt-1">
            Seguimiento de vencimientos de carnets de conducir e ITV.
          </p>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-brand-pale hover:text-gray-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "carnets" ? (
          <CarnetsTab operadores={operadores} />
        ) : (
          <ITVTab />
        )}
      </div>
    </Layout>
  );
};

export default DocumentacionPage;
