import React, { useEffect, useMemo, useState } from "react";
import {
  AsignacionDiaria,
  Grua,
  Dupla,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  normalizeTipoFlota,
  enganchadorDeDupla,
} from "@gruasbacar/shared";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import { useAuth } from "../../context/AuthContext";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { Truck, Users, User, X, AlertCircle } from "lucide-react";
import { fechaHoyArgentina } from "../../utils/formatters";
import { CustomSelect } from "../shared/CustomSelect";

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
  const { guardarAsignacionDiaria } = useAuth();

  const [gruas, setGruas] = useState<Grua[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipoFlota, setTipoFlota] = useState<TipoFlota>("TRANSITO");
  const [gruaPatente, setGruaPatente] = useState("");
  const [duplaId, setDuplaId] = useState("");
  const [inspector, setInspector] = useState("");

  const gruasFiltradas = useMemo(
    () => gruas.filter((g) => normalizeTipoFlota(g.tipo) === tipoFlota),
    [gruas, tipoFlota]
  );

  const duplasFiltradas = useMemo(
    () => duplas.filter((d) => normalizeTipoFlota(d.tipo) === tipoFlota),
    [duplas, tipoFlota]
  );

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setTipoFlota(normalizeTipoFlota(initialAsignacion?.tipoFlota));
    setGruaPatente(initialAsignacion?.gruaPatente ?? "");
    setDuplaId(initialAsignacion?.duplaId ?? "");
    setInspector(initialAsignacion?.inspector ?? "");

    const load = async () => {
      setLoadingCatalog(true);
      try {
        const [activeGruas, activeDuplas] = await Promise.all([
          gruaService.getGruasActivas(),
          duplaService.getDuplasActivas(),
        ]);
        setGruas(activeGruas);
        setDuplas(activeDuplas);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar grúas y duplas.");
      } finally {
        setLoadingCatalog(false);
      }
    };

    load();
  }, [isOpen, initialAsignacion]);

  // Asegura grúa y dupla válidas para el tipo elegido (también al cambiar Tránsito ↔ Transporte).
  useEffect(() => {
    if (!isOpen || loadingCatalog) return;

    setGruaPatente((prev) =>
      gruasFiltradas.some((g) => g.patente === prev)
        ? prev
        : (gruasFiltradas[0]?.patente ?? "")
    );
    setDuplaId((prev) =>
      duplasFiltradas.some((d) => d.id === prev) ? prev : (duplasFiltradas[0]?.id ?? "")
    );
  }, [isOpen, loadingCatalog, tipoFlota, gruas, duplas, gruasFiltradas, duplasFiltradas]);

  const selectedDupla = duplasFiltradas.find((d) => d.id === duplaId);

  const gruaOptions = useMemo(
    () =>
      gruasFiltradas.length === 0
        ? [{ value: "", label: "Sin grúas de este tipo" }]
        : gruasFiltradas.map((g) => ({
            value: g.patente,
            label: `${g.patente}${g.descripcion ? ` — ${g.descripcion}` : ""}`,
          })),
    [gruasFiltradas]
  );

  const duplaOptions = useMemo(
    () =>
      duplasFiltradas.length === 0
        ? [{ value: "", label: "Sin duplas de este tipo" }]
        : duplasFiltradas.map((d) => ({
            value: d.id,
            label: `${d.chofer} + ${enganchadorDeDupla(d)}`,
          })),
    [duplasFiltradas]
  );

  const handleTipoFlotaChange = (nuevoTipo: TipoFlota) => {
    setError(null);
    setTipoFlota(nuevoTipo);
    const gruasTipo = gruas.filter((g) => normalizeTipoFlota(g.tipo) === nuevoTipo);
    const duplasTipo = duplas.filter((d) => normalizeTipoFlota(d.tipo) === nuevoTipo);
    setGruaPatente((prev) =>
      gruasTipo.some((g) => g.patente === prev) ? prev : (gruasTipo[0]?.patente ?? "")
    );
    setDuplaId((prev) =>
      duplasTipo.some((d) => d.id === prev) ? prev : (duplasTipo[0]?.id ?? "")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dupla = duplasFiltradas.find((d) => d.id === duplaId);
    const gruaOk = gruasFiltradas.some((g) => g.patente === gruaPatente);

    if (!gruaOk || !dupla) {
      setError("Elegí una grúa y dupla válidas para el tipo seleccionado.");
      return;
    }
    if (!inspector.trim()) {
      setError("Indicá el inspector que te acompaña.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await guardarAsignacionDiaria({
        gruaPatente,
        duplaId: dupla.id,
        duplaChofer: dupla.chofer,
        duplaEnganchador: enganchadorDeDupla(dupla),
        inspector: inspector.trim(),
        tipoFlota,
      });
      onSaved({
        fecha: fechaHoyArgentina(),
        gruaPatente,
        duplaId: dupla.id,
        duplaChofer: dupla.chofer,
        duplaEnganchador: enganchadorDeDupla(dupla),
        inspector: inspector.trim(),
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
  const sinRecursos = gruasFiltradas.length === 0 || duplasFiltradas.length === 0;

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
              Elegí tránsito o transporte; solo verás grúas y duplas de ese tipo.
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
                  No hay grúas o duplas habilitadas de tipo{" "}
                  {TIPO_FLOTA_OPTIONS.find((o) => o.value === tipoFlota)?.label.toLowerCase()}.
                  Pedile al administrador que las configure.
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
                  <Users className="w-3.5 h-3.5" />
                  Dupla de trabajo
                </label>
                <CustomSelect
                  value={duplaId}
                  onChange={setDuplaId}
                  options={duplaOptions}
                  placeholder="Seleccioná dupla"
                  icon={Users}
                  ariaLabel="Dupla de trabajo"
                  disabled={saving || duplasFiltradas.length === 0}
                />
                {selectedDupla && (
                  <p className="text-[10px] text-brand-pale mt-1">
                    Chofer: {selectedDupla.chofer} · Enganchador: {enganchadorDeDupla(selectedDupla)}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-brand-pale uppercase tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  Inspector que te acompaña
                </label>
                <input
                  type="text"
                  value={inspector}
                  onChange={(e) => setInspector(e.target.value)}
                  disabled={saving}
                  placeholder="Ej: Inspector Daniel López"
                  className="w-full px-3 py-2.5 bg-brand-bg border border-brand-seashell rounded-xl text-sm text-brand-purply font-medium placeholder:text-brand-pale/70"
                  required
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={saving || loadingCatalog || sinRecursos}
            className="w-full py-3 bg-brand-cta hover:bg-brand-cta-hover disabled:bg-brand-cta/40 text-white font-extrabold text-xs rounded-xl cursor-pointer"
          >
            {saving ? "Guardando..." : "Confirmar turno del día"}
          </button>

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
