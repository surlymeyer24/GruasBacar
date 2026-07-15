import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AsignacionDiaria,
  Grua,
  Dupla,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  normalizeTipoFlota,
  enganchadorDeDupla,
  duplaDeUsuario,
  legajoKey,
  nombresCoinciden,
  normalizeRoles,
} from "@gruasbacar/shared";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import { obtenerOperadoresActivos, OperadorResumen } from "../../services/usuario.service";
import { useAuth } from "../../context/AuthContext";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { Truck, User, Users, X, AlertCircle, MessageSquareWarning } from "lucide-react";
import { fechaHoyArgentina } from "../../utils/formatters";
import { CustomSelect } from "../shared/CustomSelect";
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
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solicitudEnviando, setSolicitudEnviando] = useState(false);
  const [solicitudOk, setSolicitudOk] = useState(false);
  const [solicitudError, setSolicitudError] = useState<string | null>(null);

  const [tipoFlota, setTipoFlota] = useState<TipoFlota>("TRANSITO");
  const [gruaPatente, setGruaPatente] = useState("");
  const [choferKey, setChoferKey] = useState("");
  const [enganchadorKey, setEnganchadorKey] = useState("");
  const preselected = useRef(false);

  const gruasFiltradas = useMemo(
    () => gruas.filter((g) => normalizeTipoFlota(g.tipo) === tipoFlota),
    [gruas, tipoFlota]
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

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    preselected.current = false;
    setTipoFlota(normalizeTipoFlota(initialAsignacion?.tipoFlota));
    setGruaPatente(initialAsignacion?.gruaPatente ?? "");
    setChoferKey("");
    setEnganchadorKey("");

    const load = async () => {
      setLoadingCatalog(true);
      try {
        const [activeGruas, activeDuplas, cfOperadores] = await Promise.all([
          gruaService.getGruasActivas(),
          duplaService.getDuplasActivas(),
          obtenerOperadoresActivos(),
        ]);
        setGruas(activeGruas);
        setDuplas(activeDuplas);
        setCfOperadores(cfOperadores);
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
      if (gruasFiltradas.some((g) => g.patente === prev)) return prev;
      return gruasFiltradas[0]?.patente ?? "";
    });
  }, [isOpen, loadingCatalog, tipoFlota, gruas, duplas, gruasFiltradas, choferes, enganchadores, userData, userIdentity, miDupla]);

  const gruaOptions = useMemo(
    () =>
      gruasFiltradas.length === 0
        ? [{ value: "", label: "Sin grúas de este tipo" }]
        : gruasFiltradas.map((g) => ({
            value: g.patente,
            label: g.descripcion?.trim() ? `${g.descripcion} — ${g.patente}` : g.patente,
          })),
    [gruasFiltradas]
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

  const handleTipoFlotaChange = (nuevoTipo: TipoFlota) => {
    setError(null);
    setTipoFlota(nuevoTipo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const gruaOk = gruasFiltradas.some((g) => g.patente === gruaPatente);
    if (!gruaOk || !selectedChofer || !selectedEnganchador) {
      setError("Elegí grúa, chofer y enganchador para el tipo seleccionado.");
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
        tipoFlota,
      };
      await guardarAsignacionDiaria(payload);
      onSaved({
        fecha: fechaHoyArgentina(),
        gruaPatente,
        duplaId: duplaMatch?.id ?? "",
        duplaChofer: selectedChofer.nombre,
        duplaEnganchador: selectedEnganchador.nombre,
        tipoFlota,
      });
      if (!blocking) onClose?.();
    } catch (err: unknown) {
      console.error(err);
      setError(getFirebaseErrorMessage(err, "No se pudo guardar la configuración del día."));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const canDismiss = allowDismiss && Boolean(onClose);
  const sinRecursos = gruasFiltradas.length === 0 || choferes.length === 0 || enganchadores.length === 0;

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
                      disabled={saving}
                      onClick={() => handleTipoFlotaChange(opt.value)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        tipoFlota === opt.value
                          ? "bg-brand-cta text-white border-brand-cta"
                          : "bg-brand-bg text-brand-purply border-brand-seashell hover:border-brand-cta/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

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
                  disabled={saving || gruasFiltradas.length === 0}
                />
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
            className="w-full py-3 bg-brand-cta hover:bg-brand-cta-hover disabled:bg-brand-cta/40 text-white font-extrabold text-xs rounded-xl cursor-pointer"
          >
            {saving ? "Guardando..." : "Confirmar turno del día"}
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
    </div>
  );
};

export default ConfiguracionDiaModal;
