import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import AdminUsuariosPanel from "../components/admin/AdminUsuariosPanel";
import AdminDuplasPanel from "../components/admin/AdminDuplasPanel";
import AdminListFilters from "../components/admin/AdminListFilters";
import { CustomSelect } from "../components/shared/CustomSelect";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { useAdminCatalog } from "../hooks/useAdminCatalog";
import {
  Truck,
  Building2,
  Plus,
  Power,
  ListPlus,
  AlertCircle,
  MapPin,
  Users,
  Pencil,
  UserPlus,
  Tag,
  Trash2,
} from "lucide-react";
import { isMock, db, functions } from "../firebase";
import { setDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Grua, Corralon, TipoFlota, TIPO_FLOTA_OPTIONS, TIPO_FLOTA_FILTER_OPTIONS, labelTipoFlota, normalizeTipoFlota, matchesTipoFlotaFilter, buildGruaId } from "@gruasbacar/shared";
import { codigoInternoVisible } from "../utils/codigoVisible";
import { GruaDoc, CorralonDoc } from "../services/adminCatalog.cache";

type ConfigTab = "GRUAS" | "CORRALONES" | "DUPLAS" | "USUARIOS";

type DeleteTarget =
  | { kind: "grua"; item: GruaDoc }
  | { kind: "corralon"; item: CorralonDoc };

const TABS: { id: ConfigTab; label: string; icon: React.ReactNode }[] = [
  { id: "DUPLAS", label: "Duplas", icon: <UserPlus className="w-4 h-4" /> },
  { id: "GRUAS", label: "Grúas", icon: <Truck className="w-4 h-4" /> },
  { id: "CORRALONES", label: "Corralones", icon: <Building2 className="w-4 h-4" /> },
  { id: "USUARIOS", label: "Usuarios", icon: <Users className="w-4 h-4" /> },
];

const ESTADO_ACTIVO_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activos / disponibles" },
  { value: "INACTIVE", label: "Inactivos / de baja" },
];

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

function matchesActivoFilter(activo: boolean, filter: string): boolean {
  if (filter === "ACTIVE") return activo;
  if (filter === "INACTIVE") return !activo;
  return true;
}

export const AdminPage: React.FC = () => {
  const { loading } = useAuth();
  const { data, loading: catalogLoading, sync } = useAdminCatalog();

  const [gruaPatente, setGruaPatente] = useState("");
  const [gruaDesc, setGruaDesc] = useState("");
  const [gruaTipo, setGruaTipo] = useState<TipoFlota>("TRANSITO");

  const [corralonMapLink, setCorralonMapLink] = useState("");
  const [corralonNombre, setCorralonNombre] = useState("");
  const [corralonDireccion, setCorralonDireccion] = useState("");

  const [activeTab, setActiveTab] = useState<ConfigTab>("DUPLAS");
  const [savingState, setSavingState] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [editGruaDocId, setEditGruaDocId] = useState<string | null>(null);
  const [editGruaPatente, setEditGruaPatente] = useState("");
  const [editGruaDesc, setEditGruaDesc] = useState("");
  const [editGruaTipo, setEditGruaTipo] = useState<TipoFlota>("TRANSITO");

  const [editCorralonDocId, setEditCorralonDocId] = useState<string | null>(null);
  const [editCorralonNombre, setEditCorralonNombre] = useState("");
  const [editCorralonDireccion, setEditCorralonDireccion] = useState("");

  const [gruaSearch, setGruaSearch] = useState("");
  const [gruaEstadoFilter, setGruaEstadoFilter] = useState("ALL");
  const [gruaTipoFilter, setGruaTipoFilter] = useState("ALL");
  const [corralonSearch, setCorralonSearch] = useState("");
  const [corralonEstadoFilter, setCorralonEstadoFilter] = useState("ALL");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const gruas = data?.gruas ?? [];
  const corralones = data?.corralones ?? [];
  const duplas = data?.duplas ?? [];
  const usuarios = data?.usuarios ?? [];

  const filteredGruas = useMemo(() => {
    return gruas.filter((g) => {
      if (!matchesActivoFilter(g.activa, gruaEstadoFilter)) return false;
      if (!matchesTipoFlotaFilter(g.tipo, gruaTipoFilter)) return false;
      if (!gruaSearch.trim()) return true;
      const codigo = codigoInternoVisible(g.id, g.docId) ?? "";
      return (
        matchesSearch(g.patente, gruaSearch) ||
        matchesSearch(g.descripcion, gruaSearch) ||
        matchesSearch(codigo, gruaSearch)
      );
    });
  }, [gruas, gruaSearch, gruaEstadoFilter, gruaTipoFilter]);

  const filteredCorralones = useMemo(() => {
    return corralones.filter((c) => {
      if (!matchesActivoFilter(c.activo, corralonEstadoFilter)) return false;
      if (!corralonSearch.trim()) return true;
      const codigo = codigoInternoVisible(c.id, c.docId) ?? "";
      return (
        matchesSearch(c.nombre, corralonSearch) ||
        matchesSearch(c.direccion, corralonSearch) ||
        matchesSearch(codigo, corralonSearch)
      );
    });
  }, [corralones, corralonSearch, corralonEstadoFilter]);

  const handleCreateGrua = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gruaPatente || !gruaDesc || !data) {
      setPageError("Por favor, rellene toda la información para la nueva grúa.");
      return;
    }
    setPageError(null);
    setSavingState(true);

    const patente = gruaPatente.toUpperCase().trim().replace(/\s/g, '');
    const newGruaId = buildGruaId(patente);

    if (gruas.some((g) => g.docId === newGruaId || g.patente?.toUpperCase().replace(/\s/g, '') === patente)) {
      setPageError("Ya existe una grúa con esa patente.");
      setSavingState(false);
      return;
    }

    const newGrua: GruaDoc = {
      id: newGruaId,
      patente,
      descripcion: gruaDesc.trim(),
      activa: true,
      tipo: gruaTipo,
      docId: newGruaId,
    };

    try {
      if (!isMock && db) {
        await setDoc(doc(db, "gruas", newGrua.id), {
          id: newGrua.id,
          patente: newGrua.patente,
          descripcion: newGrua.descripcion,
          activa: newGrua.activa,
          tipo: newGrua.tipo,
        });
      } else {
        localStorage.setItem(
          "gruas_bacar_asset_catalog",
          JSON.stringify([...gruas, newGrua])
        );
      }

      sync({ ...data, gruas: [...gruas, newGrua] });
      setGruaPatente("");
      setGruaDesc("");
      setGruaTipo("TRANSITO");
    } catch (err) {
      console.error(err);
      setPageError("Error de comunicación con el motor de base de datos.");
    } finally {
      setSavingState(false);
    }
  };

  const handleCreateCorralon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corralonNombre || !corralonDireccion || !data) {
      setPageError("Por favor, rellene toda la información para el nuevo corralón.");
      return;
    }
    setPageError(null);
    setSavingState(true);

    let lat, lng;
    if (corralonMapLink.trim() && !isMock) {
      try {
        const resolveFn = httpsCallable<any, { lat: number; lng: number }>(functions, "resolverLinkMaps");
        const res = await resolveFn({ url: corralonMapLink.trim() });
        lat = res.data.lat;
        lng = res.data.lng;
      } catch (err) {
        console.error("Error resolviendo map link", err);
        setPageError("Error resolviendo el link de Google Maps. Asegúrate de que el enlace sea válido.");
        setSavingState(false);
        return;
      }
    }

    const newId = `C-${Date.now().toString(36).toUpperCase()}`;
    const newCorralon: CorralonDoc = {
      id: newId,
      nombre: corralonNombre.trim(),
      direccion: corralonDireccion.trim(),
      activo: true,
      docId: newId,
      ...(lat && lng ? { lat, lng } : {}),
    };

    try {
      if (!isMock && db) {
        await setDoc(doc(db, "corralones", newCorralon.id), {
          ...newCorralon
        });
      } else {
        localStorage.setItem(
          "corralones_bacar_asset_catalog",
          JSON.stringify([...corralones, newCorralon])
        );
      }

      sync({ ...data, corralones: [...corralones, newCorralon] });
      setCorralonMapLink("");
      setCorralonNombre("");
      setCorralonDireccion("");
    } catch (err) {
      console.error(err);
      setPageError("Error de comunicación con el motor de base de datos.");
    } finally {
      setSavingState(false);
    }
  };

  const toggleGruaActive = async (docId: string, current: boolean) => {
    if (!data) return;
    try {
      if (!isMock && db) {
        await updateDoc(doc(db, "gruas", docId), { activa: !current });
      }
      const next = gruas.map((g) => (g.docId === docId ? { ...g, activa: !current } : g));
      sync({ ...data, gruas: next });
      if (isMock) {
        localStorage.setItem("gruas_bacar_asset_catalog", JSON.stringify(next));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCorralonActive = async (docId: string, current: boolean) => {
    if (!data) return;
    try {
      if (!isMock && db) {
        await updateDoc(doc(db, "corralones", docId), { activo: !current });
      }
      const next = corralones.map((c) => (c.docId === docId ? { ...c, activo: !current } : c));
      sync({ ...data, corralones: next });
      if (isMock) {
        localStorage.setItem("corralones_bacar_asset_catalog", JSON.stringify(next));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!data || !target) return;

    setSavingState(true);
    setPageError(null);
    try {
      if (target.kind === "grua") {
        const g = target.item;
        if (!isMock && db) {
          await deleteDoc(doc(db, "gruas", g.docId));
        }
        const next = gruas.filter((item) => item.docId !== g.docId);
        sync({ ...data, gruas: next });
        if (isMock) {
          localStorage.setItem("gruas_bacar_asset_catalog", JSON.stringify(next));
        }
        if (editGruaDocId === g.docId) cancelEditGrua();
      } else {
        const c = target.item;
        if (!isMock && db) {
          await deleteDoc(doc(db, "corralones", c.docId));
        }
        const next = corralones.filter((item) => item.docId !== c.docId);
        sync({ ...data, corralones: next });
        if (isMock) {
          localStorage.setItem("corralones_bacar_asset_catalog", JSON.stringify(next));
        }
        if (editCorralonDocId === c.docId) cancelEditCorralon();
      }
    } catch (err) {
      console.error(err);
      setPageError(
        target.kind === "grua"
          ? "No se pudo eliminar la grúa."
          : "No se pudo eliminar el corralón."
      );
    } finally {
      setSavingState(false);
      setDeleteTarget(null);
    }
  };

  const deleteDialogTitle =
    deleteTarget?.kind === "grua"
      ? "¿Confirmar borrado de grúa?"
      : deleteTarget?.kind === "corralon"
        ? "¿Confirmar borrado de corralón?"
        : "";

  const deleteDialogMessage = (() => {
    if (!deleteTarget) return "";
    if (deleteTarget.kind === "grua") {
      const label = deleteTarget.item.descripcion?.trim() || deleteTarget.item.patente;
      return `Se eliminará la grúa "${label}" del catálogo. Esta acción no se puede deshacer.`;
    }
    const label = deleteTarget.item.nombre?.trim() || "este corralón";
    return `Se eliminará el corralón "${label}" del catálogo. Esta acción no se puede deshacer.`;
  })();

  const startEditGrua = (g: GruaDoc) => {
    setEditGruaDocId(g.docId);
    setEditGruaPatente(g.patente);
    setEditGruaDesc(g.descripcion);
    setEditGruaTipo(normalizeTipoFlota(g.tipo));
    setEditCorralonDocId(null);
  };

  const cancelEditGrua = () => {
    setEditGruaDocId(null);
    setEditGruaPatente("");
    setEditGruaDesc("");
    setEditGruaTipo("TRANSITO");
  };

  const saveEditGrua = async () => {
    if (!data || !editGruaDocId || !editGruaPatente.trim() || !editGruaDesc.trim()) return;
    setSavingState(true);
    setPageError(null);
    try {
      const updates = {
        patente: editGruaPatente.toUpperCase().trim(),
        descripcion: editGruaDesc.trim(),
        tipo: editGruaTipo,
      };
      if (!isMock && db) {
        await updateDoc(doc(db, "gruas", editGruaDocId), updates);
      }
      const next = gruas.map((g) =>
        g.docId === editGruaDocId ? { ...g, ...updates } : g
      );
      sync({ ...data, gruas: next });
      if (isMock) {
        localStorage.setItem("gruas_bacar_asset_catalog", JSON.stringify(next));
      }
      cancelEditGrua();
    } catch (err) {
      console.error(err);
      setPageError("No se pudo guardar los cambios de la grúa.");
    } finally {
      setSavingState(false);
    }
  };

  const startEditCorralon = (c: CorralonDoc) => {
    setEditCorralonDocId(c.docId);
    setEditCorralonNombre(c.nombre);
    setEditCorralonDireccion(c.direccion);
    setEditGruaDocId(null);
  };

  const cancelEditCorralon = () => {
    setEditCorralonDocId(null);
    setEditCorralonNombre("");
    setEditCorralonDireccion("");
  };

  const saveEditCorralon = async () => {
    if (!data || !editCorralonDocId || !editCorralonNombre.trim() || !editCorralonDireccion.trim()) return;
    setSavingState(true);
    setPageError(null);
    try {
      const updates = {
        nombre: editCorralonNombre.trim(),
        direccion: editCorralonDireccion.trim(),
      };
      if (!isMock && db) {
        await updateDoc(doc(db, "corralones", editCorralonDocId), updates);
      }
      const next = corralones.map((c) =>
        c.docId === editCorralonDocId ? { ...c, ...updates } : c
      );
      sync({ ...data, corralones: next });
      if (isMock) {
        localStorage.setItem("corralones_bacar_asset_catalog", JSON.stringify(next));
      }
      cancelEditCorralon();
    } catch (err) {
      console.error(err);
      setPageError("No se pudo guardar los cambios del corralón.");
    } finally {
      setSavingState(false);
    }
  };

  if (loading || catalogLoading || !data) {
    return <LoadingSpinner fullScreen message="Sincronizando paneles de control..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Configuración
          </h1>
          <p className="text-sm text-brand-pale mt-1">
            Gestione grúas, corralones, duplas y usuarios. Los cambios impactan en tiempo real en la operación.
          </p>
        </div>

        <div className="border border-brand-seashell rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-100/80 px-2 pt-2">
            <nav className="grid grid-cols-2 sm:grid-cols-4 gap-0.5" role="tablist" aria-label="Secciones de configuración">
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setPageError(null);
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-t-xl border border-b-0 transition-colors cursor-pointer min-w-0 ${
                      selected
                        ? "bg-white text-red-700 border-brand-seashell shadow-sm relative z-10 -mb-px"
                        : "bg-transparent text-brand-pale border-transparent hover:text-gray-700 hover:bg-white/50"
                    }`}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

        {pageError && activeTab !== "USUARIOS" && activeTab !== "DUPLAS" && (
          <div className="mx-4 mt-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold">{pageError}</p>
          </div>
        )}

        {/* Pestañas montadas en DOM: cambio instantáneo sin recargas */}
        <div className={activeTab === "DUPLAS" ? "" : "hidden"}>
          <AdminDuplasPanel
            duplas={duplas}
            gruas={gruas}
            onDuplasChange={(next) => sync({ ...data, duplas: next })}
            usuarios={usuarios}
          />
        </div>

        <div className={activeTab === "USUARIOS" ? "" : "hidden"}>
          <AdminUsuariosPanel
            usuarios={usuarios}
            onUsuariosChange={(next) => sync({ ...data, usuarios: next })}
          />
        </div>

        <div className={activeTab === "GRUAS" || activeTab === "CORRALONES" ? "" : "hidden"}>
          <div className="bg-white overflow-hidden">
            <div className="p-4 border-b border-brand-seashell/80">
              {activeTab === "GRUAS" && (
                <AdminListFilters
                  search={gruaSearch}
                  onSearchChange={setGruaSearch}
                  searchPlaceholder="Buscar por patente, descripción o código..."
                  status={gruaEstadoFilter}
                  onStatusChange={setGruaEstadoFilter}
                  statusOptions={ESTADO_ACTIVO_OPTIONS}
                  className="mb-0"
                  extraFilter={{
                    value: gruaTipoFilter,
                    onChange: setGruaTipoFilter,
                    options: TIPO_FLOTA_FILTER_OPTIONS,
                    ariaLabel: "Filtrar por tipo",
                    icon: Tag,
                  }}
                />
              )}
              {activeTab === "CORRALONES" && (
                <AdminListFilters
                  search={corralonSearch}
                  onSearchChange={setCorralonSearch}
                  searchPlaceholder="Buscar por nombre, dirección o código..."
                  status={corralonEstadoFilter}
                  onStatusChange={setCorralonEstadoFilter}
                  statusOptions={ESTADO_ACTIVO_OPTIONS}
                  className="mb-0"
                />
              )}
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className={activeTab === "GRUAS" ? "" : "hidden"}>
              <div className="border border-brand-seashell rounded-xl overflow-hidden">
                <div className="p-4 bg-brand-bg border-b border-brand-seashell">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-brand-cta" />
                    Catálogo de grúas ({filteredGruas.length}{gruaSearch || gruaEstadoFilter !== "ALL" || gruaTipoFilter !== "ALL" ? ` de ${gruas.length}` : ""})
                  </h3>
                </div>

                <div className="divide-y divide-gray-100">
                  {filteredGruas.length === 0 ? (
                    <p className="p-6 text-sm text-brand-pale text-center">
                      {gruas.length === 0
                        ? "No hay grúas registradas."
                        : "No hay grúas que coincidan con la búsqueda o el filtro."}
                    </p>
                  ) : (
                    filteredGruas.map((g) => {
                      const editing = editGruaDocId === g.docId;

                      return (
                        <div
                          key={g.docId}
                          className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50"
                        >
                          {editing ? (
                            <div className="flex-grow space-y-2">
                              <input
                                type="text"
                                value={editGruaPatente}
                                onChange={(e) => setEditGruaPatente(e.target.value)}
                                className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs font-mono uppercase"
                                placeholder="Patente"
                              />
                              <input
                                type="text"
                                value={editGruaDesc}
                                onChange={(e) => setEditGruaDesc(e.target.value)}
                                className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
                                placeholder="Descripción"
                              />
                              <CustomSelect
                                value={editGruaTipo}
                                onChange={(v) => setEditGruaTipo(v as TipoFlota)}
                                options={TIPO_FLOTA_OPTIONS}
                                ariaLabel="Tipo de flota"
                                icon={Tag}
                                size="sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={saveEditGrua}
                                  disabled={savingState}
                                  className="px-3 py-1.5 text-xs font-bold bg-brand-cta text-white rounded-lg disabled:opacity-60"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditGrua}
                                  className="px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-sans font-bold text-sm text-brand-purply">{g.descripcion}</span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                                      normalizeTipoFlota(g.tipo) === "TRANSPORTE"
                                        ? "bg-blue-50 text-blue-700 border-blue-200/50"
                                        : "bg-amber-50 text-amber-700 border-amber-200/50"
                                    }`}
                                  >
                                    {labelTipoFlota(g.tipo)}
                                  </span>
                                </div>
                                <p className="text-xs font-mono font-bold text-red-600 mt-1 tracking-wide">{g.patente}</p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[10px] font-mono tracking-wide px-2.5 py-0.5 rounded-lg border font-bold ${
                                    g.activa
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                      : "bg-rose-50 text-rose-700 border-rose-200/50"
                                  }`}
                                >
                                  {g.activa ? "DISPONIBLE" : "FUERA DE SERVICIO"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEditGrua(g)}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-indigo-500 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors"
                                  title="Editar grúa"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleGruaActive(g.docId, g.activa)}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-brand-cta text-brand-pale hover:text-brand-cta cursor-pointer transition-colors"
                                  title="Alternar disponibilidad"
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: "grua", item: g })}
                                  disabled={savingState}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-rose-500 text-brand-pale hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
                                  title="Eliminar grúa"
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

            <div className={activeTab === "CORRALONES" ? "" : "hidden"}>
              <div className="border border-brand-seashell rounded-xl overflow-hidden">
                <div className="p-4 bg-brand-bg border-b border-brand-seashell">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-brand-cta" />
                    Catálogo de corralones ({filteredCorralones.length}{corralonSearch || corralonEstadoFilter !== "ALL" ? ` de ${corralones.length}` : ""})
                  </h3>
                </div>

                <div className="divide-y divide-gray-100">
                  {filteredCorralones.length === 0 ? (
                    <p className="p-6 text-sm text-brand-pale text-center">
                      {corralones.length === 0
                        ? "No hay corralones registrados."
                        : "No hay corralones que coincidan con la búsqueda o el filtro."}
                    </p>
                  ) : (
                    filteredCorralones.map((c) => {
                      const codigo = codigoInternoVisible(c.id, c.docId);
                      const editing = editCorralonDocId === c.docId;

                      return (
                        <div
                          key={c.docId}
                          className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50"
                        >
                          {editing ? (
                            <div className="flex-grow space-y-2">
                              <input
                                type="text"
                                value={editCorralonNombre}
                                onChange={(e) => setEditCorralonNombre(e.target.value)}
                                className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
                                placeholder="Nombre"
                              />
                              <input
                                type="text"
                                value={editCorralonDireccion}
                                onChange={(e) => setEditCorralonDireccion(e.target.value)}
                                className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
                                placeholder="Dirección"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={saveEditCorralon}
                                  disabled={savingState}
                                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg disabled:opacity-60"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditCorralon}
                                  className="px-3 py-1.5 text-xs font-bold border border-brand-seashell rounded-lg"
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
                                    {c.nombre}
                                  </span>
                                  {codigo && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 bg-gray-100 text-zinc-600 rounded border">
                                      {codigo}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-brand-pale mt-1 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-gray-300" />
                                  {c.direccion}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[10px] font-mono tracking-wide px-2.5 py-0.5 rounded-lg border font-bold ${
                                    c.activo
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                      : "bg-rose-50 text-rose-700 border-rose-200/50"
                                  }`}
                                >
                                  {c.activo ? "ACTIVO" : "INACTIVO"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEditCorralon(c)}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-indigo-500 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors"
                                  title="Editar corralón"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleCorralonActive(c.docId, c.activo)}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-brand-cta text-brand-pale hover:text-brand-cta cursor-pointer transition-colors"
                                  title="Alternar disponibilidad"
                                >
                                  <Power className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: "corralon", item: c })}
                                  disabled={savingState}
                                  className="p-1.5 rounded-lg border border-brand-seashell hover:border-rose-500 text-brand-pale hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
                                  title="Eliminar corralón"
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
          </div>

          <div className="bg-white p-5 rounded-2xl border border-brand-seashell shadow-sm h-fit space-y-5">
            <div className={activeTab === "GRUAS" ? "" : "hidden"}>
              <div className="flex items-center gap-2 pb-3 border-b border-gray-105">
                <ListPlus className="w-5 h-5 text-brand-cta" />
                <h3 className="font-bold text-sm text-gray-900">Añadir grúa</h3>
              </div>

              <form onSubmit={handleCreateGrua} className="space-y-4 mt-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Patente
                  </label>
                  <input
                    type="text"
                    value={gruaPatente}
                    onChange={(e) => setGruaPatente(e.target.value)}
                    placeholder="Ej: AA881ZZ"
                    className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs font-mono uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={gruaDesc}
                    onChange={(e) => setGruaDesc(e.target.value)}
                    placeholder="Ej: Grúa hidráulica Ram 4000"
                    className="w-full px-3 py-2 bg-brand-bg border border-gray-250 rounded-lg text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Tipo
                  </label>
                  <CustomSelect
                    value={gruaTipo}
                    onChange={(v) => setGruaTipo(v as TipoFlota)}
                    options={TIPO_FLOTA_OPTIONS}
                    ariaLabel="Tipo de flota"
                    icon={Tag}
                    size="filter"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingState}
                  className="w-full py-2.5 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex justify-center items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Registrar grúa
                </button>
              </form>
            </div>

            <div className={activeTab === "CORRALONES" ? "" : "hidden"}>
              <div className="flex items-center gap-2 pb-3 border-b border-gray-105">
                <ListPlus className="w-5 h-5 text-brand-cta" />
                <h3 className="font-bold text-sm text-brand-purply">Añadir corralón</h3>
              </div>

              <form onSubmit={handleCreateCorralon} className="space-y-4 mt-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Link de Google Maps (Opcional)
                  </label>
                  <input
                    type="url"
                    value={corralonMapLink}
                    onChange={(e) => setCorralonMapLink(e.target.value)}
                    placeholder="Ej: https://maps.app.goo.gl/..."
                    className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={corralonNombre}
                    onChange={(e) => setCorralonNombre(e.target.value)}
                    placeholder="Ej: Playa Secuestro Central"
                    className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={corralonDireccion}
                    onChange={(e) => setCorralonDireccion(e.target.value)}
                    placeholder="Ej: Av. Córdoba 1205"
                    className="w-full px-3 py-2 bg-brand-bg border border-brand-seashell rounded-lg text-xs"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingState}
                  className="w-full py-2.5 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex justify-center items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Registrar corralón
                </button>
              </form>
            </div>
          </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        confirmText="Confirmar borrado"
        cancelText="Cancelar"
        danger
      />
    </Layout>
  );
};

export default AdminPage;
