import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  ExternalLink,
  FileUp,
  History,
  Plus,
  Power,
  RefreshCw,
  Shield,
  Truck,
  X,
} from "lucide-react";
import {
  Grua,
  PolizaSeguro,
  calcularEstadoPoliza,
  diasParaVencimiento,
} from "@gruasbacar/shared";
import AdminListFilters from "./AdminListFilters";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { CustomDatePicker } from "../shared/CustomDatePicker";
import LoadingSpinner from "../shared/LoadingSpinner";
import { gruaService } from "../../services/grua.service";
import * as polizaService from "../../services/poliza.service";

type VistaFilter = "ALL" | "VIGENTE" | "POR_VENCER" | "VENCIDO" | "HISTORICO";

const FILTER_OPTIONS: { value: VistaFilter; label: string }[] = [
  { value: "ALL", label: "Activas" },
  { value: "VIGENTE", label: "Vigentes" },
  { value: "POR_VENCER", label: "Por vencer" },
  { value: "VENCIDO", label: "Vencidas" },
  { value: "HISTORICO", label: "Historial" },
];

const EMPTY_FORM = {
  numeroPoliza: "",
  aseguradora: "",
  titular: "",
  cobertura: "",
  vigenciaDesde: "",
  fechaVencimiento: "",
};

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

function estadoVisual(poliza: PolizaSeguro) {
  if (!poliza.activo) {
    return {
      label: "HISTÓRICA",
      badge: "bg-gray-100 text-gray-600 border-gray-200",
      border: "border-l-gray-300",
    };
  }
  const estado = calcularEstadoPoliza(poliza.fechaVencimiento);
  const dias = diasParaVencimiento(poliza.fechaVencimiento);
  if (estado === "VENCIDO") {
    return {
      label: "VENCIDA",
      badge: "bg-red-100 text-red-800 border-red-300/50",
      border: "border-l-red-600",
    };
  }
  if (estado !== "VIGENTE") {
    return {
      label: `VENCE EN ${dias} DÍAS`,
      badge: "bg-amber-50 text-amber-700 border-amber-200/50",
      border: "border-l-amber-500",
    };
  }
  return {
    label: "VIGENTE",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
    border: "border-l-emerald-500",
  };
}

const PolizasTab: React.FC = () => {
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedGruaIds, setSelectedGruaIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [renovando, setRenovando] = useState<PolizaSeguro | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [deactivateTarget, setDeactivateTarget] = useState<PolizaSeguro | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [polizasData, gruasData] = await Promise.all([
        polizaService.listarPolizas(),
        gruaService.getGruasActivas(),
      ]);
      setPolizas(polizasData);
      setGruas(gruasData);
    } catch (err) {
      setError((err as Error).message || "Error al cargar las pólizas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return polizas.filter((poliza) => {
      if (status === "HISTORICO") {
        if (poliza.activo) return false;
      } else {
        if (!poliza.activo) return false;
        const estado = calcularEstadoPoliza(poliza.fechaVencimiento);
        if (status === "VIGENTE" && estado !== "VIGENTE") return false;
        if (status === "VENCIDO" && estado !== "VENCIDO") return false;
        if (
          status === "POR_VENCER" &&
          (estado === "VIGENTE" || estado === "VENCIDO")
        ) {
          return false;
        }
      }

      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (poliza.numeroPoliza ?? "").toLowerCase().includes(q) ||
        poliza.id.toLowerCase().includes(q) ||
        poliza.aseguradora.toLowerCase().includes(q) ||
        (poliza.titular ?? "").toLowerCase().includes(q) ||
        poliza.gruas.some(
          (grua) =>
            grua.patente.toLowerCase().includes(q) ||
            (grua.descripcion ?? "").toLowerCase().includes(q)
        )
      );
    });
  }, [polizas, search, status]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedGruaIds([]);
    setFile(null);
    setRenovando(null);
  };

  const toggleForm = () => {
    if (showForm) resetForm();
    setShowForm((value) => !value);
    setError(null);
  };

  const iniciarRenovacion = (poliza: PolizaSeguro) => {
    setRenovando(poliza);
    setForm({
      numeroPoliza: poliza.numeroPoliza ?? "",
      aseguradora: poliza.aseguradora,
      titular: poliza.titular ?? "",
      cobertura: poliza.cobertura ?? "",
      vigenciaDesde: "",
      fechaVencimiento: "",
    });
    setSelectedGruaIds(poliza.gruas.map((grua) => grua.id));
    setFile(null);
    setShowForm(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleGrua = (gruaId: string) => {
    setSelectedGruaIds((current) =>
      current.includes(gruaId)
        ? current.filter((id) => id !== gruaId)
        : [...current, gruaId]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !form.aseguradora.trim() ||
      !form.vigenciaDesde ||
      !form.fechaVencimiento ||
      selectedGruaIds.length === 0
    ) {
      setError("Completá aseguradora, vigencia y al menos una grúa.");
      return;
    }

    setSaving(true);
    setError(null);
    let adjuntoSubido: Awaited<ReturnType<typeof polizaService.subirAdjuntoPoliza>> | null = null;
    let polizaCreada = false;
    try {
      if (file) {
        adjuntoSubido = await polizaService.subirAdjuntoPoliza(file);
      }
      await polizaService.crearPoliza({
        ...form,
        numeroPoliza: form.numeroPoliza.trim() || undefined,
        titular: form.titular.trim() || undefined,
        cobertura: form.cobertura.trim() || undefined,
        gruas: gruas
          .filter((grua) => selectedGruaIds.includes(grua.id))
          .map((grua) => ({
            id: grua.id,
            patente: grua.patente,
            descripcion: grua.descripcion,
          })),
        ...(adjuntoSubido ? { adjunto: adjuntoSubido } : {}),
        polizaAnteriorId: renovando?.id,
      });
      polizaCreada = true;
      resetForm();
      setShowForm(false);
      setStatus("ALL");
      await fetchData();
    } catch (err) {
      if (adjuntoSubido && !polizaCreada) {
        await polizaService
          .eliminarAdjuntoPoliza(adjuntoSubido.storagePath)
          .catch(() => undefined);
      }
      setError((err as Error).message || "No se pudo registrar la póliza.");
    } finally {
      setSaving(false);
    }
  };

  const abrirAdjunto = async (poliza: PolizaSeguro) => {
    if (!poliza.adjunto) return;
    setOpeningId(poliza.id);
    setError(null);
    try {
      await polizaService.abrirAdjuntoPoliza(poliza.adjunto);
    } catch (err) {
      setError((err as Error).message || "No se pudo abrir el archivo.");
    } finally {
      setOpeningId(null);
    }
  };

  const confirmarBaja = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    setError(null);
    try {
      await polizaService.desactivarPoliza(deactivateTarget.id);
      setPolizas((current) =>
        current.map((poliza) =>
          poliza.id === deactivateTarget.id ? { ...poliza, activo: false } : poliza
        )
      );
      setDeactivateTarget(null);
    } catch (err) {
      setError((err as Error).message || "No se pudo dar de baja la póliza.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="Cargando pólizas..." />;

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
          onClick={toggleForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-bold rounded-xl cursor-pointer transition-colors shadow-sm"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nueva póliza"}
        </button>
      </div>

      {showForm && (
        <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            {renovando ? (
              <RefreshCw className="w-4 h-4 text-brand-cta" />
            ) : (
              <Plus className="w-4 h-4 text-brand-cta" />
            )}
            <h3 className="font-bold text-sm text-gray-900">
              {renovando
                ? `Renovar póliza ${renovando.numeroPoliza || renovando.id}`
                : "Registrar nueva póliza"}
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Aseguradora
                </span>
                <input
                  value={form.aseguradora}
                  onChange={(e) => setForm({ ...form, aseguradora: e.target.value })}
                  className="w-full px-3 py-2 border border-brand-seashell rounded-lg text-xs"
                  maxLength={120}
                  required
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Número de póliza (opcional)
                </span>
                <input
                  value={form.numeroPoliza}
                  onChange={(e) => setForm({ ...form, numeroPoliza: e.target.value })}
                  className="w-full px-3 py-2 border border-brand-seashell rounded-lg text-xs font-mono"
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Titular (opcional)
                </span>
                <input
                  value={form.titular}
                  onChange={(e) => setForm({ ...form, titular: e.target.value })}
                  className="w-full px-3 py-2 border border-brand-seashell rounded-lg text-xs"
                  maxLength={160}
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Cobertura (opcional)
                </span>
                <input
                  value={form.cobertura}
                  onChange={(e) => setForm({ ...form, cobertura: e.target.value })}
                  className="w-full px-3 py-2 border border-brand-seashell rounded-lg text-xs"
                  maxLength={160}
                />
              </label>
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Vigente desde
                </span>
                <CustomDatePicker
                  value={form.vigenciaDesde}
                  onChange={(value) => setForm({ ...form, vigenciaDesde: value })}
                  placeholder="Inicio de vigencia..."
                  size="sm"
                  required
                />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Vence
                </span>
                <CustomDatePicker
                  value={form.fechaVencimiento}
                  onChange={(value) => setForm({ ...form, fechaVencimiento: value })}
                  placeholder="Fecha de vencimiento..."
                  size="sm"
                  required
                />
              </div>
              <label className="block sm:col-span-2">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Foto o PDF de la póliza
                </span>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-brand-pale file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-bold file:cursor-pointer"
                />
                <span className="text-[10px] text-gray-400">
                  Opcional. Imagen o PDF, máximo 10 MB.
                </span>
              </label>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Grúas cubiertas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {gruas.map((grua) => (
                  <label
                    key={grua.id}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedGruaIds.includes(grua.id)
                        ? "border-brand-cta bg-red-50/50"
                        : "border-brand-seashell hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGruaIds.includes(grua.id)}
                      onChange={() => toggleGrua(grua.id)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-cta focus:ring-brand-cta"
                    />
                    <Truck className="w-4 h-4 text-brand-pale shrink-0" />
                    <span className="text-xs font-semibold text-gray-700">
                      {grua.descripcion?.trim() || grua.patente}
                      {grua.descripcion?.trim() && (
                        <span className="ml-1 font-mono text-brand-pale">{grua.patente}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-2"
              >
                <FileUp className="w-4 h-4" />
                {saving ? "Guardando..." : renovando ? "Guardar renovación" : "Registrar póliza"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-brand-seashell rounded-2xl shadow-sm bg-white">
        <div className="p-3 border-b border-brand-seashell/50 bg-gray-50/50 rounded-t-2xl">
          <AdminListFilters
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar póliza, aseguradora o patente..."
            status={status}
            onStatusChange={setStatus}
            statusOptions={FILTER_OPTIONS}
            className="mb-0"
          />
        </div>

        <div className="p-4">
          <p className="text-xs font-semibold text-brand-pale mb-4">
            {filtered.length} póliza{filtered.length !== 1 ? "s" : ""}
          </p>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-brand-pale">
                {status === "HISTORICO"
                  ? "Todavía no hay renovaciones o pólizas dadas de baja."
                  : "No hay pólizas que coincidan con la búsqueda o el filtro."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((poliza) => {
                const visual = estadoVisual(poliza);
                return (
                  <article
                    key={poliza.id}
                    className={`border border-brand-seashell rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow border-l-4 ${visual.border}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span
                          className={`text-[10px] font-mono tracking-wide px-2 py-0.5 rounded-md border font-bold ${visual.badge}`}
                        >
                          {visual.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {poliza.adjunto && (
                            <button
                              type="button"
                              onClick={() => abrirAdjunto(poliza)}
                              disabled={openingId === poliza.id}
                              className="p-1 rounded-md hover:bg-gray-100 text-brand-pale hover:text-brand-cta disabled:opacity-40"
                              title="Abrir archivo adjunto"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {poliza.activo && (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarRenovacion(poliza)}
                                className="p-1 rounded-md hover:bg-gray-100 text-brand-pale hover:text-indigo-500"
                                title="Renovar conservando historial"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeactivateTarget(poliza)}
                                disabled={saving}
                                className="p-1 rounded-md hover:bg-gray-100 text-brand-pale hover:text-rose-500 disabled:opacity-40"
                                title="Dar de baja"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="font-bold text-sm text-gray-900">{poliza.aseguradora}</p>
                      <p className="font-mono text-xs font-bold text-red-600 mt-0.5">
                        {poliza.numeroPoliza || "Sin número de póliza"}
                      </p>

                      <div className="mt-3 space-y-1.5 text-xs text-brand-pale">
                        {poliza.titular && (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span>{poliza.titular}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          <span>
                            {formatFecha(poliza.vigenciaDesde)} al{" "}
                            <strong className="text-gray-700">
                              {formatFecha(poliza.fechaVencimiento)}
                            </strong>
                          </span>
                        </div>
                        {poliza.cobertura && (
                          <div className="flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span>{poliza.cobertura}</span>
                          </div>
                        )}
                        {!poliza.activo && poliza.reemplazadaPor && (
                          <div className="flex items-center gap-2 text-indigo-600">
                            <History className="w-3.5 h-3.5 shrink-0" />
                            <span>Renovada por {poliza.reemplazadaPor}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {poliza.gruas.map((grua) => (
                          <span
                            key={grua.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-[10px] font-bold text-gray-600"
                            title={grua.descripcion}
                          >
                            <Truck className="w-3 h-3" />
                            {grua.patente}
                          </span>
                        ))}
                      </div>

                      {poliza.adjunto && (
                        <button
                          type="button"
                          onClick={() => abrirAdjunto(poliza)}
                          disabled={openingId === poliza.id}
                          className="mt-3 text-[10px] font-semibold text-brand-pale hover:text-brand-cta disabled:opacity-40"
                        >
                          {openingId === poliza.id
                            ? "Abriendo archivo..."
                            : poliza.adjunto.nombre}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmarBaja}
        title="Dar de baja póliza"
        message={`¿Dar de baja la póliza ${deactivateTarget?.numeroPoliza || deactivateTarget?.id || ""}? El registro seguirá disponible en el historial.`}
        confirmText="Confirmar baja"
        cancelText="Cancelar"
        danger
      />
    </>
  );
};

export default PolizasTab;
