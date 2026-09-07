import { useEffect, useMemo, useState } from "react";
import {
  Servicio,
  Grua,
  TIPO_FLOTA_FILTER_OPTIONS,
  resumenDuracionActa,
  formatDuracion,
  duracionPorTramo,
  labelTipoFlota,
  type NombreTramo,
} from "@gruasbacar/shared";
import { CORRALONES } from "../data/mockData";
import { fechaServicio } from "../utils/formatters";
import { gruaService } from "../services/grua.service";
import { corralonService } from "../services/corralon.service";
import { ensureAdminCatalog } from "../services/adminCatalog.cache";
import {
  ensureAdminServicios,
  getAdminServiciosSnapshot,
} from "../services/adminServicios.cache";
import { resolverLabelGrua, tipoFlotaDeServicio } from "../utils/gruaDisplay";
import { nombreCorralon, CorralonCatalogo } from "../utils/corralonDisplay";
import {
  DEFAULT_REPORTES_FILTERS,
  ReportesFilterState,
  buildFilterOptions,
  duplaLabelFromKey,
  duplaKeyFromServicio,
  filtrarServiciosReportes,
} from "../utils/reportesFilters";

const ESTADO_LABELS: Record<string, string> = {
  ENGANCHADO: "Enganchado",
  EN_TRASLADO: "En traslado",
  DESENGANCHADO: "Entregado",
  ANULADO: "Anulado",
};

const TIEMPO_FILTER_OPTIONS = [
  { value: "ALL", label: "Todos los tiempos" },
  { value: "LT_1H", label: "Menos de 1 hora" },
  { value: "H1_2", label: "1 a 2 horas" },
  { value: "H2_4", label: "2 a 4 horas" },
  { value: "GT_4H", label: "Más de 4 horas" },
  { value: "EN_CURSO", label: "En curso" },
];

export interface ReportesKpis {
  total: number;
  finalizadas: number;
  enCurso: number;
  anuladas: number;
  duracionPromedioMs: number | null;
  duracionPromedioLabel: string;
}

export interface ReportesAggregations {
  porEstado: { name: string; value: number; key: string }[];
  porHora: { hora: string; actas: number }[];
  porCorralon: { name: string; actas: number }[];
  porDupla: { name: string; total: number; finalizadas: number }[];
  porGrua: { name: string; actas: number }[];
  porTipo: { name: string; actas: number }[];
  tablaResumen: {
    patente: string;
    acta: string;
    estado: string;
    dupla: string;
    corralon: string;
    grua: string;
    duracion: string;
    fecha: string;
  }[];
}

export interface TramoStats {
  tramo: NombreTramo;
  label: string;
  promedioMs: number;
  promedioLabel: string;
  desviacionMs: number;
  count: number;
}

export interface OutlierServicio {
  patente: string;
  acta: string;
  tramo: NombreTramo;
  tramoLabel: string;
  duracionMs: number;
  duracionLabel: string;
  promedioMs: number;
  desvios: number;
  dupla: string;
  grua: string;
  fecha: string;
}

export interface AnalisisTramos {
  stats: TramoStats[];
  outliers: OutlierServicio[];
  distribucion: { bucket: string; enganche: number; traslado: number; desenganche: number }[];
}

export function useReportesData() {
  const cachedServicios = getAdminServiciosSnapshot("full")?.servicios;
  const [services, setServices] = useState<Servicio[]>(cachedServicios ?? []);
  const [gruasCatalog, setGruasCatalog] = useState<Grua[]>([]);
  const [corralonesCatalog, setCorralonesCatalog] = useState<CorralonCatalogo[]>([]);
  const [loading, setLoading] = useState(!cachedServicios);
  const [filters, setFilters] = useState<ReportesFilterState>(DEFAULT_REPORTES_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportesFilterState>(DEFAULT_REPORTES_FILTERS);
  const [generated, setGenerated] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const snapshot = getAdminServiciosSnapshot("full");
      if (snapshot?.servicios) {
        setServices(snapshot.servicios);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const [gruas, corralones] = await Promise.all([
          gruaService.getAllGruas().catch(() => [] as Grua[]),
          corralonService.getAllCorralones().catch(() => [] as CorralonCatalogo[]),
        ]);

        if (!cancelled) {
          setGruasCatalog(gruas);
          setCorralonesCatalog(corralones);
        }

        try {
          const catalog = await ensureAdminCatalog();
          if (!cancelled && catalog.corralones.length > 0) {
            setCorralonesCatalog(
              catalog.corralones.map((c) => ({
                id: c.docId,
                docId: c.docId,
                nombre: c.nombre,
                direccion: c.direccion,
                activo: c.activo,
              }))
            );
          }
          if (!cancelled && catalog.gruas.length > 0) {
            setGruasCatalog(
              catalog.gruas.map((g) => ({
                id: g.docId,
                patente: g.patente,
                descripcion: g.descripcion,
                activa: g.activa,
                tipo: g.tipo,
              }))
            );
          }
        } catch {
          /* catálogo opcional */
        }

        if (!snapshot?.servicios) {
          const data = await ensureAdminServicios("full", { withPhotoCounts: false });
          if (!cancelled) setServices(data.servicios);
        }
      } catch (err) {
        console.error("Error cargando datos de reportes:", err);
        if (!cancelled && !snapshot?.servicios) setServices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filterOptions = useMemo(
    () => buildFilterOptions(services, gruasCatalog, corralonesCatalog, CORRALONES),
    [services, gruasCatalog, corralonesCatalog]
  );

  const activeFiltered = useMemo(
    () =>
      generated
        ? filtrarServiciosReportes(services, appliedFilters, gruasCatalog, corralonesCatalog)
        : [],
    [generated, services, appliedFilters, gruasCatalog, corralonesCatalog]
  );

  const kpis = useMemo((): ReportesKpis => {
    const total = activeFiltered.length;
    const finalizadas = activeFiltered.filter((s) => s.estado === "DESENGANCHADO").length;
    const enCurso = activeFiltered.filter(
      (s) => s.estado === "ENGANCHADO" || s.estado === "EN_TRASLADO"
    ).length;
    const anuladas = activeFiltered.filter((s) => s.estado === "ANULADO").length;

    const duraciones = activeFiltered
      .map((s) => resumenDuracionActa(s)?.duracionMs)
      .filter((ms): ms is number => ms !== null && ms !== undefined);

    const duracionPromedioMs =
      duraciones.length > 0
        ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length
        : null;

    return {
      total,
      finalizadas,
      enCurso,
      anuladas,
      duracionPromedioMs,
      duracionPromedioLabel:
        duracionPromedioMs !== null ? formatDuracion(duracionPromedioMs) : "—",
    };
  }, [activeFiltered]);

  const aggregations = useMemo((): ReportesAggregations => {
    const porEstadoMap = new Map<string, number>();
    const porHoraMap = new Map<number, number>();
    const porCorralonMap = new Map<string, number>();
    const porDuplaMap = new Map<string, { total: number; finalizadas: number }>();
    const porGruaMap = new Map<string, number>();
    const porTipoMap = new Map<string, number>();

    for (const s of activeFiltered) {
      porEstadoMap.set(s.estado, (porEstadoMap.get(s.estado) ?? 0) + 1);

      const fecha = fechaServicio(s);
      if (fecha) {
        const h = fecha.getHours();
        porHoraMap.set(h, (porHoraMap.get(h) ?? 0) + 1);
      }

      const corralonRaw = s.corralon?.trim();
      const corralonLabel = corralonRaw
        ? nombreCorralon(corralonRaw, corralonesCatalog, CORRALONES)
        : "Sin corralón";
      porCorralonMap.set(corralonLabel, (porCorralonMap.get(corralonLabel) ?? 0) + 1);

      const duplaKey = duplaKeyFromServicio(s);
      const duplaLabel = duplaKey ? duplaLabelFromKey(duplaKey) : "Sin dupla";
      const duplaEntry = porDuplaMap.get(duplaLabel) ?? { total: 0, finalizadas: 0 };
      duplaEntry.total += 1;
      if (s.estado === "DESENGANCHADO") duplaEntry.finalizadas += 1;
      porDuplaMap.set(duplaLabel, duplaEntry);

      const gruaLabel = resolverLabelGrua(s.grua, gruasCatalog);
      porGruaMap.set(gruaLabel, (porGruaMap.get(gruaLabel) ?? 0) + 1);

      const tipoLabel = labelTipoFlota(tipoFlotaDeServicio(s, gruasCatalog));
      porTipoMap.set(tipoLabel, (porTipoMap.get(tipoLabel) ?? 0) + 1);
    }

    const porHora = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, "0")}:00`,
      actas: porHoraMap.get(h) ?? 0,
    }));

    const topN = <T extends { actas?: number; total?: number }>(arr: T[], n: number, key: keyof T) =>
      [...arr].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).slice(0, n);

    const porCorralon = topN(
      [...porCorralonMap.entries()].map(([name, actas]) => ({ name, actas })),
      10,
      "actas"
    );

    const porDupla = topN(
      [...porDuplaMap.entries()].map(([name, v]) => ({
        name: name.length > 22 ? `${name.slice(0, 20)}…` : name,
        total: v.total,
        finalizadas: v.finalizadas,
      })),
      8,
      "total"
    );

    const porGrua = topN(
      [...porGruaMap.entries()].map(([name, actas]) => ({ name, actas })),
      10,
      "actas"
    );

    const tablaResumen = activeFiltered.slice(0, 50).map((s) => {
      const duplaKey = duplaKeyFromServicio(s);
      return {
        patente: s.patente,
        acta: s.numeroInfraccion || s.identificadorCompuesto || "—",
        estado: ESTADO_LABELS[s.estado] ?? s.estado,
        dupla: duplaKey ? duplaLabelFromKey(duplaKey) : "—",
        corralon: s.corralon
          ? nombreCorralon(s.corralon, corralonesCatalog, CORRALONES)
          : "—",
        grua: resolverLabelGrua(s.grua, gruasCatalog),
        duracion: resumenDuracionActa(s)?.etiqueta ?? "—",
        fecha: fechaServicio(s)?.toLocaleDateString("es-AR") ?? "—",
      };
    });

    return {
      porEstado: [...porEstadoMap.entries()].map(([key, value]) => ({
        key,
        name: ESTADO_LABELS[key] ?? key,
        value,
      })),
      porHora,
      porCorralon,
      porDupla,
      porGrua,
      porTipo: [...porTipoMap.entries()].map(([name, actas]) => ({ name, actas })),
      tablaResumen,
    };
  }, [activeFiltered, gruasCatalog, corralonesCatalog]);

  const analisisTramos = useMemo((): AnalisisTramos => {
    const porTramo: Record<NombreTramo, number[]> = {
      enganche: [],
      traslado: [],
      desenganche: [],
    };

    interface ServicioTramoEntry {
      servicio: Servicio;
      tramo: NombreTramo;
      tramoLabel: string;
      duracionMs: number;
    }
    const entries: ServicioTramoEntry[] = [];

    for (const s of activeFiltered) {
      if (s.estado === 'ANULADO' || !s.eventos?.length) continue;
      const res = duracionPorTramo(s.eventos);
      if (!res) continue;
      for (const t of res.tramos) {
        porTramo[t.tramo].push(t.duracionMs);
        entries.push({ servicio: s, tramo: t.tramo, tramoLabel: t.label, duracionMs: t.duracionMs });
      }
    }

    const stats: TramoStats[] = (['enganche', 'traslado', 'desenganche'] as NombreTramo[])
      .map((tramo) => {
        const vals = porTramo[tramo];
        if (vals.length === 0) return null;
        const promedio = vals.reduce((a, b) => a + b, 0) / vals.length;
        const varianza = vals.reduce((sum, v) => sum + (v - promedio) ** 2, 0) / vals.length;
        const desviacion = Math.sqrt(varianza);
        const labels: Record<NombreTramo, string> = {
          enganche: 'Enganche',
          traslado: 'Traslado',
          desenganche: 'Desenganche',
        };
        return {
          tramo,
          label: labels[tramo],
          promedioMs: promedio,
          promedioLabel: formatDuracion(promedio),
          desviacionMs: desviacion,
          count: vals.length,
        };
      })
      .filter((s): s is TramoStats => s !== null);

    const statsMap = new Map(stats.map((s) => [s.tramo, s]));

    const outliers: OutlierServicio[] = entries
      .map((e) => {
        const st = statsMap.get(e.tramo);
        if (!st || st.desviacionMs === 0) return null;
        const desvios = (e.duracionMs - st.promedioMs) / st.desviacionMs;
        if (desvios <= 1) return null;
        const duplaKey = duplaKeyFromServicio(e.servicio);
        return {
          patente: e.servicio.patente,
          acta: e.servicio.numeroInfraccion || e.servicio.identificadorCompuesto || '—',
          tramo: e.tramo,
          tramoLabel: e.tramoLabel,
          duracionMs: e.duracionMs,
          duracionLabel: formatDuracion(e.duracionMs),
          promedioMs: st.promedioMs,
          desvios: Math.round(desvios * 10) / 10,
          dupla: duplaKey ? duplaLabelFromKey(duplaKey) : '—',
          grua: resolverLabelGrua(e.servicio.grua, gruasCatalog),
          fecha: fechaServicio(e.servicio)?.toLocaleDateString('es-AR') ?? '—',
        };
      })
      .filter((o): o is OutlierServicio => o !== null)
      .sort((a, b) => b.desvios - a.desvios);

    const BUCKETS = [
      { label: '< 15 min', max: 15 * 60_000 },
      { label: '15-30 min', max: 30 * 60_000 },
      { label: '30-60 min', max: 60 * 60_000 },
      { label: '1-2 h', max: 2 * 3600_000 },
      { label: '> 2 h', max: Infinity },
    ];

    const distribucion = BUCKETS.map((b) => {
      const row: { bucket: string; enganche: number; traslado: number; desenganche: number } = {
        bucket: b.label,
        enganche: 0,
        traslado: 0,
        desenganche: 0,
      };
      return row;
    });

    for (const e of entries) {
      const idx = BUCKETS.findIndex((b, i) => {
        const min = i === 0 ? 0 : BUCKETS[i - 1].max;
        return e.duracionMs >= min && e.duracionMs < b.max;
      });
      if (idx >= 0) {
        distribucion[idx][e.tramo] += 1;
      }
    }

    return { stats, outliers, distribucion };
  }, [activeFiltered, gruasCatalog]);

  const generarReporte = () => {
    setAppliedFilters({ ...filters });
    setGenerated(true);
  };

  const limpiarFiltros = () => {
    setFilters(DEFAULT_REPORTES_FILTERS);
    setAppliedFilters(DEFAULT_REPORTES_FILTERS);
    setGenerated(true);
  };

  return {
    loading,
    filters,
    setFilters,
    filterOptions,
    tipoOptions: TIPO_FLOTA_FILTER_OPTIONS,
    tiempoOptions: TIEMPO_FILTER_OPTIONS,
    generated,
    generarReporte,
    limpiarFiltros,
    kpis,
    aggregations,
    analisisTramos,
    totalServicios: services.length,
  };
}
