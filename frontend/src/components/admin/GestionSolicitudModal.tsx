import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  AlertCircle,
  Truck,
  Users,
  User,
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  Notificacion,
  AsignacionDiaria,
  Grua,
  Dupla,
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  MOTIVO_FUERA_DE_SERVICIO_OPTIONS,
  MotivoFueraDeServicio,
  normalizeTipoFlota,
  labelTipoFlota,
  enganchadorDeDupla,
  Usuario,
} from "@gruasbacar/shared";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import { asignarTurnoOperador } from "../../services/notificacion.service";
import { fechaHoyArgentina } from "../../utils/formatters";
import { CustomSelect } from "../shared/CustomSelect";

interface Props {
  notificacion: Notificacion;
  onClose: () => void;
  onResolved: () => void;
}

const DUPLA_MANUAL = "__manual__";

export const GestionSolicitudModal: React.FC<Props> = ({
  notificacion,
  onClose,
  onResolved,
}) => {
  const datos = notificacion.datos ?? {};
  const esCambioGrua = notificacion.tipo === "SOLICITUD_CAMBIO_GRUA";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [gruas, setGruas] = useState<Grua[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [operadorAsignacion, setOperadorAsignacion] = useState<AsignacionDiaria | null>(null);

  const [editTipoFlota, setEditTipoFlota] = useState<TipoFlota>(
    normalizeTipoFlota(esCambioGrua ? datos.tipoFlotaSolicitado : undefined)
  );
  const [editGruaPatente, setEditGruaPatente] = useState(
    esCambioGrua ? (datos.gruaSolicitadaPatente ?? "") : ""
  );
  const [editDuplaId, setEditDuplaId] = useState(DUPLA_MANUAL);
  const [editChofer, setEditChofer] = useState("");
  const [editEnganchador, setEditEnganchador] = useState("");

  const [gruaOosPatente, setGruaOosPatente] = useState("");
  const [categoriaOos, setCategoriaOos] = useState<MotivoFueraDeServicio | "">("");
  const [motivoAdmin, setMotivoAdmin] = useState("");
  const [deshabilitarGrua, setDeshabilitarGrua] = useState(false);

  const tipoFlotaOrigen = normalizeTipoFlota(datos.tipoFlotaActual);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [gruasList, duplasList] = await Promise.all([
          gruaService.getGruasActivas(),
          duplaService.getDuplasActivas(),
        ]);

        let asignacion: AsignacionDiaria | null = null;
        const uid = datos.operadorUid;
        if (uid && db) {
          const snap = await getDoc(doc(db, "usuarios", uid));
          if (snap.exists()) {
            const u = snap.data() as Usuario;
            if (u.asignacionDiaria?.fecha === fechaHoyArgentina()) {
              asignacion = u.asignacionDiaria;
            }
          }
        }

        if (cancelled) return;
        setGruas(gruasList);
        setDuplas(duplasList);
        setOperadorAsignacion(asignacion);

        if (asignacion) {
          setEditChofer(asignacion.duplaChofer);
          setEditEnganchador(asignacion.duplaEnganchador);
          const matchesCatalog = duplasList.some(
            (d) =>
              d.id === asignacion!.duplaId &&
              d.chofer === asignacion!.duplaChofer &&
              enganchadorDeDupla(d) === asignacion!.duplaEnganchador
          );
          setEditDuplaId(matchesCatalog ? asignacion.duplaId : DUPLA_MANUAL);
        }

        if (!esCambioGrua && asignacion) {
          setEditTipoFlota(normalizeTipoFlota(asignacion.tipoFlota));
          setEditGruaPatente(asignacion.gruaPatente);
        }

        if (esCambioGrua && datos.gruaActualPatente) {
          setGruaOosPatente(datos.gruaActualPatente);
        }
      } catch (err) {
        if (!cancelled) setError("Error cargando datos. Intentá de nuevo.");
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const gruasOosFiltradas = useMemo(
    () =>
      esCambioGrua
        ? gruas.filter((g) => normalizeTipoFlota(g.tipo) === tipoFlotaOrigen)
        : [],
    [gruas, esCambioGrua, tipoFlotaOrigen]
  );

  const gruasOosOptions = useMemo(
    () => [
      { value: "", label: "Ninguna / no aplica" },
      ...gruasOosFiltradas.map((g) => ({
        value: g.patente,
        label: `${g.descripcion?.trim() ? `${g.descripcion.trim()} — ` : ""}${g.patente}`,
      })),
    ],
    [gruasOosFiltradas]
  );

  const gruasFiltradas = useMemo(
    () => gruas.filter((g) => g.activa && normalizeTipoFlota(g.tipo) === editTipoFlota),
    [gruas, editTipoFlota]
  );

  const duplasFiltradas = useMemo(
    () => duplas.filter((d) => normalizeTipoFlota(d.tipo) === editTipoFlota),
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

  const handleAprobar = async () => {
    if (!editGruaPatente.trim() || !editChofer.trim() || !editEnganchador.trim()) {
      setError("Completá grúa, chofer y enganchador.");
      return;
    }

    const operadorUid = datos.operadorUid;
    if (!operadorUid) {
      setError("No se pudo identificar al operador.");
      return;
    }

    if (esCambioGrua) {
      if (deshabilitarGrua && !gruaOosPatente.trim()) {
        setError("Indicá qué grúa quedó fuera de servicio para deshabilitarla.");
        return;
      }
      if (gruaOosPatente.trim() && !categoriaOos) {
        setError("Indicá la categoría de fuera de servicio.");
        return;
      }
      if (categoriaOos === "OTRO" && !motivoAdmin.trim()) {
        setError('Indicá el motivo cuando la categoría es "Otro".');
        return;
      }
    }

    setSaving(true);
    setError(null);

    const duplaId = editDuplaId === DUPLA_MANUAL ? "" : editDuplaId;
    const duplaCatalogo =
      editDuplaId !== DUPLA_MANUAL
        ? duplasFiltradas.find((d) => d.id === editDuplaId)
        : undefined;
    const legajoChofer = duplaCatalogo?.legajoChofer;
    const legajoEnganchador = duplaCatalogo?.legajoEnganchador;

    const gruaDesc = gruasFiltradas.find(
      (g) => g.patente === editGruaPatente.trim()
    )?.descripcion;

    const asignacion: AsignacionDiaria = {
      ...(operadorAsignacion ?? {}),
      fecha: fechaHoyArgentina(),
      gruaPatente: editGruaPatente.trim(),
      ...(gruaDesc ? { gruaDescripcion: gruaDesc } : {}),
      duplaId,
      duplaChofer: editChofer.trim(),
      duplaEnganchador: editEnganchador.trim(),
      tipoFlota: editTipoFlota,
      inicioEn: operadorAsignacion?.inicioEn ?? new Date().toISOString(),
    } as AsignacionDiaria;

    if (legajoChofer) asignacion.legajoChofer = legajoChofer;
    else delete asignacion.legajoChofer;
    if (legajoEnganchador) asignacion.legajoEnganchador = legajoEnganchador;
    else delete asignacion.legajoEnganchador;

    try {
      await asignarTurnoOperador({
        operadorUid,
        asignacionDiaria: asignacion,
        notificacionId: notificacion.id,
        ...(esCambioGrua
          ? {
              gestionCrossTipo: {
                ...(gruaOosPatente.trim() ? { gruaFueraDeServicioPatente: gruaOosPatente.trim() } : {}),
                ...(categoriaOos ? { categoriaFueraDeServicio: categoriaOos } : {}),
                ...(motivoAdmin.trim() ? { motivoCambio: motivoAdmin.trim() } : {}),
                ...(deshabilitarGrua ? { deshabilitarGrua: true } : {}),
                tipoFlotaOrigen,
              },
            }
          : {}),
      });
      setSuccess(true);
      setTimeout(() => onResolved(), 1200);
    } catch (err) {
      console.error(err);
      setError("No se pudo asignar el turno. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg max-h-[95vh] rounded-2xl shadow-2xl border border-gray-100 flex flex-col my-auto">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 bg-brand-bg rounded-t-2xl shrink-0">
          <div>
            <span className="text-[10px] font-mono font-bold text-brand-cta uppercase tracking-widest leading-none">
              {esCambioGrua ? "Solicitud de cambio de grúa" : "Solicitud de reconfiguración"}
            </span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">
                {datos.operadorNombre ?? "Operador"}
              </h2>
              {datos.operadorLegajo && (
                <span className="text-[10px] font-mono text-brand-pale">
                  Leg. {datos.operadorLegajo}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-brand-seashell text-gray-400 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 p-5 overflow-y-auto space-y-4 text-sm">
          {success && (
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              Turno asignado correctamente. El operador recibirá la notificación.
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Detalle de la solicitud */}
          {esCambioGrua ? (
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/50 space-y-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                Cambio solicitado
              </p>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1 p-2.5 rounded-lg bg-white border border-gray-200 text-center">
                  <span className="block text-[10px] text-gray-400 mb-0.5">Actual</span>
                  <span className="font-bold text-gray-900 uppercase block">{datos.gruaActualPatente ?? "—"}</span>
                  <span className={`text-[10px] font-bold ${normalizeTipoFlota(datos.tipoFlotaActual) === "TRANSPORTE" ? "text-blue-600" : "text-amber-600"}`}>
                    {labelTipoFlota(datos.tipoFlotaActual)}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1 p-2.5 rounded-lg bg-white border border-amber-300 text-center">
                  <span className="block text-[10px] text-gray-400 mb-0.5">Solicitada</span>
                  <span className="font-bold text-gray-900 uppercase block">{datos.gruaSolicitadaPatente ?? "—"}</span>
                  <span className={`text-[10px] font-bold ${normalizeTipoFlota(datos.tipoFlotaSolicitado) === "TRANSPORTE" ? "text-blue-600" : "text-amber-600"}`}>
                    {labelTipoFlota(datos.tipoFlotaSolicitado)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/50 space-y-2">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                Solicitud de reconfiguración
              </p>
              {datos.gruaPatente && (
                <p className="text-xs text-blue-700">
                  Turno actual: grúa <span className="font-bold uppercase">{datos.gruaPatente}</span>
                  {datos.duplaChofer && ` — ${datos.duplaChofer} + ${datos.duplaEnganchador}`}
                </p>
              )}
              {datos.mensaje && (
                <div className="flex items-start gap-2 text-xs text-blue-800">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p className="italic">&ldquo;{datos.mensaje}&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-brand-pale text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando catálogo...
            </div>
          ) : !success && (
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-gray-500">
                Configurá el turno y aprobá la solicitud:
              </p>

              {/* Tipo de operación */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Tipo de operación
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPO_FLOTA_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditTipoFlota(opt.value);
                        setEditGruaPatente("");
                        setEditDuplaId(DUPLA_MANUAL);
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
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

              {/* Grúa */}
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
                  disabled={saving || gruasFiltradas.length === 0}
                />
              </div>

              {/* Dupla */}
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
                  disabled={saving}
                />
              </div>

              {/* Chofer / Enganchador manual */}
              {editDuplaId === DUPLA_MANUAL && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Chofer
                    </label>
                    <input
                      type="text"
                      value={editChofer}
                      onChange={(e) => setEditChofer(e.target.value)}
                      disabled={saving}
                      placeholder="Nombre chofer"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-brand-seashell bg-white focus:outline-none focus:ring-2 focus:ring-brand-cta/25"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Enganchador
                    </label>
                    <input
                      type="text"
                      value={editEnganchador}
                      onChange={(e) => setEditEnganchador(e.target.value)}
                      disabled={saving}
                      placeholder="Nombre enganchador"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-brand-seashell bg-white focus:outline-none focus:ring-2 focus:ring-brand-cta/25"
                    />
                  </div>
                </div>
              )}

              {esCambioGrua && (
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/80 space-y-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Cierre operativo
                  </p>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Grúa fuera de servicio (opcional)
                    </label>
                    <CustomSelect
                      value={gruaOosPatente}
                      onChange={setGruaOosPatente}
                      options={gruasOosOptions}
                      placeholder="¿Qué grúa dejó de estar disponible?"
                      icon={Truck}
                      ariaLabel="Grúa fuera de servicio"
                      disabled={saving}
                    />
                    <p className="text-[10px] text-gray-400">
                      Solo grúas de {labelTipoFlota(tipoFlotaOrigen)} (operación que dejó el operador).
                    </p>
                  </div>

                  {gruaOosPatente.trim() && (
                    <>
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Categoría
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {MOTIVO_FUERA_DE_SERVICIO_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={saving}
                              onClick={() => setCategoriaOos(opt.value)}
                              className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                                categoriaOos === opt.value
                                  ? "bg-brand-cta text-white border-brand-cta"
                                  : "bg-white text-brand-purply border-brand-seashell hover:border-brand-cta/50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Motivo {categoriaOos === "OTRO" ? "(obligatorio)" : "(opcional)"}
                        </label>
                        <textarea
                          value={motivoAdmin}
                          onChange={(e) => setMotivoAdmin(e.target.value.slice(0, 300))}
                          disabled={saving}
                          rows={2}
                          placeholder="Detalle del motivo…"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-brand-seashell bg-white focus:outline-none focus:ring-2 focus:ring-brand-cta/25 resize-none"
                        />
                      </div>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deshabilitarGrua}
                          onChange={(e) => setDeshabilitarGrua(e.target.checked)}
                          disabled={saving}
                          className="mt-0.5 rounded border-gray-300 text-brand-cta focus:ring-brand-cta"
                        />
                        <span className="text-xs text-gray-700">
                          Marcar grúa fuera de servicio como <strong>inactiva en flota</strong> hasta reactivarla
                          desde Configuración → Grúas.
                        </span>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && !loading && (
          <div className="px-5 py-4 bg-brand-bg border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-bold border border-brand-seashell rounded-xl hover:bg-white cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAprobar}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-60 cursor-pointer transition-colors flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Asignando...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {esCambioGrua ? "Confirmar cambio" : "Aprobar y asignar turno"}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GestionSolicitudModal;
