import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  RefreshCw,
  Truck,
  User,
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
  labelRolUsuario,
  enganchadorDeDupla,
  legajoKey,
  nombresCoinciden,
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

function inicialesNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}

function rolesLabel(roles: string[]): string {
  return roles.map((r) => labelRolUsuario(r)).join(", ");
}

function idGrua(a: { gruaPrefijo?: string; gruaPatente: string }): string {
  return a.gruaPrefijo?.trim() || a.gruaPatente;
}

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

interface Operador {
  nombre: string;
  legajo: string;
}

function opKey(op: Operador): string {
  return op.legajo || op.nombre.trim().toLowerCase();
}

function extractOperadores(duplas: Dupla[], rol: "chofer" | "enganchador"): Operador[] {
  const seen = new Set<string>();
  const result: Operador[] = [];
  for (const d of duplas) {
    const nombre = rol === "chofer" ? d.chofer : enganchadorDeDupla(d);
    const legajo = rol === "chofer" ? d.legajoChofer ?? "" : d.legajoEnganchador ?? "";
    if (!nombre.trim()) continue;
    const key = opKey({ nombre, legajo });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ nombre: nombre.trim(), legajo: legajo.trim() });
  }
  return result;
}

function findDuplaMatch(
  duplas: Dupla[],
  chofer: Operador | undefined,
  enganchador: Operador | undefined,
): Dupla | undefined {
  if (!chofer || !enganchador) return undefined;
  return duplas.find((d) => {
    const choferOk = chofer.legajo
      ? legajoKey(d.legajoChofer) === legajoKey(chofer.legajo)
      : nombresCoinciden(d.chofer, chofer.nombre);
    const engOk = enganchador.legajo
      ? legajoKey(d.legajoEnganchador) === legajoKey(enganchador.legajo)
      : nombresCoinciden(enganchadorDeDupla(d), enganchador.nombre);
    return choferOk && engOk;
  });
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
  const [formChoferKey, setFormChoferKey] = useState("");
  const [formEnganchadorKey, setFormEnganchadorKey] = useState("");
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
    setFormChoferKey("");
    setFormEnganchadorKey("");
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
        const duplaActual = a.duplaId ? duplas.find((d) => d.id === a.duplaId) : undefined;
        setFormDuplaId(duplaActual ? duplaActual.id : DUPLA_MANUAL);
        setFormChoferKey(opKey({ nombre: a.duplaChofer, legajo: a.legajoChofer ?? "" }));
        setFormEnganchadorKey(opKey({ nombre: a.duplaEnganchador, legajo: a.legajoEnganchador ?? "" }));
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
      return filtered.map((g) => {
        const id = g.prefijo?.trim() || g.patente;
        const desc = g.descripcion?.trim();
        return {
          value: g.patente,
          label: desc ? `${desc} (${id})` : id,
        };
      });
    },
    [catalogoGruas, patentesOcupadas],
  );

  const duplasFiltradas = useMemo(
    () => duplas.filter((d) => normalizeTipoFlota(d.tipo) === formTipo),
    [duplas, formTipo],
  );

  const duplaOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: DUPLA_MANUAL, label: "Seleccionar chofer y enganchador" },
      ...duplasFiltradas.map((d) => ({
        value: d.id,
        label: `${d.chofer} + ${enganchadorDeDupla(d)}`,
      })),
    ],
    [duplasFiltradas],
  );

  const choferes = useMemo(() => extractOperadores(duplasFiltradas, "chofer"), [duplasFiltradas]);
  const enganchadores = useMemo(() => extractOperadores(duplasFiltradas, "enganchador"), [duplasFiltradas]);

  const selectedChofer = choferes.find((c) => opKey(c) === formChoferKey);
  const selectedEnganchador = enganchadores.find((e) => opKey(e) === formEnganchadorKey);

  const duplaAutoMatch = useMemo(
    () => findDuplaMatch(duplasFiltradas, selectedChofer, selectedEnganchador),
    [duplasFiltradas, selectedChofer, selectedEnganchador],
  );

  const choferOptions: CustomSelectOption[] = useMemo(
    () =>
      choferes.length === 0
        ? [{ value: "", label: "Sin choferes disponibles" }]
        : choferes.map((c) => ({
            value: opKey(c),
            label: c.nombre + (c.legajo ? ` (${c.legajo})` : ""),
          })),
    [choferes],
  );

  const enganchadorOptions: CustomSelectOption[] = useMemo(
    () =>
      enganchadores.length === 0
        ? [{ value: "", label: "Sin enganchadores disponibles" }]
        : enganchadores.map((e) => ({
            value: opKey(e),
            label: e.nombre + (e.legajo ? ` (${e.legajo})` : ""),
          })),
    [enganchadores],
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
        `Reasignar grúa de ${usuario.nombre} a ${formGrua}${formMarcarOos ? ` y sacar ${idGrua(a)} de servicio` : ""}?`,
        () => asignarTurnoOperador(payload).then(() => {}),
      );
    },
    [formGrua, formMotivo, formMarcarOos, formCategoriaOos, requestConfirm],
  );

  const handleCambiarDupla = useCallback(
    (usuario: Usuario) => {
      const a = usuario.asignacionDiaria!;
      const motivo = formMotivo.trim();
      let chofer = "";
      let enganchador = "";
      let duplaId = formDuplaId;
      let legChofer: string | undefined;
      let legEnganchador: string | undefined;

      if (formDuplaId !== DUPLA_MANUAL) {
        const d = duplas.find((x) => x.id === formDuplaId);
        if (d) {
          chofer = d.chofer;
          enganchador = enganchadorDeDupla(d);
          duplaId = d.id;
          legChofer = d.legajoChofer;
          legEnganchador = d.legajoEnganchador;
        }
      } else {
        if (selectedChofer) { chofer = selectedChofer.nombre; legChofer = selectedChofer.legajo || undefined; }
        if (selectedEnganchador) { enganchador = selectedEnganchador.nombre; legEnganchador = selectedEnganchador.legajo || undefined; }
        if (duplaAutoMatch) duplaId = duplaAutoMatch.id;
      }

      if (!chofer || !enganchador) { setActionError("Seleccioná chofer y enganchador."); return; }
      if (!motivo) { setActionError("Indicá el motivo del cambio."); return; }

      const payload: AsignarTurnoOperadorPayload = {
        operadorUid: usuario.uid,
        asignacionDiaria: {
          ...a,
          duplaId: duplaId === DUPLA_MANUAL ? "" : duplaId,
          duplaChofer: chofer,
          duplaEnganchador: enganchador,
          legajoChofer: legChofer,
          legajoEnganchador: legEnganchador,
          fecha: fechaHoyArgentina(),
        },
        motivoCambio: motivo,
      };

      requestConfirm(
        `Cambiar dupla de ${usuario.nombre} a ${chofer} / ${enganchador}?`,
        () => asignarTurnoOperador(payload).then(() => {}),
      );
    },
    [formDuplaId, selectedChofer, selectedEnganchador, duplaAutoMatch, formMotivo, duplas, requestConfirm],
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
        `Cambiar tipo de ${usuario.nombre} a ${labelTipoFlota(formTipo)}${formMarcarOos ? ` y sacar ${idGrua(a)} de servicio` : ""}?`,
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
        `Sacar grúa ${idGrua(a)} (${a.gruaDescripcion || ""}) de servicio?`,
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
          className="bg-white w-full max-w-6xl max-h-[95vh] rounded-2xl shadow-2xl border border-brand-seashell z-10 flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex items-center justify-between border-b border-brand-seashell">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-cta/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-brand-cta" />
              </div>
              <div>
                <h2 id="control-turno-title" className="text-brand-purply font-extrabold text-lg tracking-tight flex items-center gap-2">
                  Control de Turno
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand-cta/10 text-brand-cta uppercase tracking-wider">
                    Centro Operativo
                  </span>
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
          <div className="shrink-0 px-5 sm:px-6 pt-3 flex gap-1 border-b border-brand-seashell">
            <button
              type="button"
              onClick={() => setTab("operadores")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                tab === "operadores"
                  ? "border-brand-cta text-brand-cta"
                  : "border-transparent text-brand-pale hover:text-brand-purply"
              }`}
            >
              <Users className="w-4 h-4" />
              Operadores en Turno
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                tab === "operadores"
                  ? "bg-brand-cta text-white"
                  : "bg-brand-seashell text-brand-pale"
              }`}>
                {usuariosEnTurno.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("oos")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer border-b-2 -mb-px ${
                tab === "oos"
                  ? "border-brand-cta text-brand-cta"
                  : "border-transparent text-brand-pale hover:text-brand-purply"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Grúas Fuera de Servicio
              {gruasFueraDeServicio.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  tab === "oos"
                    ? "bg-brand-cta text-white"
                    : "bg-red-100 text-red-600"
                }`}>
                  {gruasFueraDeServicio.length}
                </span>
              )}
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
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-purply/10 flex items-center justify-center shrink-0">
                              <span className="text-sm font-extrabold text-brand-purply">
                                {inicialesNombre(u.nombre)}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-brand-purply font-extrabold text-base">
                                  {u.nombre}
                                </p>
                                {u.legajo && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-bg border border-brand-seashell text-brand-pale">
                                    Leg: {u.legajo}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-brand-pale">
                                Rol: {rolesLabel(u.roles)}
                              </p>
                            </div>
                          </div>
                          {a && (
                            <span
                              className={`text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                                normalizeTipoFlota(a.tipoFlota) === "TRANSITO"
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {labelTipoFlota(a.tipoFlota)}
                            </span>
                          )}
                        </div>

                        {a && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="bg-white rounded-lg border border-brand-seashell p-3">
                              <p className="text-[10px] font-bold text-brand-cta uppercase tracking-wider mb-1">
                                Grúa Asignada
                              </p>
                              <p className="text-sm font-extrabold text-brand-purply font-mono">
                                {a.gruaPrefijo || a.gruaPatente}
                              </p>
                              {a.gruaDescripcion && (
                                <p className="text-[11px] text-brand-pale mt-0.5">
                                  {a.gruaDescripcion}
                                </p>
                              )}
                            </div>
                            <div className="bg-white rounded-lg border border-brand-seashell p-3">
                              <p className="text-[10px] font-bold text-brand-cta uppercase tracking-wider mb-1">
                                Dupla en Turno
                              </p>
                              <p className="text-xs text-brand-purply">
                                <span className="font-bold">Chofer:</span> {a.duplaChofer}
                              </p>
                              <p className="text-xs text-brand-purply">
                                <span className="font-bold">Enganchador:</span> {a.duplaEnganchador}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg border border-brand-seashell p-3">
                              <p className="text-[10px] font-bold text-brand-cta uppercase tracking-wider mb-1">
                                Servicio en Curso
                              </p>
                              {servActivo ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                                    servActivo.estado === "ENGANCHADO" ? "bg-emerald-500" : "bg-blue-500"
                                  }`} />
                                  <span className="text-xs font-bold text-brand-purply">
                                    {servActivo.estado === "ENGANCHADO" ? "En Enganche" : "En Traslado"}
                                  </span>
                                  {servActivo.numeroInfraccion && (
                                    <span className="text-[10px] font-mono text-brand-pale">
                                      #{servActivo.numeroInfraccion}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-brand-pale italic">
                                  Sin servicio activo en calle
                                </p>
                              )}
                            </div>
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
                                    Marcar grúa anterior ({idGrua(a)}) como fuera de servicio
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
                                      setFormChoferKey(opKey({ nombre: d.chofer, legajo: d.legajoChofer ?? "" }));
                                      setFormEnganchadorKey(opKey({ nombre: enganchadorDeDupla(d), legajo: d.legajoEnganchador ?? "" }));
                                    }
                                  }
                                }}
                                options={duplaOptions}
                                placeholder="Seleccionar dupla"
                                size="sm"
                              />
                              {formDuplaId === DUPLA_MANUAL && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                                      <User className="w-3.5 h-3.5" />
                                      Chofer
                                    </label>
                                    <CustomSelect
                                      value={formChoferKey}
                                      onChange={setFormChoferKey}
                                      options={choferOptions}
                                      placeholder="Seleccioná chofer"
                                      icon={User}
                                      ariaLabel="Chofer"
                                      size="sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                                      <Users className="w-3.5 h-3.5" />
                                      Enganchador
                                    </label>
                                    <CustomSelect
                                      value={formEnganchadorKey}
                                      onChange={setFormEnganchadorKey}
                                      options={enganchadorOptions}
                                      placeholder="Seleccioná enganchador"
                                      icon={Users}
                                      ariaLabel="Enganchador"
                                      size="sm"
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
                                    Marcar grúa anterior ({idGrua(a)}) como fuera de servicio
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
                                Sacar <strong>{a.gruaDescripcion || idGrua(a)}</strong> ({idGrua(a)}) de servicio
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
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-extrabold text-brand-purply font-mono bg-white border border-brand-seashell px-2 py-0.5 rounded">
                              {g.prefijo?.trim() || g.patente}
                            </span>
                            {oos && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 uppercase">
                                {labelMotivoFueraDeServicio(oos.categoria)}
                              </span>
                            )}
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
                          {g.descripcion && (
                            <p className="text-xs text-brand-pale">{g.descripcion}</p>
                          )}
                        </div>
                        {permisos.puedeSacarOOS && (
                          <button
                            type="button"
                            onClick={() => handleReactivar(g.docId || g.id, g.patente)}
                            disabled={saving}
                            className="py-2 px-4 bg-emerald-600 text-white rounded-xl text-xs font-extrabold shadow-md hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reactivar Grúa
                          </button>
                        )}
                      </div>

                      {oos && (
                        <div className="space-y-1 text-xs text-brand-pale">
                          {oos.motivo && (
                            <div className="bg-white rounded-lg border border-brand-seashell px-3 py-2">
                              <span className="font-bold">Motivo:</span> {oos.motivo}
                            </div>
                          )}
                          <p>
                            Desde: {new Date(oos.desde).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric" })}, {new Date(oos.desde).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            {oos.desactivadaPorNombre && (
                              <> &nbsp;&nbsp;Por: <strong>{oos.desactivadaPorNombre}</strong></>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-brand-seashell flex items-center justify-between">
            <p className="text-[11px] text-brand-pale">
              Acciones operativas con registro de auditoría en tiempo real.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-bold text-brand-pale hover:text-brand-purply transition-colors cursor-pointer"
            >
              Cerrar
            </button>
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
