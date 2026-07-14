import React, { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import AdminListFilters from "../components/admin/AdminListFilters";
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
} from "lucide-react";
import {
  CarnetDeConducir,
  CarnetEstadoVencimiento,
  calcularEstadoCarnet,
  diasParaVencimiento,
} from "@gruasbacar/shared";
import * as carnetService from "../services/carnet.service";
import { useAdminCatalog } from "../hooks/useAdminCatalog";
import { esOperador } from "@gruasbacar/shared";

type EstadoFilter = "ALL" | "VIGENTE" | "POR_VENCER" | "VENCIDO";

const ESTADO_FILTER_OPTIONS: { value: EstadoFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "VIGENTE", label: "Vigentes" },
  { value: "POR_VENCER", label: "Por vencer" },
  { value: "VENCIDO", label: "Vencidos" },
];

const ESTADO_STYLE: Record<
  CarnetEstadoVencimiento,
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

function estiloParaEstado(estado: CarnetEstadoVencimiento, dias: number) {
  const base = ESTADO_STYLE[estado];
  if (estado === "POR_VENCER_30D" || estado === "POR_VENCER_15D" || estado === "POR_VENCER_7D") {
    return { ...base, label: `VENCE EN ${dias} DÍAS` };
  }
  return base;
}

function matchesEstadoFilter(estado: CarnetEstadoVencimiento, filter: EstadoFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "VIGENTE") return estado === "VIGENTE";
  if (filter === "VENCIDO") return estado === "VENCIDO";
  return estado === "POR_VENCER_30D" || estado === "POR_VENCER_15D" || estado === "POR_VENCER_7D";
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

export const DocumentacionPage: React.FC = () => {
  const [carnets, setCarnets] = useState<CarnetDeConducir[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const { data: catalogData } = useAdminCatalog();

  const [showForm, setShowForm] = useState(false);
  const [selectedUid, setSelectedUid] = useState("");
  const [legajo, setLegajo] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("ALL");

  const [editId, setEditId] = useState<string | null>(null);
  const [editFecha, setEditFecha] = useState("");

  const [deactivateTarget, setDeactivateTarget] = useState<CarnetDeConducir | null>(null);

  const operadores = useMemo(() => {
    if (!catalogData?.usuarios) return [];
    return catalogData.usuarios.filter(
      (u) => u.activo !== false && esOperador(u.roles ?? [])
    );
  }, [catalogData?.usuarios]);

  const fetchCarnets = useCallback(async () => {
    try {
      const data = await carnetService.listarCarnets();
      setCarnets(data);
    } catch (err) {
      setPageError("Error al cargar los carnets.");
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
      setPageError("Seleccione un operador y complete la fecha de vencimiento.");
      return;
    }
    setPageError(null);
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
      setPageError((err as Error).message || "Error al crear el carnet.");
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
    setPageError(null);
    try {
      await carnetService.actualizarCarnet({ carnetId: editId, fechaVencimiento: editFecha });
      setCarnets((prev) =>
        prev.map((c) => (c.id === editId ? { ...c, fechaVencimiento: editFecha } : c))
      );
      cancelEdit();
    } catch (err) {
      setPageError((err as Error).message || "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    setPageError(null);
    try {
      await carnetService.desactivarCarnet(deactivateTarget.id);
      setCarnets((prev) =>
        prev.map((c) => (c.id === deactivateTarget.id ? { ...c, activo: false } : c))
      );
      setDeactivateTarget(null);
    } catch (err) {
      setPageError((err as Error).message || "Error al desactivar.");
    } finally {
      setSaving(false);
    }
  };

  const activosCount = carnets.filter((c) => c.activo).length;

  if (loading) {
    return <LoadingSpinner fullScreen message="Cargando documentación..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <FileText className="w-7 h-7 text-brand-cta" />
              Documentación
            </h1>
            <p className="text-sm text-brand-pale mt-1">
              Carnets de conducir — seguimiento de vencimientos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-bold rounded-xl cursor-pointer transition-colors shadow-sm"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancelar" : "Nuevo carnet"}
          </button>
        </div>

        {pageError && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold">{pageError}</p>
          </div>
        )}

        {/* Formulario nuevo carnet */}
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
                <select
                  value={selectedUid}
                  onChange={(e) => handleSelectOperador(e.target.value)}
                  className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
                  required
                >
                  <option value="">Seleccionar operador...</option>
                  {operadores.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.nombre}{u.legajo ? ` — Legajo ${u.legajo}` : ""}
                    </option>
                  ))}
                </select>
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
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className="flex-grow px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
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

        {/* Filtros */}
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

            {/* Grid de tarjetas */}
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
                            <input
                              type="date"
                              value={editFecha}
                              onChange={(e) => setEditFecha(e.target.value)}
                              className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
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
    </Layout>
  );
};

export default DocumentacionPage;
