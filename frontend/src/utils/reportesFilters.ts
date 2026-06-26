import {
  Servicio,
  enganchadorDeDuplaServicio,
  matchesTipoFlotaFilter,
  resumenDuracionActa,
} from "@gruasbacar/shared";
import { fechaDiaServicio } from "./formatters";
import { tipoFlotaDeServicio } from "./gruaDisplay";
import { nombreCorralon, CorralonCatalogo } from "./corralonDisplay";
import type { Grua } from "@gruasbacar/shared";

export type TiempoFilter =
  | "ALL"
  | "LT_1H"
  | "H1_2"
  | "H2_4"
  | "GT_4H"
  | "EN_CURSO";

export interface ReportesFilterState {
  dateFrom: string;
  dateTo: string;
  enganchador: string;
  chofer: string;
  dupla: string;
  tipo: string;
  inspector: string;
  corralon: string;
  tiempo: TiempoFilter;
  grua: string;
}

export const DEFAULT_REPORTES_FILTERS: ReportesFilterState = {
  dateFrom: "",
  dateTo: "",
  enganchador: "ALL",
  chofer: "ALL",
  dupla: "ALL",
  tipo: "ALL",
  inspector: "ALL",
  corralon: "ALL",
  tiempo: "ALL",
  grua: "ALL",
};

export function duplaKeyFromServicio(s: Servicio): string | null {
  const chofer = s.dupla?.chofer?.trim() ?? "";
  const enganchador = enganchadorDeDuplaServicio(s.dupla)?.trim() ?? "";
  if (!chofer && !enganchador) return null;
  return `${chofer}\0${enganchador}`;
}

export function duplaLabelFromKey(key: string): string {
  const [chofer, enganchador] = key.split("\0");
  if (chofer && enganchador) return `${chofer} + ${enganchador}`;
  return chofer || enganchador;
}

export function corralonKeysForServicio(
  corralonRaw: string | undefined,
  corralones: CorralonCatalogo[]
): string[] {
  if (!corralonRaw?.trim()) return [];
  const raw = corralonRaw.trim();
  const keys = new Set<string>([raw]);
  const found = corralones.find(
    (c) => c.id === raw || c.docId === raw || c.nombre === raw
  );
  if (found) {
    if (found.docId) keys.add(found.docId);
    keys.add(found.id);
    if (found.nombre?.trim()) keys.add(found.nombre.trim());
  }
  return [...keys];
}

function matchesTiempoFilter(servicio: Servicio, filter: TiempoFilter): boolean {
  if (filter === "ALL") return true;
  const resumen = resumenDuracionActa(servicio);
  if (!resumen) return filter === "EN_CURSO";

  if (filter === "EN_CURSO") return resumen.enCurso;

  const ms = resumen.duracionMs;
  if (ms === null) return false;

  const horas = ms / (1000 * 60 * 60);
  switch (filter) {
    case "LT_1H":
      return horas < 1;
    case "H1_2":
      return horas >= 1 && horas < 2;
    case "H2_4":
      return horas >= 2 && horas < 4;
    case "GT_4H":
      return horas >= 4;
    default:
      return true;
  }
}

export function filtrarServiciosReportes(
  services: Servicio[],
  filters: ReportesFilterState,
  gruasCatalog: Grua[],
  corralonesCatalog: CorralonCatalogo[]
): Servicio[] {
  return services.filter((s) => {
    const dia = fechaDiaServicio(s);
    const matchesDateFrom = !filters.dateFrom || (dia !== null && dia >= filters.dateFrom);
    const matchesDateTo = !filters.dateTo || (dia !== null && dia <= filters.dateTo);

    const enganchador = enganchadorDeDuplaServicio(s.dupla)?.trim() ?? "";
    const matchesEnganchador =
      filters.enganchador === "ALL" || enganchador === filters.enganchador;

    const chofer = s.dupla?.chofer?.trim() ?? "";
    const matchesChofer = filters.chofer === "ALL" || chofer === filters.chofer;

    const duplaKey = duplaKeyFromServicio(s);
    const matchesDupla =
      filters.dupla === "ALL" || (duplaKey !== null && duplaKey === filters.dupla);

    const matchesTipo = matchesTipoFlotaFilter(
      tipoFlotaDeServicio(s, gruasCatalog),
      filters.tipo
    );

    const inspector = s.dupla?.inspector?.trim() ?? "";
    const matchesInspector =
      filters.inspector === "ALL" || inspector === filters.inspector;

    const matchesCorralon =
      filters.corralon === "ALL" ||
      corralonKeysForServicio(s.corralon, corralonesCatalog).includes(filters.corralon);

    const matchesTiempo = matchesTiempoFilter(s, filters.tiempo);

    const matchesGrua =
      filters.grua === "ALL" || s.grua === filters.grua;

    return (
      matchesDateFrom &&
      matchesDateTo &&
      matchesEnganchador &&
      matchesChofer &&
      matchesDupla &&
      matchesTipo &&
      matchesInspector &&
      matchesCorralon &&
      matchesTiempo &&
      matchesGrua
    );
  });
}

export function buildFilterOptions(
  services: Servicio[],
  gruasCatalog: Grua[],
  corralonesCatalog: CorralonCatalogo[],
  corralonesFallback: CorralonCatalogo[]
) {
  const enganchadores = new Set<string>();
  const choferes = new Set<string>();
  const duplas = new Map<string, string>();
  const inspectores = new Set<string>();
  const corralones = new Map<string, string>();
  const gruas = new Map<string, string>();

  for (const s of services) {
    const eng = enganchadorDeDuplaServicio(s.dupla)?.trim();
    if (eng) enganchadores.add(eng);

    const ch = s.dupla?.chofer?.trim();
    if (ch) choferes.add(ch);

    const duplaKey = duplaKeyFromServicio(s);
    if (duplaKey) duplas.set(duplaKey, duplaLabelFromKey(duplaKey));

    const insp = s.dupla?.inspector?.trim();
    if (insp) inspectores.add(insp);

    if (s.grua?.trim()) {
      const grua = gruasCatalog.find((g) => g.id === s.grua || g.patente === s.grua);
      const label = grua?.patente?.trim() || s.grua;
      gruas.set(s.grua, label);
    }

    const raw = s.corralon?.trim();
    if (raw) {
      const found = corralonesCatalog.find(
        (c) => c.id === raw || c.docId === raw || c.nombre === raw
      );
      if (found) {
        corralones.set(found.docId ?? found.id, found.nombre);
      } else {
        corralones.set(raw, nombreCorralon(raw, corralonesCatalog, corralonesFallback));
      }
    }
  }

  for (const c of corralonesCatalog) {
    corralones.set(c.docId ?? c.id, c.nombre);
  }

  const sortOpts = (entries: [string, string][]) =>
    entries
      .sort((a, b) => a[1].localeCompare(b[1], "es"))
      .map(([value, label]) => ({ value, label }));

  return {
    enganchador: [
      { value: "ALL", label: "Todos los enganchadores" },
      ...[...enganchadores].sort((a, b) => a.localeCompare(b, "es")).map((v) => ({ value: v, label: v })),
    ],
    chofer: [
      { value: "ALL", label: "Todos los choferes" },
      ...[...choferes].sort((a, b) => a.localeCompare(b, "es")).map((v) => ({ value: v, label: v })),
    ],
    dupla: [{ value: "ALL", label: "Todas las duplas" }, ...sortOpts([...duplas.entries()])],
    inspector: [
      { value: "ALL", label: "Todos los inspectores" },
      ...[...inspectores].sort((a, b) => a.localeCompare(b, "es")).map((v) => ({ value: v, label: v })),
    ],
    corralon: [{ value: "ALL", label: "Todos los corralones" }, ...sortOpts([...corralones.entries()])],
    grua: [{ value: "ALL", label: "Todas las grúas" }, ...sortOpts([...gruas.entries()])],
  };
}
