import React, { useMemo, useState } from "react";
import { setDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { Users, Plus, Power, Pencil, ListPlus, AlertCircle, Tag, Trash2, Truck, X, LayoutGrid, FileSpreadsheet } from "lucide-react";
import { isMock, db } from "../../firebase";
import AdminListFilters from "./AdminListFilters";
import { DuplaDoc, GruaDoc } from "../../services/adminCatalog.cache";
import { codigoInternoVisible } from "../../utils/codigoVisible";
import {
  Usuario,
  normalizeRoles,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  TIPO_FLOTA_FILTER_OPTIONS,
  labelTipoFlota,
  normalizeTipoFlota,
  matchesTipoFlotaFilter,
  enganchadorDeDupla,
} from "@gruasbacar/shared";
import { CustomSelect } from "../shared/CustomSelect";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { DuplasImportModal } from "./DuplasImportModal";

const ESTADO_ACTIVO_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activas / disponibles" },
  { value: "INACTIVE", label: "Inactivas / de baja" },
];

const SIN_GRUA = "";

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

function matchesActivoFilter(activa: boolean, filter: string): boolean {
  if (filter === "ACTIVE") return activa;
  if (filter === "INACTIVE") return !activa;
  return true;
}

function getPrefix(name: string): string {
  if (!name) return "";
  const words = name.trim().split(" ");
  const surname = words.length > 1 ? words[words.length - 1] : words[0];
  return surname.substring(0, 2).toUpperCase();
}

function gruaLabel(g: GruaDoc): string {
  const desc = g.descripcion?.trim();
  return desc ? `${g.patente} — ${desc}` : g.patente;
}

function resolveGrua(gruas: GruaDoc[], gruaId?: string): GruaDoc | undefined {
  if (!gruaId?.trim()) return undefined;
  return gruas.find((g) => g.docId === gruaId || g.id === gruaId);
}

function gruasParaTipo(gruas: GruaDoc[], tipo: TipoFlota): GruaDoc[] {
  return gruas
    .filter((g) => g.activa && matchesTipoFlotaFilter(g.tipo, tipo))
    .sort((a, b) => a.patente.localeCompare(b.patente, "es"));
}

interface AdminDuplasPanelProps {
  duplas: DuplaDoc[];
  gruas: GruaDoc[];
  usuarios: Usuario[];
  onDuplasChange: (next: DuplaDoc[]) => void;
}

export const AdminDuplasPanel: React.FC<AdminDuplasPanelProps> = ({
  duplas,
  gruas,
  usuarios,
  onDuplasChange,
}) => {
  const [duplaChofer, setDuplaChofer] = useState("");
  const [duplaEnganchador, setDuplaEnganchador] = useState("");
  const [duplaTipo, setDuplaTipo] = useState<TipoFlota>("TRANSITO");
  const [duplaGruaId, setDuplaGruaId] = useState(SIN_GRUA);
  const [savingState, setSavingState] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleteDuplaTarget, setDeleteDuplaTarget] = useState<DuplaDoc | null>(null);
  const [showDiagramaModal, setShowDiagramaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [editDuplaDocId, setEditDuplaDocId] = useState<string | null>(null);
  const [editChofer, setEditChofer] = useState("");
  const [editEnganchador, setEditEnganchador] = useState("");
  const [editTipo, setEditTipo] = useState<TipoFlota>("TRANSITO");
  const [editGruaId, setEditGruaId] = useState(SIN_GRUA);

  const [duplaSearch, setDuplaSearch] = useState("");
  const [duplaEstadoFilter, setDuplaEstadoFilter] = useState("ALL");
  const [duplaTipoFilter, setDuplaTipoFilter] = useState("ALL");

  const choferes = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("CHOFER") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [usuarios]
  );
  const enganchadores = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("ENGANCHADOR") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [usuarios]
  );

  const gruasDuplicadas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of duplas) {
      const id = d.gruaId?.trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [duplas]);

  const duplasParaDiagrama = useMemo(
    () => duplas.filter((d) => d.activa).sort((a, b) => a.chofer.localeCompare(b.chofer, "es")),
    [duplas]
  );

  const filteredDuplas = useMemo(() => {
    return duplas.filter((d) => {
      if (!matchesActivoFilter(d.activa, duplaEstadoFilter)) return false;
      if (!matchesTipoFlotaFilter(d.tipo, duplaTipoFilter)) return false;
      if (!duplaSearch.trim()) return true;
      const codigo = codigoInternoVisible(d.id, d.docId) ?? "";
      const grua = resolveGrua(gruas, d.gruaId);
      const gruaText = grua ? `${grua.patente} ${grua.descripcion ?? ""}` : "";
      return (
        matchesSearch(d.chofer, duplaSearch) ||
        matchesSearch(enganchadorDeDupla(d), duplaSearch) ||
        matchesSearch(codigo, duplaSearch) ||
        matchesSearch(gruaText, duplaSearch)
      );
    });
  }, [duplas, duplaSearch, duplaEstadoFilter, duplaTipoFilter, gruas]);

  const gruaOptionsForTipo = (tipo: TipoFlota) => [
    { value: SIN_GRUA, label: "Sin grúa asignada" },
    ...gruasParaTipo(gruas, tipo).map((g) => ({
      value: g.docId,
      label: gruaLabel(g),
    })),
  ];

  const persistLocal = (next: DuplaDoc[]) => {
    localStorage.setItem(
      "duplas_bacar_asset_catalog",
      JSON.stringify(next.map(({ docId, ...rest }) => ({ ...rest, id: docId })))
    );
  };

  const patchDuplaGrua = async (docId: string, gruaId: string) => {
    const normalized = gruaId.trim() || undefined;
    setPageError(null);
    try {
      if (!isMock && db) {
        await updateDoc(doc(db, "duplas", docId), { gruaId: normalized ?? "" });
      }
      const next = duplas.map((d) => (d.docId === docId ? { ...d, gruaId: normalized } : d));
      onDuplasChange(next);
      if (isMock) persistLocal(next);
    } catch (err) {
      console.error(err);
      setPageError("No se pudo asignar la grúa a la dupla.");
    }
  };

  const handleCreateDupla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplaChofer.trim() || !duplaEnganchador.trim()) {
      setPageError("Completá chofer y enganchador para la nueva dupla.");
      return;
    }

    setPageError(null);
    setSavingState(true);

    const nextNum = (duplas.length + 1).toString().padStart(3, "0");
    const ap1 = getPrefix(duplaChofer);
    const ap2 = getPrefix(duplaEnganchador);
    const id = `D${nextNum}-${ap1}${ap2}`;

    if (duplas.some((d) => d.docId === id || d.id === id)) {
      setPageError("Error interno: Código de dupla duplicado. Intente modificar un nombre o avise a soporte.");
      setSavingState(false);
      return;
    }

    const gruaId = duplaGruaId.trim() || undefined;

    const newDupla: DuplaDoc = {
      id,
      docId: id,
      chofer: duplaChofer.trim(),
      enganchador: duplaEnganchador.trim(),
      activa: true,
      tipo: duplaTipo,
      gruaId,
    };

    try {
      if (!isMock && db) {
        await setDoc(doc(db, "duplas", id), {
          id,
          chofer: newDupla.chofer,
          enganchador: newDupla.enganchador,
          activa: true,
          tipo: newDupla.tipo,
          ...(gruaId ? { gruaId } : {}),
        });
      }

      const next = [...duplas, newDupla].sort((a, b) => a.chofer.localeCompare(b.chofer, "es"));
      onDuplasChange(next);
      if (isMock) persistLocal(next);

      setDuplaChofer("");
      setDuplaEnganchador("");
      setDuplaTipo("TRANSITO");
      setDuplaGruaId(SIN_GRUA);
    } catch (err) {
      console.error(err);
      setPageError("No se pudo registrar la dupla.");
    } finally {
      setSavingState(false);
    }
  };

  const toggleDuplaActive = async (docId: string, current: boolean) => {
    try {
      if (!isMock && db) {
        await updateDoc(doc(db, "duplas", docId), { activa: !current });
      }
      const next = duplas.map((d) => (d.docId === docId ? { ...d, activa: !current } : d));
      onDuplasChange(next);
      if (isMock) persistLocal(next);
    } catch (err) {
      console.error(err);
      setPageError("No se pudo cambiar el estado de la dupla.");
    }
  };

  const confirmDeleteDupla = async () => {
    if (!deleteDuplaTarget) return;

    const d = deleteDuplaTarget;
    setSavingState(true);
    setPageError(null);
    try {
      if (!isMock && db) {
        await deleteDoc(doc(db, "duplas", d.docId));
      }
      const next = duplas.filter((item) => item.docId !== d.docId);
      onDuplasChange(next);
      if (isMock) persistLocal(next);
      if (editDuplaDocId === d.docId) cancelEditDupla();
    } catch (err) {
      console.error(err);
      setPageError("No se pudo eliminar la dupla.");
    } finally {
      setSavingState(false);
      setDeleteDuplaTarget(null);
    }
  };

  const startEditDupla = (d: DuplaDoc) => {
    setEditDuplaDocId(d.docId);
    setEditChofer(d.chofer);
    setEditEnganchador(enganchadorDeDupla(d));
    setEditTipo(normalizeTipoFlota(d.tipo));
    setEditGruaId(d.gruaId ?? SIN_GRUA);
  };

  const cancelEditDupla = () => {
    setEditDuplaDocId(null);
    setEditChofer("");
    setEditEnganchador("");
    setEditTipo("TRANSITO");
    setEditGruaId(SIN_GRUA);
  };

  const saveEditDupla = async () => {
    if (!editDuplaDocId || !editChofer.trim() || !editEnganchador.trim()) return;
    setSavingState(true);
    setPageError(null);
    try {
      const gruaId = editGruaId.trim() || undefined;
      const updates = {
        chofer: editChofer.trim(),
        enganchador: editEnganchador.trim(),
        tipo: editTipo,
        gruaId: gruaId ?? "",
      };
      if (!isMock && db) {
        await updateDoc(doc(db, "duplas", editDuplaDocId), updates);
      }
      const next = duplas
        .map((d) =>
          d.docId === editDuplaDocId
            ? { ...d, chofer: updates.chofer, enganchador: updates.enganchador, tipo: updates.tipo, gruaId }
            : d
        )
        .sort((a, b) => a.chofer.localeCompare(b.chofer, "es"));
      onDuplasChange(next);
      if (isMock) persistLocal(next);
      cancelEditDupla();
    } catch (err) {
      console.error(err);
      setPageError("No se pudo guardar los cambios de la dupla.");
    } finally {
      setSavingState(false);
    }
  };

  return (
    <div className="bg-white overflow-hidden">
      {pageError && (
        <div className="mx-4 mt-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold">{pageError}</p>
        </div>
      )}

      <div className={`p-4 border-b border-brand-seashell/80 ${pageError ? "pt-3" : ""}`}>
        <AdminListFilters
          search={duplaSearch}
          onSearchChange={setDuplaSearch}
          searchPlaceholder="Buscar por chofer, enganchador, grúa o código..."
          status={duplaEstadoFilter}
          onStatusChange={setDuplaEstadoFilter}
          statusOptions={ESTADO_ACTIVO_OPTIONS}
          className="mb-0"
          extraFilter={{
            value: duplaTipoFilter,
            onChange: setDuplaTipoFilter,
            options: TIPO_FLOTA_FILTER_OPTIONS,
            ariaLabel: "Filtrar por tipo",
            icon: Tag,
          }}
        />
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="border border-brand-seashell rounded-xl overflow-hidden">
            <div className="p-4 bg-brand-bg border-b border-brand-seashell">
              <h3 className="text-sm font-bold text-brand-purply flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-cta" />
                Catálogo de duplas ({filteredDuplas.length}
                {duplaSearch || duplaEstadoFilter !== "ALL" || duplaTipoFilter !== "ALL" ? ` de ${duplas.length}` : ""})
              </h3>
            </div>

            <div className="divide-y divide-gray-100">
              {filteredDuplas.length === 0 ? (
                <p className="p-6 text-sm text-brand-pale text-center">
                  {duplas.length === 0
                    ? "No hay duplas registradas."
                    : "No hay duplas que coincidan con la búsqueda o el filtro."}
                </p>
              ) : (
                filteredDuplas.map((d) => {
                  const codigo = codigoInternoVisible(d.id, d.docId);
                  const editing = editDuplaDocId === d.docId;
                  const gruaAsignada = resolveGrua(gruas, d.gruaId);

                  return (
                    <div
                      key={d.docId}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50"
                    >
                      {editing ? (
                        <div className="flex-grow space-y-2">
                          <CustomSelect
                            value={editChofer}
                            onChange={setEditChofer}
                            options={choferes.map((c) => ({ value: c.nombre, label: c.nombre }))}
                            placeholder="Seleccione chofer"
                            icon={Users}
                            size="sm"
                          />
                          <CustomSelect
                            value={editEnganchador}
                            onChange={setEditEnganchador}
                            options={enganchadores.map((e) => ({ value: e.nombre, label: e.nombre }))}
                            placeholder="Seleccione enganchador"
                            icon={Users}
                            size="sm"
                          />
                          <CustomSelect
                            value={editTipo}
                            onChange={(v) => setEditTipo(v as TipoFlota)}
                            options={TIPO_FLOTA_OPTIONS}
                            ariaLabel="Tipo de flota"
                            icon={Tag}
                            size="sm"
                          />
                          <CustomSelect
                            value={editGruaId}
                            onChange={setEditGruaId}
                            options={gruaOptionsForTipo(editTipo)}
                            placeholder="Grúa asignada"
                            icon={Truck}
                            size="sm"
                            ariaLabel="Grúa asignada"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveEditDupla}
                              disabled={savingState}
                              className="px-3 py-1.5 text-xs font-bold bg-brand-cta text-white rounded-lg disabled:opacity-60 cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditDupla}
                              className="px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-sans font-bold text-sm text-gray-900">
                                {d.chofer}
                              </span>
                              <span className="text-xs text-brand-pale">+</span>
                              <span className="font-sans font-semibold text-sm text-brand-purply">
                                {enganchadorDeDupla(d)}
                              </span>
                              {codigo && (
                                <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-100 text-zinc-600 rounded border">
                                  {codigo}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                                  normalizeTipoFlota(d.tipo) === "TRANSPORTE"
                                    ? "bg-blue-50 text-blue-700 border-blue-200/50"
                                    : "bg-amber-50 text-amber-700 border-amber-200/50"
                                }`}
                              >
                                {labelTipoFlota(d.tipo)}
                              </span>
                            </div>
                            <p className="text-[10px] text-brand-pale mt-1 uppercase tracking-wide font-bold">
                              Chofer · Enganchador
                            </p>
                            <p className="text-xs text-brand-purply/80 mt-1 flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5 text-brand-pale shrink-0" />
                              {gruaAsignada ? (
                                <span>
                                  Grúa: <span className="font-bold">{gruaAsignada.patente}</span>
                                  {gruaAsignada.descripcion?.trim() ? ` — ${gruaAsignada.descripcion.trim()}` : ""}
                                </span>
                              ) : (
                                <span className="text-brand-pale italic">Sin grúa asignada</span>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] font-mono tracking-wide px-2.5 py-0.5 rounded-lg border font-bold ${
                                d.activa
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                  : "bg-rose-50 text-rose-700 border-rose-200/50"
                              }`}
                            >
                              {d.activa ? "DISPONIBLE" : "INACTIVA"}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEditDupla(d)}
                              className="p-1.5 rounded-lg border border-brand-seashell hover:border-indigo-500 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors"
                              title="Editar dupla"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleDuplaActive(d.docId, d.activa)}
                              className="p-1.5 rounded-lg border border-brand-seashell hover:border-brand-cta text-brand-pale hover:text-brand-cta cursor-pointer transition-colors"
                              title="Alternar disponibilidad"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDuplaTarget(d)}
                              disabled={savingState}
                              className="p-1.5 rounded-lg border border-brand-seashell hover:border-rose-500 text-brand-pale hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
                              title="Eliminar dupla"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 h-fit">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-white border border-brand-seashell hover:border-brand-cta text-brand-purply cursor-pointer transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-brand-cta" />
            Importar desde Excel
          </button>

          <button
            type="button"
            onClick={() => setShowDiagramaModal(true)}
            disabled={duplasParaDiagrama.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-brand-cta hover:bg-brand-cta/90 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
          >
            <LayoutGrid className="w-4 h-4" />
            Diagramar grúas
            {duplasParaDiagrama.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/20 border border-white/30 text-white">
                {duplasParaDiagrama.length}
              </span>
            )}
          </button>

          <div className="bg-white p-5 rounded-2xl border border-brand-seashell shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-105">
            <ListPlus className="w-5 h-5 text-brand-cta" />
            <h3 className="font-bold text-sm text-gray-900">Armar dupla</h3>
          </div>

          <form onSubmit={handleCreateDupla} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Chofer
              </label>
              <CustomSelect
                value={duplaChofer}
                onChange={setDuplaChofer}
                options={choferes.map((c) => ({ value: c.nombre, label: c.nombre }))}
                placeholder="Seleccione chofer"
                icon={Users}
                size="filter"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Enganchador
              </label>
              <CustomSelect
                value={duplaEnganchador}
                onChange={setDuplaEnganchador}
                options={enganchadores.map((e) => ({ value: e.nombre, label: e.nombre }))}
                placeholder="Seleccione enganchador"
                icon={Users}
                size="filter"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Tipo
              </label>
              <CustomSelect
                value={duplaTipo}
                onChange={(v) => {
                  setDuplaTipo(v as TipoFlota);
                  setDuplaGruaId(SIN_GRUA);
                }}
                options={TIPO_FLOTA_OPTIONS}
                ariaLabel="Tipo de flota"
                icon={Tag}
                size="filter"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Grúa asignada
              </label>
              <CustomSelect
                value={duplaGruaId}
                onChange={setDuplaGruaId}
                options={gruaOptionsForTipo(duplaTipo)}
                placeholder="Opcional"
                icon={Truck}
                size="filter"
                ariaLabel="Grúa asignada"
              />
            </div>

            <button
              type="submit"
              disabled={savingState}
              className="w-full py-2.5 bg-brand-cta hover:bg-brand-cta/90 disabled:opacity-60 text-white text-xs font-bold rounded-lg cursor-pointer flex justify-center items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Registrar dupla
            </button>
          </form>
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteDuplaTarget !== null}
        onClose={() => setDeleteDuplaTarget(null)}
        onConfirm={confirmDeleteDupla}
        title="¿Confirmar borrado de dupla?"
        message={
          deleteDuplaTarget
            ? `Se eliminará la dupla "${deleteDuplaTarget.chofer} + ${enganchadorDeDupla(deleteDuplaTarget)}" del catálogo. Esta acción no se puede deshacer.`
            : ""
        }
        confirmText="Confirmar borrado"
        cancelText="Cancelar"
        danger
      />

      {showDiagramaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDiagramaModal(false)}
            aria-hidden
          />

          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-brand-seashell z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-brand-seashell flex items-start justify-between gap-3 shrink-0">
              <div>
                <p className="text-[10px] font-mono font-bold text-brand-cta uppercase tracking-wider">
                  Asignación de flota
                </p>
                <h3 className="text-base font-bold text-brand-purply mt-1 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-brand-cta" />
                  Diagramar grúa por dupla
                </h3>
                <p className="text-xs text-brand-pale mt-1">
                  Asigná la grúa habitual de cada dupla activa. Solo se listan grúas del mismo tipo operativo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagramaModal(false)}
                className="p-1 rounded-lg text-brand-pale hover:bg-brand-bg cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-grow divide-y divide-gray-100">
              {duplasParaDiagrama.length === 0 ? (
                <p className="p-8 text-sm text-brand-pale text-center">
                  No hay duplas activas para diagramar.
                </p>
              ) : (
                duplasParaDiagrama.map((d) => {
                  const tipo = normalizeTipoFlota(d.tipo);
                  const gruaAsignada = resolveGrua(gruas, d.gruaId);
                  const duplicada = d.gruaId && gruasDuplicadas.has(d.gruaId);

                  return (
                    <div
                      key={`diagram-${d.docId}`}
                      className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center hover:bg-slate-50/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {d.chofer}
                          <span className="text-brand-pale font-normal mx-1">+</span>
                          {enganchadorDeDupla(d)}
                        </p>
                        <p className="text-[10px] text-brand-pale mt-0.5">{labelTipoFlota(d.tipo)}</p>
                      </div>
                      <div className="space-y-1">
                        <CustomSelect
                          value={d.gruaId ?? SIN_GRUA}
                          onChange={(v) => patchDuplaGrua(d.docId, v)}
                          options={gruaOptionsForTipo(tipo)}
                          placeholder="Elegir grúa"
                          icon={Truck}
                          size="sm"
                          ariaLabel={`Grúa para ${d.chofer} y ${enganchadorDeDupla(d)}`}
                        />
                        {duplicada && gruaAsignada && (
                          <p className="text-[10px] text-amber-700 font-semibold">
                            Esta grúa está asignada a más de una dupla.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-4 bg-brand-bg border-t border-brand-seashell flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowDiagramaModal(false)}
                className="px-4 py-2 text-xs font-bold bg-brand-cta hover:bg-brand-cta/90 text-white rounded-xl cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      <DuplasImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        duplas={duplas}
        gruas={gruas}
        usuarios={usuarios}
        onDuplasChange={onDuplasChange}
      />
    </div>
  );
};

export default AdminDuplasPanel;
