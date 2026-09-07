import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Calendar,
  Truck,
  Users,
  Loader2,
  ChevronDown,
  Shield,
  User,
  FileText,
  Car,
  X,
  Clock,
} from "lucide-react";
import { DateRangePicker } from "../shared/DateRangePicker";
import { CustomSelect } from "../shared/CustomSelect";
import type { RegistroTurno, Servicio, EstadoServicio } from "@gruasbacar/shared";
import { labelTipoFlota, enganchadorDeDuplaServicio, displayPatente } from "@gruasbacar/shared";
import {
  consultarTurnos,
  TurnosFiltros,
  TurnosPage,
} from "../../services/turno.service";
import { ensureAdminServicios } from "../../services/adminServicios.cache";
import { fechaDiaServicio } from "../../utils/formatters";
import type { GruaDoc } from "../../services/adminCatalog.cache";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

function fechaHoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatFechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatFechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatHoraISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHoraFirestore(value: unknown): string {
  if (!value) return "—";
  let d: Date | null = null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    d = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === "string") {
    d = new Date(value);
  }
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ESTADO_BADGE: Record<EstadoServicio, { label: string; cls: string }> = {
  ENGANCHADO: { label: "Enganchado", cls: "bg-amber-50 text-amber-700" },
  EN_TRASLADO: { label: "En traslado", cls: "bg-blue-50 text-blue-700" },
  DESENGANCHADO: { label: "Entregado", cls: "bg-green-50 text-green-700" },
  ANULADO: { label: "Anulado", cls: "bg-red-50 text-red-700" },
};

function nombresCoinciden(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function serviciosDelTurno(
  servicios: Servicio[],
  turno: RegistroTurno & { id: string },
): Servicio[] {
  return servicios.filter((s) => {
    const dia = fechaDiaServicio(s);
    if (dia !== turno.fecha) return false;
    const chofer = s.dupla?.chofer?.trim() ?? "";
    const eng = (enganchadorDeDuplaServicio(s.dupla) ?? "").trim();
    return nombresCoinciden(chofer, turno.duplaChofer) && nombresCoinciden(eng, turno.duplaEnganchador);
  });
}

type TurnoConId = RegistroTurno & { id: string };

interface AdminTurnosHistorialPanelProps {
  gruas: GruaDoc[];
}

function resolverGruaLabel(patente: string | undefined, descripcion: string | undefined, gruas: GruaDoc[]): { desc: string; pat: string } {
  const pat = patente || "—";
  if (descripcion?.trim()) return { desc: descripcion.trim(), pat };
  const grua = gruas.find((g) => g.patente === patente);
  return { desc: grua?.descripcion?.trim() || "", pat };
}

const AdminTurnosHistorialPanel: React.FC<AdminTurnosHistorialPanelProps> = ({ gruas }) => {
  const hoy = fechaHoyArgentina();
  const mesInicio = hoy.slice(0, 8) + "01";

  const [fechaDesde, setFechaDesde] = useState(mesInicio);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [busqueda, setBusqueda] = useState("");
  const [gruaFilter, setGruaFilter] = useState("");

  const [turnos, setTurnos] = useState<TurnoConId[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [buscado, setBuscado] = useState(false);

  const [selectedTurno, setSelectedTurno] = useState<TurnoConId | null>(null);
  const [allServicios, setAllServicios] = useState<Servicio[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);

  const gruaOptions = [
    { value: "", label: "Todas las grúas" },
    ...gruas
      .filter((g) => g.activa !== false)
      .map((g) => ({
        value: g.patente,
        label: g.descripcion ? `${g.descripcion} — ${g.patente}` : g.patente,
      })),
  ];

  const buildFiltros = useCallback((): TurnosFiltros => ({
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
    operadorNombre: busqueda.trim() || undefined,
    gruaPatente: gruaFilter || undefined,
  }), [fechaDesde, fechaHasta, busqueda, gruaFilter]);

  const buscar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: TurnosPage = await consultarTurnos(buildFiltros());
      setTurnos(result.turnos);
      setCursor(result.lastDoc);
      setHayMas(result.hayMas);
      setBuscado(true);
    } catch (err: any) {
      console.error("Error consultando historial de turnos:", err);
      setError(
        err?.message?.includes("index")
          ? "Se necesita un índice en Firestore. Revisá la consola del navegador para el link de creación."
          : "Error al consultar el historial de turnos.",
      );
    } finally {
      setLoading(false);
    }
  }, [buildFiltros]);

  const cargarMas = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const result = await consultarTurnos(buildFiltros(), cursor);
      setTurnos((prev) => [...prev, ...result.turnos]);
      setCursor(result.lastDoc);
      setHayMas(result.hayMas);
    } catch (err: any) {
      console.error("Error cargando más turnos:", err);
    } finally {
      setLoading(false);
    }
  }, [cursor, buildFiltros]);

  useEffect(() => {
    buscar();
  }, []);

  const abrirDetalle = useCallback(async (turno: TurnoConId) => {
    setSelectedTurno(turno);
    if (allServicios.length === 0) {
      setLoadingServicios(true);
      try {
        const data = await ensureAdminServicios("full");
        setAllServicios(data.servicios);
      } catch (err) {
        console.error("Error cargando servicios:", err);
      } finally {
        setLoadingServicios(false);
      }
    }
  }, [allServicios.length]);

  const serviciosDelTurnoSeleccionado = useMemo(() => {
    if (!selectedTurno || allServicios.length === 0) return [];
    return serviciosDelTurno(allServicios, selectedTurno);
  }, [selectedTurno, allServicios]);

  const handleDateChange = (from: string, to: string) => {
    setFechaDesde(from);
    setFechaHasta(to);
  };

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
        <DateRangePicker
          from={fechaDesde}
          to={fechaHasta}
          onChange={handleDateChange}
          className="w-full sm:w-56 shrink-0"
          ariaLabel="Rango de fechas del historial"
        />

        <div className="relative w-full sm:w-52">
          <Search className="w-3.5 h-3.5 text-brand-pale absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Buscar chofer o enganchador..."
            className="w-full pl-8 pr-3 py-2 bg-brand-bg border border-brand-seashell rounded-xl text-[13px] leading-tight text-brand-purply placeholder:text-brand-pale focus:outline-none focus:border-brand-cta/40 focus:ring-2 focus:ring-brand-cta/25 transition-all"
          />
        </div>

        <CustomSelect
          value={gruaFilter}
          onChange={setGruaFilter}
          options={gruaOptions}
          icon={Truck}
          ariaLabel="Filtrar por grúa"
          className="w-full sm:w-52"
          size="filter"
        />

        <button
          type="button"
          onClick={buscar}
          disabled={loading}
          className="px-4 py-2 text-sm font-semibold text-white bg-brand-cta rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {buscado && turnos.length === 0 && !loading && (
        <div className="text-center py-12 text-brand-pale text-sm">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No se encontraron turnos con los filtros aplicados.
        </div>
      )}

      {turnos.length > 0 && (
        <>
          <p className="text-xs text-brand-pale">
            {turnos.length} turno{turnos.length !== 1 ? "s" : ""} encontrado{turnos.length !== 1 ? "s" : ""}
            {hayMas ? " (hay más)" : ""}
          </p>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-2">
            {turnos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => abrirDetalle(t)}
                className="w-full text-left bg-white border border-brand-seashell rounded-xl p-3 space-y-1.5 cursor-pointer hover:border-brand-pale/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-purply">{formatFechaCorta(t.fecha)}</span>
                  <span className="text-[10px] text-brand-pale">{formatHoraISO(t.creadoEn)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-brand-purply">
                  <Users className="w-3.5 h-3.5 text-brand-pale shrink-0" />
                  <span className="font-medium">{t.duplaChofer}</span>
                  <span className="text-brand-pale">/</span>
                  <span className="font-medium">{t.duplaEnganchador}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-brand-pale">
                  <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{resolverGruaLabel(t.gruaPatente, t.gruaDescripcion, gruas).desc || t.gruaPatente}</span>
                  <span className="bg-brand-bg px-1.5 py-0.5 rounded text-[10px] font-medium">{labelTipoFlota(t.tipoFlota)}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-brand-pale">
                  {t.origenAsignacion === "admin" ? (
                    <><Shield className="w-3 h-3" />Admin{t.asignadoPorNombre ? `: ${t.asignadoPorNombre}` : ""}</>
                  ) : (
                    <><User className="w-3 h-3" />{t.operadorNombre}</>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-brand-seashell text-left text-xs text-brand-pale font-semibold">
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Chofer</th>
                  <th className="py-2 px-2">Enganchador</th>
                  <th className="py-2 px-2">Grúa</th>
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2">Origen</th>
                  <th className="py-2 px-2">Hora</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => abrirDetalle(t)}
                    className="border-b border-brand-seashell/60 hover:bg-brand-bg/50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-2 font-medium text-brand-purply whitespace-nowrap">{formatFechaCorta(t.fecha)}</td>
                    <td className="py-2.5 px-2 text-brand-purply">{t.duplaChofer}</td>
                    <td className="py-2.5 px-2 text-brand-purply">{t.duplaEnganchador}</td>
                    <td className="py-2.5 px-2 text-brand-purply whitespace-nowrap">
                      {(() => { const g = resolverGruaLabel(t.gruaPatente, t.gruaDescripcion, gruas); return g.desc ? `${g.desc} — ${g.pat}` : g.pat; })()}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="bg-brand-bg px-2 py-0.5 rounded-lg text-xs font-medium text-brand-purply">{labelTipoFlota(t.tipoFlota)}</span>
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      <span className="flex items-center gap-1 text-brand-pale">
                        {t.origenAsignacion === "admin" ? (
                          <><Shield className="w-3 h-3" />{t.asignadoPorNombre || "Admin"}</>
                        ) : (
                          <><User className="w-3 h-3" />Operador</>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-brand-pale text-xs whitespace-nowrap">{formatHoraISO(t.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hayMas && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={cargarMas}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-cta border border-brand-cta/30 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Cargar más
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal detalle turno */}
      {selectedTurno && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTurno(null)} aria-hidden />
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl z-10 border border-brand-seashell overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-brand-seashell/50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-brand-purply tracking-tight capitalize">
                    {formatFechaLarga(selectedTurno.fecha)}
                  </h3>
                  <p className="text-xs text-brand-pale mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Turno iniciado a las {formatHoraISO(selectedTurno.creadoEn)}
                    {selectedTurno.origenAsignacion === "admin" && (
                      <span className="ml-1">
                        — asignado por <span className="font-medium">{selectedTurno.asignadoPorNombre || "Admin"}</span>
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTurno(null)}
                  className="p-1.5 rounded-lg text-brand-pale hover:bg-brand-bg transition-colors cursor-pointer"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Datos del turno */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-bg/60 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-brand-pale uppercase tracking-wider mb-1">Chofer</p>
                  <p className="text-sm font-bold text-brand-purply">{selectedTurno.duplaChofer}</p>
                  {selectedTurno.legajoChofer && (
                    <p className="text-[11px] text-brand-pale">Legajo {selectedTurno.legajoChofer}</p>
                  )}
                </div>
                <div className="bg-brand-bg/60 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-brand-pale uppercase tracking-wider mb-1">Enganchador</p>
                  <p className="text-sm font-bold text-brand-purply">{selectedTurno.duplaEnganchador}</p>
                  {selectedTurno.legajoEnganchador && (
                    <p className="text-[11px] text-brand-pale">Legajo {selectedTurno.legajoEnganchador}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-brand-purply">
                  <Truck className="w-4 h-4 text-brand-pale" />
                  <span className="font-medium">
                    {(() => { const g = resolverGruaLabel(selectedTurno.gruaPatente, selectedTurno.gruaDescripcion, gruas); return g.desc ? `${g.desc} — ${g.pat}` : g.pat; })()}
                  </span>
                </div>
                <span className="bg-brand-bg px-2 py-0.5 rounded-lg text-xs font-medium text-brand-purply">
                  {labelTipoFlota(selectedTurno.tipoFlota)}
                </span>
              </div>

              {/* Servicios */}
              <div className="pt-2 border-t border-brand-seashell/50">
                <p className="text-[10px] font-semibold text-brand-pale uppercase tracking-wider mb-2">
                  Servicios realizados
                </p>

                {loadingServicios ? (
                  <div className="py-4 flex items-center justify-center gap-2 text-xs text-brand-pale">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Cargando servicios...
                  </div>
                ) : serviciosDelTurnoSeleccionado.length === 0 ? (
                  <div className="py-4 text-center text-xs text-brand-pale">
                    <Car className="w-6 h-6 mx-auto mb-1 opacity-30" />
                    Sin servicios registrados en este turno.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {serviciosDelTurnoSeleccionado.map((s) => {
                      const badge = ESTADO_BADGE[s.estado] ?? { label: s.estado, cls: "bg-gray-50 text-gray-600" };
                      return (
                        <div key={s.id} className="flex items-center gap-3 bg-brand-bg/50 rounded-xl px-3 py-2.5 text-xs">
                          <Car className="w-4 h-4 text-brand-pale shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-brand-purply">{displayPatente(s.patente)}</span>
                            {s.descripcionVehiculo && (
                              <span className="text-brand-pale ml-1.5">{s.descripcionVehiculo}</span>
                            )}
                          </div>
                          {s.numeroInfraccion && (
                            <span className="flex items-center gap-1 text-brand-pale shrink-0">
                              <FileText className="w-3 h-3" />
                              {s.numeroInfraccion}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <span className="text-brand-pale shrink-0">{formatHoraFirestore(s.creadoEn ?? s.fechaCreacion)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setSelectedTurno(null)}
                className="w-full py-2.5 bg-brand-bg text-brand-purply border border-brand-seashell hover:bg-gray-100 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTurnosHistorialPanel;
