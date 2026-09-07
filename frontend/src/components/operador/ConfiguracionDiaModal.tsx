import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AsignacionDiaria,
  Grua,
  Dupla,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  normalizeTipoFlota,
  labelTipoFlota,
  enganchadorDeDupla,
  duplaDeUsuario,
  legajoKey,
  nombresCoinciden,
  normalizeRoles,
  turnoSigueVigente,
  buildGruaId,
} from "@gruasbacar/shared";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import { obtenerOperadoresActivos, OperadorResumen } from "../../services/usuario.service";
import { useAuth } from "../../context/AuthContext";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { Truck, User, Users, X, AlertCircle, MessageSquareWarning, Info } from "lucide-react";
import { fechaHoyArgentina } from "../../utils/formatters";
import { CustomSelect } from "../shared/CustomSelect";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { solicitarReconfiguracionTurno } from "../../services/notificacion.service";

interface Operador {
  nombre: string;
  legajo: string;
}

function uniqueKey(op: Operador): string {
  return op.legajo || op.nombre.trim().toLowerCase();
}

function extractOperadores(duplas: Dupla[], rol: "chofer" | "enganchador"): Operador[] {
  const seen = new Set<string>();
  const result: Operador[] = [];
  for (const d of duplas) {
    const nombre = rol === "chofer" ? d.chofer : enganchadorDeDupla(d);
    const legajo = rol === "chofer" ? d.legajoChofer ?? "" : d.legajoEnganchador ?? "";
    if (!nombre.trim()) continue;
    const key = uniqueKey({ nombre, legajo });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ nombre: nombre.trim(), legajo: legajo.trim() });
  }
  return result;
}

function findDuplaMatch(
  duplas: Dupla[],
  chofer: Operador | undefined,
  enganchador: Operador | undefined
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

function TipoFlotaBadge({ tipo }: { tipo: TipoFlota | string | undefined }) {
  const normalized = normalizeTipoFlota(tipo);
  const isTransporte = normalized === "TRANSPORTE";
  return (
    <span
      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
        isTransporte
          ? "bg-blue-50 text-blue-700 border-blue-200/70"
          : "bg-amber-50 text-amber-700 border-amber-200/70"
      }`}
    >
      {labelTipoFlota(normalized)}
    </span>
  );
}

function gruaOptionContent(g: Grua, showTipoBadge: boolean, enUso: boolean) {
  const nombre = g.descripcion?.trim() || g.patente;
  const plainLabel = enUso
    ? `${nombre} · ${g.patente} (EN USO)`
    : `${nombre} · ${g.patente}`;

  if (!showTipoBadge) {
    return plainLabel;
  }

  return (
    <span className="flex items-center justify-between gap-2 w-full min-w-0">
      <span className="truncate min-w-0">
        <span className="font-semibold">{nombre}</span>
        <span className="text-brand-pale font-mono text-[11px] ml-1.5">{g.patente}</span>
        {enUso && <span className="text-amber-700 ml-1">(EN USO)</span>}
      </span>
      <TipoFlotaBadge tipo={g.tipo} />
    </span>
  );
}

interface ConfiguracionDiaModalProps {
  isOpen: boolean;
  blocking?: boolean;
  allowDismiss?: boolean;
  dismissLabel?: string;
  initialAsignacion?: AsignacionDiaria | null;
  onClose?: () => void;
  onSaved: (asignacion: AsignacionDiaria) => void;
}

export const ConfiguracionDiaModal: React.FC<ConfiguracionDiaModalProps> = ({
  isOpen,
  blocking = false,
  allowDismiss = false,
  dismissLabel = "Configurar más tarde",
  initialAsignacion,
  onClose,
  onSaved,
}) => {
  const { guardarAsignacionDiaria, userData } = useAuth();

  const [gruas, setGruas] = useState<Grua[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [cfOperadores, setCfOperadores] = useState<OperadorResumen[]>([]);
  const [gruasOcupadas, setGruasOcupadas] = useState<Set<string>>(new Set());
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solicitudEnviando, setSolicitudEnviando] = useState(false);
  const [solicitudOk, setSolicitudOk] = useState(false);
  const [solicitudError, setSolicitudError] = useState<string | null>(null);

  const [tipoOperacion, setTipoOperacion] = useState<TipoFlota>("TRANSITO");
  const [mostrarTodasGruas, setMostrarTodasGruas] = useState(false);
  const [confirmCrossOperacion, setConfirmCrossOperacion] = useState(false);
  const [gruaPatente, setGruaPatente] = useState("");
  const [choferKey, setChoferKey] = useState("");
  const [enganchadorKey, setEnganchadorKey] = useState("");
  const preselected = useRef(false);

  const gruasFiltradas = useMemo(
    () => gruas.filter((g) => normalizeTipoFlota(g.tipo) === tipoOperacion),
    [gruas, tipoOperacion]
  );

  const gruasParaSelect = useMemo(
    () => (mostrarTodasGruas ? gruas : gruasFiltradas),
    [mostrarTodasGruas, gruas, gruasFiltradas]
  );

  const gruaSeleccionada = useMemo(
    () => gruas.find((g) => g.patente === gruaPatente),
    [gruas, gruaPatente]
  );

  const tipoFlotaEfectivo = useMemo(
    () => normalizeTipoFlota(gruaSeleccionada?.tipo ?? tipoOperacion),
    [gruaSeleccionada, tipoOperacion]
  );

  const esCrossOperacion = useMemo(
    () =>
      !!gruaSeleccionada && normalizeTipoFlota(gruaSeleccionada.tipo) !== tipoOperacion,
    [gruaSeleccionada, tipoOperacion]
  );

  const userIdentity = useMemo<{ nombre?: string; legajo?: string }>(() => {
    const nombre = userData?.nombre;
    const legajo = userData?.legajo;
    if (nombre && legajo) return { nombre, legajo };

    const matchInCf = cfOperadores.find((o) => {
      if (legajo && legajoKey(o.legajo) === legajoKey(legajo)) return true;
      if (nombre && nombre !== "Usuario Sin Nombre" && nombresCoinciden(o.nombre, nombre)) return true;
      return false;
    });
    if (matchInCf) return { nombre: matchInCf.nombre, legajo: matchInCf.legajo };

    return { nombre, legajo };
  }, [userData, cfOperadores]);

  const miDupla = useMemo(() => duplaDeUsuario(duplas, userIdentity), [duplas, userIdentity]);

  const choferes = useMemo(() => {
    const fromDuplas = extractOperadores(duplas, "chofer");
    const fromCf = cfOperadores
      .filter((o) => o.roles.includes("CHOFER"))
      .map((o) => ({ nombre: o.nombre, legajo: o.legajo }));
    const seen = new Set<string>();
    const result: Operador[] = [];
    for (const op of [...fromCf, ...fromDuplas]) {
      const key = uniqueKey(op);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(op);
    }
    if (userIdentity?.nombre && userIdentity.nombre !== "Usuario Sin Nombre") {
      const roles = normalizeRoles(userData?.roles, userData?.rol);
      if (roles.includes("CHOFER")) {
        const me: Operador = { nombre: userIdentity.nombre, legajo: userIdentity.legajo ?? "" };
        if (!seen.has(uniqueKey(me))) result.push(me);
      }
    }
    if (miDupla) {
      const duplaKey = uniqueKey({ nombre: miDupla.chofer, legajo: miDupla.legajoChofer ?? "" });
      const idx = result.findIndex((o) => uniqueKey(o) === duplaKey);
      if (idx > 0) result.unshift(...result.splice(idx, 1));
    }
    return result;
  }, [duplas, cfOperadores, userData, userIdentity, miDupla]);

  const enganchadores = useMemo(() => {
    const fromDuplas = extractOperadores(duplas, "enganchador");
    const fromCf = cfOperadores
      .filter((o) => o.roles.includes("ENGANCHADOR"))
      .map((o) => ({ nombre: o.nombre, legajo: o.legajo }));
    const seen = new Set<string>();
    const result: Operador[] = [];
    for (const op of [...fromCf, ...fromDuplas]) {
      const key = uniqueKey(op);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(op);
    }
    if (userIdentity?.nombre && userIdentity.nombre !== "Usuario Sin Nombre") {
      const roles = normalizeRoles(userData?.roles, userData?.rol);
      if (roles.includes("ENGANCHADOR")) {
        const me: Operador = { nombre: userIdentity.nombre, legajo: userIdentity.legajo ?? "" };
        if (!seen.has(uniqueKey(me))) result.push(me);
      }
    }
    if (miDupla) {
      const eng = enganchadorDeDupla(miDupla);
      const duplaKey = uniqueKey({ nombre: eng, legajo: miDupla.legajoEnganchador ?? "" });
      const idx = result.findIndex((o) => uniqueKey(o) === duplaKey);
      if (idx > 0) result.unshift(...result.splice(idx, 1));
    }
    return result;
  }, [duplas, cfOperadores, userData, userIdentity, miDupla]);

  const selectedChofer = choferes.find((c) => uniqueKey(c) === choferKey);
  const selectedEnganchador = enganchadores.find((e) => uniqueKey(e) === enganchadorKey);

  const duplaMatch = useMemo(
    () => findDuplaMatch(duplas, selectedChofer, selectedEnganchador),
    [duplas, selectedChofer, selectedEnganchador]
  );

  const turnoVigente = useMemo(() => {
    if (!initialAsignacion?.inicioEn) return null;
    return turnoSigueVigente(initialAsignacion) ? initialAsignacion : null;
  }, [initialAsignacion]);

  const gruaReferenciaPatente = useMemo(() => {
    if (turnoVigente?.gruaPatente) return turnoVigente.gruaPatente;
    if (
      initialAsignacion?.gruaPatente &&
      normalizeTipoFlota(initialAsignacion.tipoFlota) === tipoOperacion
    ) {
      return initialAsignacion.gruaPatente;
    }
    if (miDupla?.gruaId && gruas.length > 0) {
      const habitual = gruas.find(
        (g) => g.id === miDupla.gruaId || buildGruaId(g.patente) === miDupla.gruaId
      );
      if (habitual) return habitual.patente;
    }
    return gruasFiltradas[0]?.patente ?? "";
  }, [turnoVigente, initialAsignacion, miDupla, gruas, gruasFiltradas, tipoOperacion]);

  const tipoReferencia = useMemo(() => {
    if (initialAsignacion?.tipoFlota) return normalizeTipoFlota(initialAsignacion.tipoFlota);
    if (miDupla?.gruaId && gruas.length > 0) {
      const habitual = gruas.find(
        (g) => g.id === miDupla.gruaId || buildGruaId(g.patente) === miDupla.gruaId
      );
      if (habitual?.tipo) return normalizeTipoFlota(habitual.tipo);
    }
    return "TRANSITO" as TipoFlota;
  }, [initialAsignacion, miDupla, gruas]);

  const tieneServicioActivo = !!userData?.servicioActivoId;

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    preselected.current = false;
    setMostrarTodasGruas(false);
    setConfirmCrossOperacion(false);
    setTipoOperacion(normalizeTipoFlota(initialAsignacion?.tipoFlota));
    setGruaPatente(initialAsignacion?.gruaPatente ?? "");
    setChoferKey("");
    setEnganchadorKey("");

    const load = async () => {
      setLoadingCatalog(true);
      try {
        const [activeGruas, activeDuplas, cfOps, ocupadas] = await Promise.all([
          gruaService.getGruasActivas(),
          duplaService.getDuplasActivas(),
          obtenerOperadoresActivos(),
          gruaService.getGruasOcupadas().catch(() => new Set<string>()),
        ]);
        setGruas(activeGruas);
        setDuplas(activeDuplas);
        setCfOperadores(cfOps);
        setGruasOcupadas(ocupadas);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar grúas y duplas.");
      } finally {
        setLoadingCatalog(false);
      }
    };

    load();
  }, [isOpen, initialAsignacion]);

  useEffect(() => {
    if (!isOpen) return;
    setTipoOperacion(tipoReferencia);
  }, [isOpen, tipoReferencia]);

  useEffect(() => {
    if (!isOpen || loadingCatalog) return;

    if (!preselected.current) {
      preselected.current = true;

      if (miDupla) {
        const choferOp: Operador = { nombre: miDupla.chofer, legajo: miDupla.legajoChofer ?? "" };
        const engOp: Operador = { nombre: enganchadorDeDupla(miDupla), legajo: miDupla.legajoEnganchador ?? "" };
        setChoferKey(uniqueKey(choferOp));
        setEnganchadorKey(uniqueKey(engOp));
      } else {
        const roles = normalizeRoles(userData?.roles, userData?.rol);
        const userLegajo = legajoKey(userIdentity?.legajo);
        const userName = userIdentity?.nombre;

        const matchByLegajoOrName = (ops: Operador[]) =>
          ops.find((o) =>
            (userLegajo && legajoKey(o.legajo) === userLegajo) ||
            nombresCoinciden(o.nombre, userName)
          );

        if (roles.includes("CHOFER")) {
          const match = matchByLegajoOrName(choferes);
          setChoferKey(match ? uniqueKey(match) : "");
          setEnganchadorKey("");
        } else if (roles.includes("ENGANCHADOR")) {
          const match = matchByLegajoOrName(enganchadores);
          setEnganchadorKey(match ? uniqueKey(match) : "");
          setChoferKey("");
        } else {
          setChoferKey("");
          setEnganchadorKey("");
        }
      }
    }

    setGruaPatente((prev) => {
      if (gruasParaSelect.some((g) => g.patente === prev)) return prev;
      return gruasParaSelect[0]?.patente ?? "";
    });
  }, [isOpen, loadingCatalog, tipoOperacion, gruas, duplas, gruasParaSelect, choferes, enganchadores, userData, userIdentity, miDupla]);

  const gruaOptions = useMemo(
    () =>
      gruasParaSelect.length === 0
        ? [{ value: "", label: mostrarTodasGruas ? "Sin grúas disponibles" : "Sin grúas de este tipo" }]
        : gruasParaSelect.map((g) => {
            const enUso = gruasOcupadas.has(g.patente);
            const plainLabel = enUso
              ? `${g.descripcion?.trim() || g.patente} · ${g.patente} (EN USO)`
              : `${g.descripcion?.trim() || g.patente} · ${g.patente}`;
            const content = gruaOptionContent(g, mostrarTodasGruas, enUso);
            if (typeof content === "string") {
              return { value: g.patente, label: content };
            }
            return { value: g.patente, label: plainLabel, content };
          }),
    [gruasParaSelect, gruasOcupadas, mostrarTodasGruas]
  );

  const choferOptions = useMemo(
    () =>
      choferes.length === 0
        ? [{ value: "", label: "Sin choferes disponibles" }]
        : choferes.map((c) => ({
            value: uniqueKey(c),
            label: c.nombre + (c.legajo ? ` (${c.legajo})` : ""),
          })),
    [choferes]
  );

  const enganchadorOptions = useMemo(
    () =>
      enganchadores.length === 0
        ? [{ value: "", label: "Sin enganchadores disponibles" }]
        : enganchadores.map((e) => ({
            value: uniqueKey(e),
            label: e.nombre + (e.legajo ? ` (${e.legajo})` : ""),
          })),
    [enganchadores]
  );

  const guardarTurno = async () => {
    if (!gruaSeleccionada || !selectedChofer || !selectedEnganchador) {
      setError("Elegí grúa, chofer y enganchador.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        gruaPatente,
        duplaId: duplaMatch?.id ?? "",
        duplaChofer: selectedChofer.nombre,
        duplaEnganchador: selectedEnganchador.nombre,
        legajoChofer: selectedChofer.legajo || undefined,
        legajoEnganchador: selectedEnganchador.legajo || undefined,
        tipoFlota: tipoFlotaEfectivo,
        tipoOperacionReferencia: tipoOperacion,
        ...(gruaReferenciaPatente ? { gruaReferenciaPatente } : {}),
      };
      await guardarAsignacionDiaria(payload);
      onSaved({
        fecha: fechaHoyArgentina(),
        gruaPatente,
        duplaId: duplaMatch?.id ?? "",
        duplaChofer: selectedChofer.nombre,
        duplaEnganchador: selectedEnganchador.nombre,
        tipoFlota: tipoFlotaEfectivo,
      });
      setConfirmCrossOperacion(false);
      if (!blocking) onClose?.();
    } catch (err: unknown) {
      console.error(err);
      setError(getFirebaseErrorMessage(err, "No se pudo guardar la configuración del día."));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gruaSeleccionada || !selectedChofer || !selectedEnganchador) {
      setError("Elegí grúa, chofer y enganchador.");
      return;
    }

    if (esCrossOperacion) {
      setConfirmCrossOperacion(true);
      return;
    }

    await guardarTurno();
  };

  if (!isOpen) return null;

  const canDismiss = allowDismiss && Boolean(onClose);
  const sinRecursos =
    gruasParaSelect.length === 0 || choferes.length === 0 || enganchadores.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={blocking || !canDismiss ? undefined : onClose}
      />

      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-brand-seashell z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-brand-seashell flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold text-brand-cta uppercase tracking-wider">
              Inicio de jornada
            </p>
            <h3 className="text-base font-bold text-brand-purply mt-1">
              Configurá tu turno de hoy
            </h3>
            <p className="text-xs text-brand-pale mt-1">
              Elegí tipo, grúa, chofer y enganchador para este turno.
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-brand-pale hover:bg-brand-bg cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/40 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loadingCatalog ? (
            <div className="py-8 flex flex-col items-center gap-2 text-xs text-brand-pale">
              <div className="w-7 h-7 rounded-full border-2 border-brand-cta border-t-transparent animate-spin" />
              Cargando grúas y duplas...
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                  Tipo de operación
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPO_FLOTA_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border cursor-not-allowed opacity-80 ${
                        tipoOperacion === opt.value
                          ? "bg-brand-cta text-white border-brand-cta"
                          : "bg-brand-bg text-brand-purply border-brand-seashell"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {tieneServicioActivo && turnoVigente && (
                <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-xl border border-blue-200/50 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Tenés un servicio activo con grúa <strong>{turnoVigente.gruaPatente}</strong>.
                    El cambio aplica al próximo servicio.
                  </span>
                </div>
              )}

              {esCrossOperacion && (
                <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl border border-amber-200/50 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Elegiste la grúa <strong>{gruaPatente}</strong> ({labelTipoFlota(tipoFlotaEfectivo)}).
                    Tu operación habitual es <strong>{labelTipoFlota(tipoOperacion)}</strong>.
                    Se notificará al administrador al confirmar.
                  </span>
                </div>
              )}

              {sinRecursos && (
                <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200/50">
                  No hay grúas o personal habilitado.
                  Pedile al administrador que los configure.
                </p>
              )}

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                  <Truck className="w-3.5 h-3.5" />
                  Grúa asignada
                </label>
                <CustomSelect
                  value={gruaPatente}
                  onChange={setGruaPatente}
                  options={gruaOptions}
                  placeholder="Seleccioná grúa"
                  icon={Truck}
                  ariaLabel="Grúa asignada"
                  disabled={saving || gruasParaSelect.length === 0}
                />
                {!mostrarTodasGruas ? (
                  <button
                    type="button"
                    onClick={() => setMostrarTodasGruas(true)}
                    disabled={saving}
                    className="mt-1.5 text-[11px] font-semibold text-brand-cta hover:text-brand-cta-hover underline underline-offset-2 cursor-pointer disabled:opacity-60"
                  >
                    ¿No es la grúa que necesitás?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarTodasGruas(false);
                      setGruaPatente((prev) => {
                        if (gruasFiltradas.some((g) => g.patente === prev)) return prev;
                        return gruasFiltradas[0]?.patente ?? "";
                      });
                    }}
                    disabled={saving}
                    className="mt-1.5 text-[11px] font-semibold text-brand-pale hover:text-brand-purply underline underline-offset-2 cursor-pointer disabled:opacity-60"
                  >
                    Ver solo grúas de {labelTipoFlota(tipoOperacion)}
                  </button>
                )}
                {gruaPatente && gruasOcupadas.has(gruaPatente) && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Esta grúa tiene un servicio activo. Si la seleccionás, no podrás crear un enganche hasta que se libere.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  Chofer
                </label>
                <CustomSelect
                  value={choferKey}
                  onChange={setChoferKey}
                  options={choferOptions}
                  placeholder="Seleccioná chofer"
                  icon={User}
                  ariaLabel="Chofer"
                  disabled={saving || choferes.length === 0}
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5" />
                  Enganchador
                </label>
                <CustomSelect
                  value={enganchadorKey}
                  onChange={setEnganchadorKey}
                  options={enganchadorOptions}
                  placeholder="Seleccioná enganchador"
                  icon={Users}
                  ariaLabel="Enganchador"
                  disabled={saving || enganchadores.length === 0}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={saving || loadingCatalog || sinRecursos || !selectedChofer || !selectedEnganchador}
            className="w-full py-3 font-extrabold text-xs rounded-xl cursor-pointer bg-brand-cta hover:bg-brand-cta-hover disabled:bg-brand-cta/40 text-white"
          >
            {saving ? "Guardando..." : esCrossOperacion ? "Confirmar turno" : "Confirmar turno del día"}
          </button>

          <button
            type="button"
            disabled={solicitudEnviando || solicitudOk}
            onClick={async () => {
              setSolicitudEnviando(true);
              setSolicitudError(null);
              try {
                await solicitarReconfiguracionTurno();
                setSolicitudOk(true);
              } catch (err) {
                setSolicitudError(
                  getFirebaseErrorMessage(err, "No se pudo avisar al administrador.")
                );
              } finally {
                setSolicitudEnviando(false);
              }
            }}
            className="w-full py-2.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <MessageSquareWarning className="w-4 h-4" />
            {solicitudOk
              ? "Administrador avisado"
              : solicitudEnviando
                ? "Enviando aviso…"
                : "Mi turno no está bien"}
          </button>
          {solicitudError && (
            <p className="text-[11px] text-red-600">{solicitudError}</p>
          )}
          {solicitudOk && (
            <p className="text-[11px] text-emerald-700">
              El administrador recibió tu aviso. Te notificaremos cuando lo actualice.
            </p>
          )}

          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full py-2.5 text-xs font-bold text-brand-pale hover:text-brand-purply cursor-pointer"
            >
              {dismissLabel}
            </button>
          )}
        </form>
      </div>

      <ConfirmDialog
        isOpen={confirmCrossOperacion}
        onClose={() => setConfirmCrossOperacion(false)}
        onConfirm={() => void guardarTurno()}
        title="Grúa de otra operación"
        message={
          <>
            Estás trayendo una grúa de <strong>{labelTipoFlota(tipoFlotaEfectivo)}</strong> (
            {gruaPatente}) estando asignado a <strong>{labelTipoFlota(tipoOperacion)}</strong>.
            <br />
            <br />
            ¿Estás seguro? Se avisará al administrador.
          </>
        }
        confirmText="Sí, confirmar"
        cancelText="Volver"
      />
    </div>
  );
};

export default ConfiguracionDiaModal;
