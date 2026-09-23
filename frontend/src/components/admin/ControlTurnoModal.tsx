import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  RefreshCw,
  Truck,
  Users,
  ArrowLeftRight,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Check,
  Radio,
  Clock,
} from "lucide-react";
import {
  Grua,
  Dupla,
  Usuario,
  Servicio,
  TipoFlota,
  MotivoFueraDeServicio,
  TIPO_FLOTA_OPTIONS,
  MOTIVO_FUERA_DE_SERVICIO_OPTIONS,
  normalizeTipoFlota,
  labelTipoFlota,
  labelMotivoFueraDeServicio,
  enganchadorDeDupla,
  AsignarTurnoOperadorPayload,
} from "@gruasbacar/shared";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import {
  asignarTurnoOperador,
  gestionarGruaFueraDeServicio,
  reactivarGruaEnServicio,
} from "../../services/controlTurno.service";
import { fechaHoyArgentina } from "../../utils/formatters";
import { CustomSelect, CustomSelectOption } from "../shared/CustomSelect";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import type { AdminDashboardStats } from "../../services/adminStats.service";

// ── Types ──────────────────────────────────────────────────

type AccionTipo = "reasignar" | "dupla" | "tipo" | "oos";

export interface ControlTurnoPermisos {
  puedeReasignarGrua: boolean;
  puedeSacarOOS: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stats: AdminDashboardStats;
  onDataChanged: () => void;
  permisos: ControlTurnoPermisos;
  lastRefresh?: Date | null;
}

const DUPLA_MANUAL = "__manual__";

// ── Helpers ────────────────────────────────────────────────

function tiempoDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function labelLastRefresh(date: Date | null | undefined, nowMs: number): string {
  if (!date) return "Actualizando…";
  const s = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (s < 5) return "Actualizado recién";
  if (s < 60) return `Actualizado hace ${s}s`;
  const m = Math.floor(s / 60);
  return `Actualizado hace ${m} min`;
}

function servicioActivoDeUsuario(
  usuario: Usuario,
  servicios: Servicio[],
): Servicio | undefined {
  if (!usuario.servicioActivoId) return undefined;
  return servicios.find((s) => s.id === usuario.servicioActivoId);
}

// ── Main Component ─────────────────────────────────────────

export const ControlTurnoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  stats,
  onDataChanged,
  permisos,
  lastRefresh,
}) => {
  const [tab, setTab] = useState<"operadores" | "oos">("operadores");
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<AccionTipo | null>(null);

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMsg, setConfirmMsg] = useState("");

  // Form state
  const [formGrua, setFormGrua] = useState("");
  const [formDuplaId, setFormDuplaId] = useState(DUPLA_MANUAL);
  const [formChofer, setFormChofer] = useState("");
  const [formEnganchador, setFormEnganchador] = useState("");
  const [formTipo, setFormTipo] = useState<TipoFlota>("TRANSITO");
  const [formMotivo, setFormMotivo] = useState("");
  const [formCategoriaOos, setFormCategoriaOos] = useState<MotivoFueraDeServicio | "">("");
  const [formMarcarOos, setFormMarcarOos] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    async function load() {
      try {
        const needsGruas = stats.gruasCatalog.length === 0;
        const [g, d] = await Promise.all([
          needsGruas ? gruaService.getGruasActivas() : Promise.resolve(stats.gruasCatalog),
          duplaService.getDuplasActivas(),
        ]);
        if (!cancelled) {
          setGruas(g);
          setDuplas(d);
        }
      } catch { /* toast handled by caller */ } finally {
        if (!cancelled) setLoadingCatalogs(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  const resetForm = useCallback(() => {
    setFormGrua("");
    setFormDuplaId(DUPLA_MANUAL);
    setFormChofer("");
    setFormEnganchador("");
    setFormTipo("TRANSITO");
    setFormMotivo("");
    setFormCategoriaOos("");
    setFormMarcarOos(false);
    setActionError(null);
    setActionSuccess(null);
  }, []);

  const closeExpanded = useCallback(() => {
    setExpandedCard(null);
    setExpandedAction(null);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (isOpen) return;
    closeExpanded();
    setTab("operadores");
  }, [isOpen, closeExpanded]);

  const openAction = useCallback(
    (uid: string, action: AccionTipo, usuario: Usuario) => {
      if (expandedCard === uid && expandedAction === action) {
        closeExpanded();
        return;
      }
      closeExpanded();
      setExpandedCard(uid);
      setExpandedAction(action);
      const a = usuario.asignacionDiaria;
      if (!a) return;
      if (action === "reasignar") {
        setFormGrua("");
        setFormTipo(normalizeTipoFlota(a.tipoFlota));
      } else if (action === "dupla") {
        setFormTipo(normalizeTipoFlota(a.tipoFlota));
        setFormDuplaId(DUPLA_MANUAL);
        setFormChofer(a.duplaChofer);
        setFormEnganchador(a.duplaEnganchador);
      } else if (action === "tipo") {
        const nuevoTipo: TipoFlota =
          normalizeTipoFlota(a.tipoFlota) === "TRANSITO" ? "TRANSPORTE" : "TRANSITO";
        setFormTipo(nuevoTipo);
        setFormGrua("");
        setFormMarcarOos(false);
      } else if (action === "oos") {
        setFormCategoriaOos("");
      }
    },
    [closeExpanded, expandedCard, expandedAction],
  );

  // ── Confirm + execute ──

  const requestConfirm = useCallback(
    (msg: string, fn: () => Promise<void>) => {
      setConfirmMsg(msg);
      setPendingAction(() => fn);
      setConfirmOpen(true);
    },
    [],
  );

  const executeConfirmed = useCallback(async () => {
    if (!pendingAction) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await pendingAction();
      setActionSuccess("Cambio aplicado correctamente.");
      setTimeout(() => {
        closeExpanded();
        onDataChanged();
      }, 800);
    } catch (err: any) {
      setActionError(err.message || "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }, [pendingAction, closeExpanded, onDataChanged]);

  // ── Grúa / Dupla options ──

  const catalogoGruas = stats.gruasCatalog.length > 0 ? stats.gruasCatalog : gruas;

  const patentesOcupadas = useMemo(() => {
    const set = new Set<string>();
    for (const u of stats.usuariosEnTurno) {
      const p = u.asignacionDiaria?.gruaPatente?.trim();
      if (p) set.add(p);
    }
    return set;
  }, [stats.usuariosEnTurno]);

  const buildGruaOptions = useCallback(
    (tipo: TipoFlota, excludePatente?: string): CustomSelectOption[] => {
      const filtered = catalogoGruas.filter(
        (g) =>
          g.activa &&
          normalizeTipoFlota(g.tipo) === tipo &&
          g.patente !== excludePatente &&
          !patentesOcupadas.has(g.patente),
      );
      if (filtered.length === 0)
        return [{ value: "", label: "Sin grúas disponibles de este tipo" }];
      return filtered.map((g) => ({
        value: g.patente,
        label: `${g.descripcion?.trim() ? `${g.descripcion.trim()} — ` : ""}${g.patente}`,
      }));
    },
    [catalogoGruas, patentesOcupadas],
  );

  const duplasFiltradas = useMemo(
    () => duplas.filter((d) => normalizeTipoFlota(d.tipo) === formTipo),
    [duplas, formTipo],
  );

  const duplaOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: DUPLA_MANUAL, label: "Chofer y enganchador manual" },
      ...duplasFiltradas.map((d) => ({
        value: d.id,
        label: `${d.chofer} + ${enganchadorDeDupla(d)}`,
      })),
    ],
    [duplasFiltradas],
  );

  // ── Action handlers ──

  const handleReasignar = useCallback(
    (usuario: Usuario) => {
      const a = usuario.asignacionDiaria!;
      const motivo = formMotivo.trim();
      if (!formGrua) { setActionError("Seleccioná una grúa."); return; }
      if (!motivo) { setActionError("Indicá el motivo del cambio."); return; }
      if (formMarcarOos && !formCategoriaOos) {
        setActionError("Seleccioná la categoría de fuera de servicio.");
        return;
      }

      const payload: AsignarTurnoOperadorPayload = {
        operadorUid: usuario.uid,
        asignacionDiaria: { ...a, gruaPatente: formGrua, fecha: fechaHoyArgentina() },
        motivoCambio: motivo,
        ...(formMarcarOos && formCategoriaOos
          ? {
              gestionCrossTipo: {
                gruaFueraDeServicioPatente: a.gruaPatente,
                categoriaFueraDeServicio: formCategoriaOos as MotivoFueraDeServicio,
                motivoCambio: motivo,
                deshabilitarGrua: true,
                tipoFlotaOrigen: normalizeTipoFlota(a.tipoFlota),
              },
            }
          : {}),
      };

      requestConfirm(
        `Reasignar grúa de ${usuario.nombre} a ${formGrua}${formMarcarOos ? ` y sacar ${a.gruaPatente} de servicio` : ""}?`,
        () => asignarTurnoOperador(payload).then(() => {}),
      );
    },
    [formGrua, formMotivo, formMarcarOos, formCategoriaOos, requestConfirm],
  );

  const handleCambiarDupla = useCallback(
    (usuario: Usuario) => {
      const a = usuario.asignacionDiaria!;
      const motivo = formMotivo.trim();
      let chofer = formChofer.trim();
      let enganchador = formEnganchador.trim();
      let duplaId = formDuplaId;

      if (formDuplaId !== DUPLA_MANUAL) {
        const d = duplas.find((x) => x.id === formDuplaId);
        if (d) {
          chofer = d.chofer;
          enganchador = enganchadorDeDupla(d);
          duplaId = d.id;
        }
      }

      if (!chofer || !enganchador) { setActionError("Completá chofer y enganchador."); return; }
      if (!motivo) { setActionError("Indicá el motivo del cambio."); return; }

      const payload: AsignarTurnoOperadorPayload = {
        operadorUid: usuario.uid,
        asignacionDiaria: {
          ...a,
          duplaId: duplaId === DUPLA_MANUAL ? "" : duplaId,
          duplaChofer: chofer,
          duplaEnganchador: enganchador,
          fecha: fechaHoyArgentina(),
        },
        motivoCambio: motivo,
      };

      requestConfirm(
        `Cambiar dupla de ${usuario.nombre} a ${chofer} / ${enganchador}?`,
        () => asignarTurnoOperador(payload).then(() => {}),
      );
    },
    [formDuplaId, formChofer, formEnganchador, formMotivo, duplas, requestConfirm],
  );

  const handleCambiarTipo = useCallback(
    (usuario: Usuario) => {
      const a = usuario.asignacionDiaria!;
      const motivo = formMotivo.trim();
      if (!formGrua) { setActionError("Seleccioná una grúa del nuevo tipo."); return; }
      if (!motivo) { setActionError("Indicá el motivo del cambio."); return; }
      if (formMarcarOos && !formCategoriaOos) {
        setActionError("Seleccioná la categoría de fuera de servicio.");
        return;
      }

      const payload: AsignarTurnoOperadorPayload = {
        operadorUid: usuario.uid,
        asignacionDiaria: {
          ...a,
          gruaPatente: formGrua,
          tipoFlota: formTipo,
          fecha: fechaHoyArgentina(),
        },
        motivoCambio: motivo,
        ...(formMarcarOos && formCategoriaOos
          ? {
              gestionCrossTipo: {
                gruaFueraDeServicioPatente: a.gruaPatente,
                categoriaFueraDeServicio: formCategoriaOos as MotivoFueraDeServicio,
                motivoCambio: motivo,
                deshabilitarGrua: true,
                tipoFlotaOrigen: normalizeTipoFlota(a.tipoFlota),
              },
            }
          : {}),
      };

      requestConfirm(
        `Cambiar tipo de ${usuario.nombre} a ${labelTipoFlota(formTipo)}${formMarcarOos ? ` y sacar ${a.gruaPatente} de servicio` : ""}?`,
        () => asignarTurnoOperador(payload).then(() => {}),
      );
    },
    [formGrua, formTipo, formMotivo, formMarcarOos, formCategoriaOos, requestConfirm],
  );

  const handleSacarOos = useCallback(
    (usuario: Usuario) => {
      const a = usuario.asignacionDiaria!;
      const motivo = formMotivo.trim();
      if (!formCategoriaOos) { setActionError("Seleccioná la categoría."); return; }
      if (!motivo) { setActionError("Indicá el motivo."); return; }

      requestConfirm(
        `Sacar grúa ${a.gruaPatente} (${a.gruaDescripcion || ""}) de servicio?`,
        () =>
          gestionarGruaFueraDeServicio({
            patente: a.gruaPatente,
            categoria: formCategoriaOos as MotivoFueraDeServicio,
            motivo: motivo || undefined,
          }),
      );
    },
    [formCategoriaOos, formMotivo, requestConfirm],
  );

  const handleReactivar = useCallback(
    (gruaDocId: string, patente: string) => {
      requestConfirm(`Reactivar grúa ${patente}?`, () =>
        reactivarGruaEnServicio({ gruaDocId }),
      );
    },
    [requestConfirm],
  );

  if (!isOpen) return null;

  const { usuariosEnTurno, serviciosActivos, gruasFueraDeServicio } = stats;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />

        {/* Card */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="control-turno-title"
          className="bg-white w-full max-w-3xl max-h-[95vh] rounded-2xl shadow-2xl border border-brand-seashell z-10 flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center justify-between border-b border-brand-seashell">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-cta/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-brand-cta" />
              </div>
              <div>
                <h2 id="control-turno-title" className="text-brand-purply font-extrabold text-lg tracking-tight">
                  Control de Turno
                </h2>
                <p className="text-[11px] text-brand-pale font-medium">
                  {labelLastRefresh(lastRefresh, nowMs)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDataChanged()}
                className="p-2 rounded-lg text-brand-pale hover:bg-brand-bg transition-colors cursor-pointer"
                aria-label="Actualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-brand-pale hover:bg-brand-bg transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 px-5 sm:px-6 pt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("operadores")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                tab === "operadores"
                  ? "bg-brand-cta text-white shadow-md shadow-brand-cta/20"
                  : "bg-brand-bg text-brand-pale hover:text-brand-purply"
              }`}
            >
              Operadores en Turno ({usuariosEnTurno.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("oos")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                tab === "oos"
                  ? "bg-brand-cta text-white shadow-md shadow-brand-cta/20"
                  : "bg-brand-bg text-brand-pale hover:text-brand-purply"
              }`}
            >
              Grúas F/S ({gruasFueraDeServicio.length})
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
            {loadingCatalogs && (
              <div className="flex items-center justify-center py-12 text-brand-pale">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Cargando…
              </div>
            )}

            {!loadingCatalogs && tab === "operadores" && (
              <>
                {usuariosEnTurno.length === 0 && (
                  <div className="text-center py-12 text-brand-pale text-sm">
                    No hay operadores en turno hoy.
                  </div>
                )}
                {usuariosEnTurno.map((u) => {
                  const a = u.asignacionDiaria;
                  const isExpanded = expandedCard === u.uid;
                  const servActivo = servicioActivoDeUsuario(u, serviciosActivos);

                  return (
                    <div
                      key={u.uid}
                      className="bg-brand-bg rounded-xl border border-brand-seashell overflow-hidden"
                    >
                      {/* Card header */}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-brand-purply font-extrabold text-base">
                            {u.nombre}
                          </p>
                          {servActivo && (
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                servActivo.estado === "ENGANCHADO"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {servActivo.estado === "ENGANCHADO"
                                ? "En enganche"
                                : "En traslado"}
                            </span>
                          )}
                        </div>

                        {a && (
                          <div className="space-y-1 text-sm text-brand-pale">
                            <div className="flex items-center gap-2">
                              <Truck className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-medium">
                                {a.gruaDescripcion
                                  ? `${a.gruaDescripcion} (${a.gruaPatente})`
                                  : a.gruaPatente}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  normalizeTipoFlota(a.tipoFlota) === "TRANSITO"
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {labelTipoFlota(a.tipoFlota)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {a.duplaChofer} / {a.duplaEnganchador}
                              </span>
                            </div>
                            {a.inicioEn && (
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>Turno iniciado hace {tiempoDesde(a.inicioEn)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        {a && (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {permisos.puedeReasignarGrua && (
                              <ActionBtn
                                icon={Truck}
                                label="Reasignar"
                                active={isExpanded && expandedAction === "reasignar"}
                                onClick={() => openAction(u.uid, "reasignar", u)}
                              />
                            )}
                            <ActionBtn
                              icon={Users}
                              label="Dupla"
                              active={isExpanded && expandedAction === "dupla"}
                              onClick={() => openAction(u.uid, "dupla", u)}
                            />
                            <ActionBtn
                              icon={ArrowLeftRight}
                              label="Tipo"
                              active={isExpanded && expandedAction === "tipo"}
                              onClick={() => openAction(u.uid, "tipo", u)}
                            />
                            {permisos.puedeSacarOOS && (
                              <ActionBtn
                                icon={AlertTriangle}
                                label="Fuera serv."
                                active={isExpanded && expandedAction === "oos"}
                                onClick={() => openAction(u.uid, "oos", u)}
                                danger
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded action form */}
                      {isExpanded && expandedAction && a && (
                        <div className="border-t border-brand-seashell bg-white p-4 space-y-3">
                          {/* Reasignar grúa */}
                          {expandedAction === "reasignar" && (
                            <>
                              <label className="block text-xs font-bold text-brand-purply">
                                Nueva grúa ({labelTipoFlota(a.tipoFlota)})
                              </label>
                              <CustomSelect
                                value={formGrua}
                                onChange={setFormGrua}
                                options={buildGruaOptions(normalizeTipoFlota(a.tipoFlota), a.gruaPatente)}
                                placeholder="Seleccionar grúa"
                                size="sm"
                              />
                              {permisos.puedeSacarOOS && (
                                <>
                                  <label className="flex items-center gap-2 text-xs text-brand-pale cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={formMarcarOos}
                                      onChange={(e) => setFormMarcarOos(e.target.checked)}
                                      className="rounded"
                                    />
                                    Marcar grúa anterior ({a.gruaPatente}) como fuera de servicio
                                  </label>
                                  {formMarcarOos && (
                                    <div className="grid grid-cols-2 gap-2">
                                      {MOTIVO_FUERA_DE_SERVICIO_OPTIONS.map((o) => (
                                        <button
                                          type="button"
                                          key={o.value}
                                          onClick={() => setFormCategoriaOos(o.value)}
                                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                            formCategoriaOos === o.value
                                              ? "border-brand-cta bg-brand-cta/10 text-brand-cta"
                                              : "border-brand-seashell text-brand-pale hover:border-brand-cta/30"
                                          }`}
                                        >
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          )}

                          {/* Cambiar dupla */}
                          {expandedAction === "dupla" && (
                            <>
                              <label className="block text-xs font-bold text-brand-purply">
                                Dupla
                              </label>
                              <CustomSelect
                                value={formDuplaId}
                                onChange={(val) => {
                                  setFormDuplaId(val);
                                  if (val !== DUPLA_MANUAL) {
                                    const d = duplas.find((x) => x.id === val);
                                    if (d) {
                                      setFormChofer(d.chofer);
                                      setFormEnganchador(enganchadorDeDupla(d));
                                    }
                                  }
                                }}
                                options={duplaOptions}
                                placeholder="Seleccionar dupla"
                                size="sm"
                              />
                              {formDuplaId === DUPLA_MANUAL && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs font-bold text-brand-purply mb-1">
                                      Chofer
                                    </label>
                                    <input
                                      type="text"
                                      value={formChofer}
                                      onChange={(e) => setFormChofer(e.target.value)}
                                      className="w-full px-3 py-2 rounded-lg border border-brand-seashell text-sm focus:outline-none focus:ring-2 focus:ring-brand-cta/30"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-brand-purply mb-1">
                                      Enganchador
                                    </label>
                                    <input
                                      type="text"
                                      value={formEnganchador}
                                      onChange={(e) => setFormEnganchador(e.target.value)}
                                      className="w-full px-3 py-2 rounded-lg border border-brand-seashell text-sm focus:outline-none focus:ring-2 focus:ring-brand-cta/30"
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {/* Cambiar tipo */}
                          {expandedAction === "tipo" && (
                            <>
                              <label className="block text-xs font-bold text-brand-purply">
                                Nuevo tipo de operación
                              </label>
                              <div className="flex gap-2">
                                {TIPO_FLOTA_OPTIONS.map((o) => (
                                  <button
                                    type="button"
                                    key={o.value}
                                    onClick={() => {
                                      setFormTipo(o.value);
                                      setFormGrua("");
                                    }}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                                      formTipo === o.value
                                        ? "border-brand-cta bg-brand-cta/10 text-brand-cta"
                                        : "border-brand-seashell text-brand-pale hover:border-brand-cta/30"
                                    }`}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                              <label className="block text-xs font-bold text-brand-purply">
                                Grúa del nuevo tipo
                              </label>
                              <CustomSelect
                                value={formGrua}
                                onChange={setFormGrua}
                                options={buildGruaOptions(formTipo, a.gruaPatente)}
                                placeholder="Seleccionar grúa"
                                size="sm"
                              />
                              {permisos.puedeSacarOOS && (
                                <>
                                  <label className="flex items-center gap-2 text-xs text-brand-pale cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={formMarcarOos}
                                      onChange={(e) => setFormMarcarOos(e.target.checked)}
                                      className="rounded"
                                    />
                                    Marcar grúa anterior ({a.gruaPatente}) como fuera de servicio
                                  </label>
                                  {formMarcarOos && (
                                    <div className="grid grid-cols-2 gap-2">
                                      {MOTIVO_FUERA_DE_SERVICIO_OPTIONS.map((o) => (
                                        <button
                                          type="button"
                                          key={o.value}
                                          onClick={() => setFormCategoriaOos(o.value)}
                                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                            formCategoriaOos === o.value
                                              ? "border-brand-cta bg-brand-cta/10 text-brand-cta"
                                              : "border-brand-seashell text-brand-pale hover:border-brand-cta/30"
                                          }`}
                                        >
                                          {o.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          )}

                          {/* Sacar de servicio */}
                          {expandedAction === "oos" && (
                            <>
                              <p className="text-xs text-brand-pale">
                                Sacar <strong>{a.gruaDescripcion || a.gruaPatente}</strong> ({a.gruaPatente}) de servicio
                              </p>
                              {servActivo && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  Este operador tiene un acta en curso. Reasigná el operador antes de sacar la grúa de servicio.
                                </p>
                              )}
                              <label className="block text-xs font-bold text-brand-purply">
                                Categoría
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                {MOTIVO_FUERA_DE_SERVICIO_OPTIONS.map((o) => (
                                  <button
                                    type="button"
                                    key={o.value}
                                    onClick={() => setFormCategoriaOos(o.value)}
                                    className={`py-2.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                      formCategoriaOos === o.value
                                        ? "border-brand-cta bg-brand-cta/10 text-brand-cta"
                                        : "border-brand-seashell text-brand-pale hover:border-brand-cta/30"
                                    }`}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Motivo (shared) */}
                          <div>
                            <label className="block text-xs font-bold text-brand-purply mb-1">
                              Motivo del cambio
                            </label>
                            <textarea
                              value={formMotivo}
                              onChange={(e) => setFormMotivo(e.target.value)}
                              rows={2}
                              maxLength={300}
                              placeholder="Ej: Grúa con falla mecánica, se reasigna…"
                              className="w-full px-3 py-2 rounded-lg border border-brand-seashell text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-cta/30"
                            />
                          </div>

                          {/* Error / Success */}
                          {actionError && (
                            <p className="text-xs text-red-600 font-medium">{actionError}</p>
                          )}
                          {actionSuccess && (
                            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              {actionSuccess}
                            </p>
                          )}

                          {/* Buttons */}
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={closeExpanded}
                              disabled={saving}
                              className="flex-1 py-2.5 px-4 bg-white border-2 border-brand-seashell rounded-xl text-sm font-bold text-brand-purply hover:bg-brand-bg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={saving || (expandedAction === "oos" && !!servActivo)}
                              onClick={() => {
                                if (expandedAction === "reasignar") handleReasignar(u);
                                else if (expandedAction === "dupla") handleCambiarDupla(u);
                                else if (expandedAction === "tipo") handleCambiarTipo(u);
                                else if (expandedAction === "oos") handleSacarOos(u);
                              }}
                              className="flex-1 py-2.5 px-4 bg-brand-cta text-white rounded-xl text-sm font-extrabold shadow-md shadow-brand-cta/20 hover:bg-brand-cta-hover transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                              Confirmar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {!loadingCatalogs && tab === "oos" && (
              <>
                {gruasFueraDeServicio.length === 0 && (
                  <div className="text-center py-12 text-brand-pale text-sm">
                    Todas las grúas están operativas.
                  </div>
                )}
                {gruasFueraDeServicio.map((g) => {
                  const oos = g.fueraDeServicio;
                  return (
                    <div
                      key={g.id}
                      className="bg-brand-bg rounded-xl border border-brand-seashell p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-brand-purply font-extrabold text-base">
                            {g.descripcion || g.patente}
                          </p>
                          <p className="text-xs text-brand-pale font-mono">{g.patente}</p>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            normalizeTipoFlota(g.tipo) === "TRANSITO"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {labelTipoFlota(g.tipo)}
                        </span>
                      </div>

                      {oos && (
                        <div className="space-y-1 text-xs text-brand-pale mb-3">
                          <p>
                            <strong>Categoría:</strong>{" "}
                            {labelMotivoFueraDeServicio(oos.categoria)}
                          </p>
                          {oos.motivo && (
                            <p>
                              <strong>Motivo:</strong> {oos.motivo}
                            </p>
                          )}
                          <p>
                            <strong>Desde:</strong>{" "}
                            {new Date(oos.desde).toLocaleDateString("es-AR")} —{" "}
                            {oos.desactivadaPorNombre}
                          </p>
                        </div>
                      )}

                      {permisos.puedeSacarOOS && (
                        <button
                          type="button"
                          onClick={() => handleReactivar(g.docId || g.id, g.patente)}
                          disabled={saving}
                          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-extrabold shadow-md hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reactivar
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          executeConfirmed();
        }}
        title="Confirmar cambio"
        message={confirmMsg}
        confirmText="Sí, confirmar"
        danger
      />
    </>
  );
};

// ── Action button ──────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon: Icon, label, active, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
      active
        ? danger
          ? "border-red-400 bg-red-50 text-red-700"
          : "border-brand-cta bg-brand-cta/10 text-brand-cta"
        : danger
          ? "border-brand-seashell text-red-500 hover:border-red-300 hover:bg-red-50"
          : "border-brand-seashell text-brand-pale hover:border-brand-cta/30 hover:bg-brand-cta/5"
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

export default ControlTurnoModal;
