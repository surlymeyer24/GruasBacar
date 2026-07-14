import React, { useMemo, useState } from "react";
import {
  Clock,
  Pencil,
  AlertCircle,
  Truck,
  Users,
  User,
  X,
  CircleOff,
  Search,
} from "lucide-react";
import { isMock } from "../../firebase";
import {
  Usuario,
  AsignacionDiaria,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  normalizeTipoFlota,
  normalizeRoles,
  labelTipoFlota,
  turnoSigueVigente,
  enganchadorDeDupla,
  esOperador,
} from "@gruasbacar/shared";
import { DuplaDoc, GruaDoc } from "../../services/adminCatalog.cache";
import { CustomSelect } from "../shared/CustomSelect";
import AdminSectionToolbar from "./AdminSectionToolbar";
import AdminSubTabs from "./AdminSubTabs";
import { fechaHoyArgentina } from "../../utils/formatters";
import { asignarTurnoOperador } from "../../services/notificacion.service";

interface AdminTurnosPanelProps {
  usuarios: Usuario[];
  gruas: GruaDoc[];
  duplas: DuplaDoc[];
  onUsuariosChange: (next: Usuario[]) => void;
}

function formatHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DUPLA_MANUAL = "__manual__";

function gruaLabelPorPatente(gruas: GruaDoc[], patente: string): string {
  const g = gruas.find((gr) => gr.patente === patente);
  if (!g || !g.descripcion?.trim()) return patente;
  return `${g.descripcion.trim()} — ${patente}`;
}

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

export const AdminTurnosPanel: React.FC<AdminTurnosPanelProps> = ({
  usuarios,
  gruas,
  duplas,
  onUsuariosChange,
}) => {
  const [savingState, setSavingState] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [creatingFromDupla, setCreatingFromDupla] = useState<DuplaDoc | null>(null);
  const [editUsuarioUid, setEditUsuarioUid] = useState("");
  const [editTipoFlota, setEditTipoFlota] = useState<TipoFlota>("TRANSITO");
  const [editGruaPatente, setEditGruaPatente] = useState("");
  const [editDuplaId, setEditDuplaId] = useState("");
  const [editChofer, setEditChofer] = useState("");
  const [editEnganchador, setEditEnganchador] = useState("");
  const [turnoSearch, setTurnoSearch] = useState("");

  const hoy = fechaHoyArgentina();

  const turnosActivos = useMemo(() => {
    return usuarios.filter((u) => {
      const a = u.asignacionDiaria;
      if (!a || a.fecha !== hoy) return false;
      return turnoSigueVigente(a);
    });
  }, [usuarios, hoy]);

  const choferes = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("CHOFER") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  const enganchadores = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("ENGANCHADOR") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  const turnosActivosDuplaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const u of turnosActivos) {
      if (u.asignacionDiaria?.duplaId) ids.add(u.asignacionDiaria.duplaId);
    }
    return ids;
  }, [turnosActivos]);

  const duplasSinTurno = useMemo(
    () => duplas.filter((d) => d.activa && !turnosActivosDuplaIds.has(d.id)),
    [duplas, turnosActivosDuplaIds]
  );

  const filteredTurnosActivos = useMemo(() => {
    if (!turnoSearch.trim()) return turnosActivos;
    return turnosActivos.filter((u) => {
      const a = u.asignacionDiaria;
      if (!a) return false;
      const gruaText = gruaLabelPorPatente(gruas, a.gruaPatente);
      return (
        matchesSearch(u.nombre, turnoSearch) ||
        matchesSearch(a.gruaPatente, turnoSearch) ||
        matchesSearch(gruaText, turnoSearch) ||
        matchesSearch(a.duplaChofer, turnoSearch) ||
        matchesSearch(a.duplaEnganchador, turnoSearch)
      );
    });
  }, [turnosActivos, turnoSearch, gruas]);

  const filteredDuplasSinTurno = useMemo(() => {
    if (!turnoSearch.trim()) return duplasSinTurno;
    return duplasSinTurno.filter((d) => {
      const eng = enganchadorDeDupla(d);
      const gruaAsignada = gruas.find((g) => g.id === d.gruaId || g.docId === d.gruaId);
      const gruaText = gruaAsignada ? gruaLabelPorPatente(gruas, gruaAsignada.patente) : "";
      return (
        matchesSearch(d.chofer, turnoSearch) ||
        matchesSearch(eng, turnoSearch) ||
        matchesSearch(gruaText, turnoSearch)
      );
    });
  }, [duplasSinTurno, turnoSearch, gruas]);

  const turnosActivosUids = useMemo(() => {
    const uids = new Set<string>();
    for (const u of turnosActivos) uids.add(u.uid);
    return uids;
  }, [turnosActivos]);

  const nombresEnTurnoActivo = useMemo(() => {
    const nombres = new Set<string>();
    for (const u of turnosActivos) {
      const a = u.asignacionDiaria;
      if (a?.duplaChofer) nombres.add(a.duplaChofer.trim().toLowerCase());
      if (a?.duplaEnganchador) nombres.add(a.duplaEnganchador.trim().toLowerCase());
    }
    return nombres;
  }, [turnosActivos]);

  const operadoresSinTurno = useMemo(
    () =>
      usuarios
        .filter(
          (u) =>
            u.activo !== false &&
            esOperador(normalizeRoles(u.roles, u.rol)) &&
            !turnosActivosUids.has(u.uid) &&
            !nombresEnTurnoActivo.has(u.nombre.trim().toLowerCase())
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios, turnosActivosUids, nombresEnTurnoActivo]
  );

  const operadorOptions = useMemo(
    () =>
      operadoresSinTurno.map((u) => ({
        value: u.uid,
        label: u.nombre,
      })),
    [operadoresSinTurno]
  );

  const gruasFiltradas = useMemo(
    () => gruas.filter((g) => g.activa && normalizeTipoFlota(g.tipo) === editTipoFlota),
    [gruas, editTipoFlota]
  );

  const duplasFiltradas = useMemo(
    () => duplas.filter((d) => d.activa && normalizeTipoFlota(d.tipo) === editTipoFlota),
    [duplas, editTipoFlota]
  );

  const gruaOptions = useMemo(
    () =>
      gruasFiltradas.length === 0
        ? [{ value: "", label: "Sin grúas de este tipo" }]
        : gruasFiltradas.map((g) => ({
            value: g.patente,
            label: `${g.descripcion?.trim() ? `${g.descripcion.trim()} — ` : ""}${g.patente}`,
          })),
    [gruasFiltradas]
  );

  const duplaOptions = useMemo(
    () => [
      { value: DUPLA_MANUAL, label: "Elegir chofer y enganchador por separado" },
      ...duplasFiltradas.map((d) => ({
        value: d.id,
        label: `${d.chofer} + ${enganchadorDeDupla(d)}`,
      })),
    ],
    [duplasFiltradas]
  );

  const handleDuplaChange = (duplaId: string) => {
    setEditDuplaId(duplaId);
    if (duplaId !== DUPLA_MANUAL) {
      const d = duplasFiltradas.find((dp) => dp.id === duplaId);
      if (d) {
        setEditChofer(d.chofer);
        setEditEnganchador(enganchadorDeDupla(d));
      }
    }
  };

  const openModal = (u: Usuario) => {
    const a = u.asignacionDiaria!;
    setSelectedUser(u);
    setCreatingFromDupla(null);
    setEditUsuarioUid("");
    setEditTipoFlota(normalizeTipoFlota(a.tipoFlota));
    setEditGruaPatente(a.gruaPatente);
    setEditChofer(a.duplaChofer);
    setEditEnganchador(a.duplaEnganchador);
    setModalError(null);

    const matchesCatalog = duplas.some(
      (d) => d.id === a.duplaId && d.chofer === a.duplaChofer && enganchadorDeDupla(d) === a.duplaEnganchador
    );
    setEditDuplaId(matchesCatalog ? a.duplaId : DUPLA_MANUAL);
  };

  const openModalFromDupla = (d: DuplaDoc) => {
    setSelectedUser(null);
    setCreatingFromDupla(d);
    setEditUsuarioUid("");
    setEditTipoFlota(normalizeTipoFlota(d.tipo));
    setEditDuplaId(d.id);
    setEditChofer(d.chofer);
    setEditEnganchador(enganchadorDeDupla(d));
    setModalError(null);

    const gruaAsignada = gruas.find((g) => g.id === d.gruaId || g.docId === d.gruaId);
    setEditGruaPatente(gruaAsignada?.patente ?? "");
  };

  const closeModal = () => {
    setSelectedUser(null);
    setCreatingFromDupla(null);
    setEditUsuarioUid("");
    setEditGruaPatente("");
    setEditDuplaId("");
    setEditChofer("");
    setEditEnganchador("");
    setEditTipoFlota("TRANSITO");
    setModalError(null);
  };

  const saveEdit = async () => {
    const isCreating = !!creatingFromDupla;
    const targetUid = isCreating ? editUsuarioUid : selectedUser?.uid;

    if (isCreating && !targetUid) {
      setModalError("Seleccioná un operador para asignar el turno.");
      return;
    }

    if (!editGruaPatente.trim() || !editChofer.trim() || !editEnganchador.trim()) {
      setModalError("Completá grúa, chofer y enganchador.");
      return;
    }

    setSavingState(true);
    setModalError(null);

    const duplaId = editDuplaId === DUPLA_MANUAL ? "" : editDuplaId;

    const duplaCatalogo = editDuplaId !== DUPLA_MANUAL
      ? duplasFiltradas.find((d) => d.id === editDuplaId)
      : undefined;
    const legajoChofer = duplaCatalogo?.legajoChofer
      || choferes.find((c) => c.nombre === editChofer.trim())?.legajo;
    const legajoEnganchador = duplaCatalogo?.legajoEnganchador
      || enganchadores.find((e) => e.nombre === editEnganchador.trim())?.legajo;

    const gruaDesc = gruas.find((g) => g.patente === editGruaPatente.trim())?.descripcion?.trim();
    const updated: AsignacionDiaria = isCreating
      ? {
          fecha: hoy,
          gruaPatente: editGruaPatente.trim(),
          ...(gruaDesc ? { gruaDescripcion: gruaDesc } : {}),
          duplaId,
          duplaChofer: editChofer.trim(),
          duplaEnganchador: editEnganchador.trim(),
          tipoFlota: editTipoFlota,
          inicioEn: new Date().toISOString(),
          ...(legajoChofer ? { legajoChofer } : {}),
          ...(legajoEnganchador ? { legajoEnganchador } : {}),
        }
      : {
          ...selectedUser!.asignacionDiaria!,
          gruaPatente: editGruaPatente.trim(),
          ...(gruaDesc ? { gruaDescripcion: gruaDesc } : {}),
          duplaId,
          duplaChofer: editChofer.trim(),
          duplaEnganchador: editEnganchador.trim(),
          tipoFlota: editTipoFlota,
          legajoChofer: legajoChofer ?? undefined,
          legajoEnganchador: legajoEnganchador ?? undefined,
        };

    // Firestore no acepta `undefined`: si no hay legajo de catálogo, quitamos el campo en vez de mandarlo vacío.
    if (!updated.legajoChofer) delete updated.legajoChofer;
    if (!updated.legajoEnganchador) delete updated.legajoEnganchador;

    try {
      if (!isMock) {
        await asignarTurnoOperador({
          operadorUid: targetUid!,
          asignacionDiaria: updated,
        });
      }
      const next = usuarios.map((u) =>
        u.uid === targetUid ? { ...u, asignacionDiaria: updated } : u
      );
      onUsuariosChange(next);
      closeModal();
    } catch (err) {
      console.error(err);
      setModalError(isCreating ? "No se pudo crear el turno." : "No se pudo guardar los cambios del turno.");
    } finally {
      setSavingState(false);
    }
  };

  const [activeTab, setActiveTab] = useState<"activos" | "sinTurno">("activos");

  const modalAsignacion = selectedUser?.asignacionDiaria;
  const isManualDupla = editDuplaId === DUPLA_MANUAL;
  const showModal = !!(selectedUser && modalAsignacion) || !!creatingFromDupla;

  return (
    <div className="bg-white overflow-hidden">
      <AdminSectionToolbar>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-brand-pale absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={turnoSearch}
            onChange={(e) => setTurnoSearch(e.target.value)}
            placeholder="Buscar por operador, grúa o dupla..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-brand-seashell rounded-xl text-[13px] leading-tight text-brand-purply placeholder:text-brand-pale focus:outline-none focus:ring-2 focus:ring-brand-cta/25 focus:border-brand-cta/40 transition-shadow shadow-sm"
          />
        </div>
      </AdminSectionToolbar>

      <AdminSubTabs
        ariaLabel="Vista de turnos"
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "activos" as const, label: "Activos", icon: <Clock className="w-4 h-4" />, count: filteredTurnosActivos.length },
          { id: "sinTurno" as const, label: "Sin turno", icon: <CircleOff className="w-4 h-4" />, count: filteredDuplasSinTurno.length },
        ]}
      />

      {/* Contenido de la pestaña activa */}
      {activeTab === "activos" && (
        <div className="divide-y divide-gray-100">
          {filteredTurnosActivos.length === 0 ? (
            <p className="p-6 text-sm text-brand-pale text-center">
              {turnosActivos.length === 0
                ? "No hay turnos activos en este momento."
                : "No hay turnos que coincidan con la búsqueda."}
            </p>
          ) : (
            filteredTurnosActivos.map((u) => {
              const a = u.asignacionDiaria!;

              return (
                <div
                  key={u.uid}
                  className="p-4 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => openModal(u)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900">{u.nombre}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                            normalizeTipoFlota(a.tipoFlota) === "TRANSPORTE"
                              ? "bg-blue-50 text-blue-700 border-blue-200/50"
                              : "bg-amber-50 text-amber-700 border-amber-200/50"
                          }`}
                        >
                          {labelTipoFlota(a.tipoFlota)}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-xs text-brand-purply/80 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-brand-pale shrink-0" />
                          Grúa: <span className="font-bold">{gruaLabelPorPatente(gruas, a.gruaPatente)}</span>
                        </p>
                        <p className="text-xs text-brand-purply/80 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-brand-pale shrink-0" />
                          {a.duplaChofer} + {a.duplaEnganchador}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal(u);
                      }}
                      className="p-1.5 rounded-lg border border-brand-seashell hover:border-indigo-500 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors shrink-0"
                      title="Ver detalle / editar turno"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "sinTurno" && (
        <div className="divide-y divide-gray-100">
          {filteredDuplasSinTurno.length === 0 ? (
            <p className="p-6 text-sm text-brand-pale text-center">
              {duplasSinTurno.length === 0
                ? "Todas las duplas activas tienen turno configurado."
                : "No hay duplas que coincidan con la búsqueda."}
            </p>
          ) : (
            filteredDuplasSinTurno.map((d) => {
              const gruaAsignada = gruas.find((g) => g.id === d.gruaId || g.docId === d.gruaId);

              return (
                <div
                  key={d.docId}
                  className="p-4 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => openModalFromDupla(d)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900">
                          {d.chofer}
                        </span>
                        <span className="text-xs text-brand-pale">+</span>
                        <span className="font-semibold text-sm text-brand-purply">
                          {enganchadorDeDupla(d)}
                        </span>
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
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-brand-purply/80 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-brand-pale shrink-0" />
                          {gruaAsignada ? (
                            <>Grúa: <span className="font-bold">{gruaLabelPorPatente(gruas, gruaAsignada.patente)}</span></>
                          ) : (
                            <span className="text-brand-pale italic">Sin grúa asignada</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModalFromDupla(d);
                      }}
                      className="p-1.5 rounded-lg border border-brand-seashell hover:border-indigo-500 text-brand-pale hover:text-indigo-500 cursor-pointer transition-colors shrink-0"
                      title="Asignar turno a esta dupla"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal detalle / crear turno */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto">

            {/* Header */}
            <div className="flex justify-between items-center px-6 py-5 sm:px-8 border-b border-gray-100 bg-brand-bg rounded-t-2xl shrink-0">
              <div>
                <span className="text-[10px] font-mono font-bold text-brand-cta uppercase tracking-widest leading-none">
                  {creatingFromDupla ? "Asignar turno" : "Detalle de turno"}
                </span>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {creatingFromDupla
                      ? `${creatingFromDupla.chofer} + ${enganchadorDeDupla(creatingFromDupla)}`
                      : selectedUser!.nombre}
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                      normalizeTipoFlota(creatingFromDupla?.tipo ?? modalAsignacion!.tipoFlota) === "TRANSPORTE"
                        ? "bg-blue-50 text-blue-700 border-blue-200/50"
                        : "bg-amber-50 text-amber-700 border-amber-200/50"
                    }`}
                  >
                    {labelTipoFlota(creatingFromDupla?.tipo ?? modalAsignacion!.tipoFlota)}
                  </span>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-brand-seashell text-gray-400 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 p-6 sm:p-8 overflow-y-auto space-y-6 text-sm">

              {modalError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {modalError}
                </div>
              )}

              {/* Info actual (read-only) — solo para edición de turno existente */}
              {modalAsignacion && !creatingFromDupla && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 sm:p-6 rounded-xl font-mono text-xs text-gray-600 bg-brand-bg border border-gray-100">
                  <div>
                    <span className="text-gray-400 block mb-0.5">Inicio del turno</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {formatHora(modalAsignacion.inicioEn)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Grúa actual</span>
                    <span className="font-bold text-gray-900 text-sm uppercase">{gruaLabelPorPatente(gruas, modalAsignacion.gruaPatente)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Dupla actual</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {modalAsignacion.duplaChofer} + {modalAsignacion.duplaEnganchador}
                    </span>
                  </div>
                </div>
              )}

              {/* Edición / Creación */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200/70 text-xs font-semibold">
                  <Pencil className="w-4 h-4 shrink-0 text-brand-cta" />
                  {creatingFromDupla
                    ? "Configurá el turno para esta dupla. Seleccioná el operador que lo va a usar."
                    : "Modificá los campos necesarios. El cambio aplica solo al turno de hoy."}
                </div>

                {/* Selector de operador — solo al crear */}
                {creatingFromDupla && (
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <User className="w-3.5 h-3.5" />
                      Operador que usará el turno
                    </label>
                    <CustomSelect
                      value={editUsuarioUid}
                      onChange={setEditUsuarioUid}
                      options={operadorOptions.length === 0
                        ? [{ value: "", label: "No hay operadores disponibles" }]
                        : operadorOptions}
                      placeholder="Seleccioná operador"
                      icon={User}
                      ariaLabel="Operador"
                      disabled={savingState || operadorOptions.length === 0}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Tipo de operación
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {TIPO_FLOTA_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={savingState}
                        onClick={() => {
                          setEditTipoFlota(opt.value);
                          setEditGruaPatente("");
                          setEditDuplaId(DUPLA_MANUAL);
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          editTipoFlota === opt.value
                            ? "bg-brand-cta text-white border-brand-cta"
                            : "bg-brand-bg text-brand-purply border-brand-seashell hover:border-brand-cta/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <Truck className="w-3.5 h-3.5" />
                    Grúa asignada
                  </label>
                  <CustomSelect
                    value={editGruaPatente}
                    onChange={setEditGruaPatente}
                    options={gruaOptions}
                    placeholder="Seleccioná grúa"
                    icon={Truck}
                    ariaLabel="Grúa asignada"
                    disabled={savingState || gruasFiltradas.length === 0}
                  />
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <Users className="w-3.5 h-3.5" />
                    Dupla de trabajo
                  </label>
                  <CustomSelect
                    value={editDuplaId}
                    onChange={handleDuplaChange}
                    options={duplaOptions}
                    placeholder="Seleccioná dupla"
                    icon={Users}
                    ariaLabel="Dupla de trabajo"
                    disabled={savingState}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Chofer
                    </label>
                    <CustomSelect
                      value={editChofer}
                      onChange={setEditChofer}
                      options={choferes.map((c) => ({ value: c.nombre, label: c.nombre }))}
                      placeholder="Seleccioná chofer"
                      icon={User}
                      ariaLabel="Chofer"
                      disabled={savingState}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Enganchador
                    </label>
                    <CustomSelect
                      value={editEnganchador}
                      onChange={setEditEnganchador}
                      options={enganchadores.map((e) => ({ value: e.nombre, label: e.nombre }))}
                      placeholder="Seleccioná enganchador"
                      icon={User}
                      ariaLabel="Enganchador"
                      disabled={savingState}
                    />
                  </div>
                </div>

                {isManualDupla && (editChofer || editEnganchador) && (
                  <p className="text-[10px] text-brand-pale italic">
                    Dupla personalizada para hoy: {editChofer || "—"} + {editEnganchador || "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 sm:px-8 bg-brand-bg border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={savingState}
                className="px-5 py-2.5 text-xs font-bold border border-brand-seashell rounded-xl hover:bg-white cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingState}
                className="px-5 py-2.5 text-xs font-bold bg-brand-cta hover:bg-brand-cta-hover text-white rounded-xl disabled:opacity-60 cursor-pointer transition-colors"
              >
                {savingState ? "Guardando..." : creatingFromDupla ? "Asignar turno" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTurnosPanel;
