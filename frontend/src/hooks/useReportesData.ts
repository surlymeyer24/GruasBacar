import { useEffect, useMemo, useState } from "react";
import {
  Servicio,
  Grua,
  TIPO_FLOTA_FILTER_OPTIONS,
  resumenDuracionActa,
  formatDuracion,
  labelTipoFlota,
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
import { resolverPatenteGrua, tipoFlotaDeServicio } from "../utils/gruaDisplay";
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
  porInspector: { inspector: string; actas: number; promedioHoras: number | null }[];
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
    const porInspectorMap = new Map<string, { count: number; totalMs: number; withMs: number }>();

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

      const gruaLabel = resolverPatenteGrua(s.grua, gruasCatalog);
      porGruaMap.set(gruaLabel, (porGruaMap.get(gruaLabel) ?? 0) + 1);

      const tipoLabel = labelTipoFlota(tipoFlotaDeServicio(s, gruasCatalog));
      porTipoMap.set(tipoLabel, (porTipoMap.get(tipoLabel) ?? 0) + 1);

      const inspector = s.dupla?.inspector?.trim() || "Sin inspector";
      const inspEntry = porInspectorMap.get(inspector) ?? { count: 0, totalMs: 0, withMs: 0 };
      inspEntry.count += 1;
      const dur = resumenDuracionActa(s)?.duracionMs;
      if (dur !== null && dur !== undefined) {
        inspEntry.totalMs += dur;
        inspEntry.withMs += 1;
      }
      porInspectorMap.set(inspector, inspEntry);
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

    const porInspector = [...porInspectorMap.entries()]
      .map(([inspector, v]) => ({
        inspector,
        actas: v.count,
        promedioHoras:
          v.withMs > 0 ? Math.round((v.totalMs / v.withMs / (1000 * 60 * 60)) * 10) / 10 : null,
      }))
      .sort((a, b) => b.actas - a.actas)
      .slice(0, 10);

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
        grua: resolverPatenteGrua(s.grua, gruasCatalog),
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
      porInspector,
      tablaResumen,
    };
  }, [activeFiltered, gruasCatalog, corralonesCatalog]);

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
    totalServicios: services.length,
  };
}
