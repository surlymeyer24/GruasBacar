import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Bug,
  Clipboard,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import {
  ClientErrorIncident,
  DebugEnvironment,
  listClientErrorIncidents,
} from "../services/debugLog.service";
import { LogLevel, logger } from "../utils/logger";

type ViewMode = "remote" | "session";
type DateRange = "24h" | "7d" | "14d";

const DATE_RANGE_MS: Record<DateRange, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "14d": 14 * 24 * 60 * 60 * 1_000,
};

function formatDate(timestamp: number): string {
  if (!timestamp) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}

function remoteReportText(incidents: ClientErrorIncident[]): string {
  if (incidents.length === 0) return "Sin incidentes para los filtros seleccionados.";
  return incidents
    .map((incident) => [
      `${formatDate(incident.lastSeen)} ERROR [${incident.tag}] ${incident.lastRoute}`,
      `${incident.message} (ocurrencias: ${incident.count})`,
      `Entorno: ${incident.environment} | Usuario: ${incident.lastUserName} (${incident.lastUid})`,
      incident.lastStack,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export default function DebugLogPage() {
  const [view, setView] = useState<ViewMode>("remote");
  const [incidents, setIncidents] = useState<ClientErrorIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState<DebugEnvironment | "all">("all");
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const sessionEntries = useSyncExternalStore(logger.subscribe, logger.getEntries);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIncidents(await listClientErrorIncidents());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los incidentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredIncidents = useMemo(() => {
    const cutoff = Date.now() - DATE_RANGE_MS[dateRange];
    const tag = tagFilter.trim().toLowerCase();
    return incidents.filter((incident) =>
      incident.lastSeen >= cutoff &&
      (environmentFilter === "all" || incident.environment === environmentFilter) &&
      (!tag || incident.tag.toLowerCase().includes(tag))
    );
  }, [dateRange, environmentFilter, incidents, tagFilter]);

  const filteredSessionEntries = useMemo(() => {
    const tag = tagFilter.trim().toLowerCase();
    return sessionEntries.filter((entry) =>
      (levelFilter === "all" || entry.level === levelFilter) &&
      (!tag || entry.tag.toLowerCase().includes(tag))
    );
  }, [levelFilter, sessionEntries, tagFilter]);

  const copyVisible = async () => {
    const text = view === "remote"
      ? remoteReportText(filteredIncidents)
      : logger.exportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Reporte copiado");
    } catch {
      setCopyStatus("No se pudo copiar");
    }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bug className="w-6 h-6 text-brand-cta" />
              <h1 className="text-2xl font-extrabold text-brand-purply">Diagnóstico</h1>
            </div>
            <p className="mt-1 text-sm text-brand-pale">
              Incidentes agregados del frontend. Retención: 14 días.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyVisible}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-seashell bg-white px-4 py-2 text-sm font-bold text-brand-purply cursor-pointer"
            >
              <Clipboard className="w-4 h-4" />
              Copiar
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-cta px-4 py-2 text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>

        {copyStatus && <p className="text-xs font-semibold text-brand-pale" role="status">{copyStatus}</p>}

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 border border-brand-seashell">
          <button
            type="button"
            onClick={() => setView("remote")}
            className={`flex-1 min-h-11 rounded-xl px-3 text-sm font-bold cursor-pointer ${
              view === "remote" ? "bg-brand-purply text-white" : "text-brand-pale"
            }`}
          >
            Toda la flota ({incidents.length})
          </button>
          <button
            type="button"
            onClick={() => setView("session")}
            className={`flex-1 min-h-11 rounded-xl px-3 text-sm font-bold cursor-pointer ${
              view === "session" ? "bg-brand-purply text-white" : "text-brand-pale"
            }`}
          >
            Esta sesión ({sessionEntries.length})
          </button>
        </div>

        <div className="grid gap-3 rounded-2xl border border-brand-seashell bg-white p-4 sm:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wide text-brand-pale">
            Tag
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="auth, fotos, servicio..."
              className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm font-normal normal-case tracking-normal text-brand-purply outline-none focus:border-brand-cta"
            />
          </label>
          {view === "remote" ? (
            <>
              <label className="text-xs font-bold uppercase tracking-wide text-brand-pale">
                Entorno
                <select
                  value={environmentFilter}
                  onChange={(event) => setEnvironmentFilter(event.target.value as DebugEnvironment | "all")}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal normal-case text-brand-purply"
                >
                  <option value="all">Todos</option>
                  <option value="production">Producción</option>
                  <option value="test">Test</option>
                  <option value="emulator">Emulador</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-brand-pale">
                Período
                <select
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value as DateRange)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal normal-case text-brand-purply"
                >
                  <option value="24h">Últimas 24 horas</option>
                  <option value="7d">Últimos 7 días</option>
                  <option value="14d">Últimos 14 días</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="text-xs font-bold uppercase tracking-wide text-brand-pale">
                Nivel
                <select
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value as LogLevel | "all")}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal normal-case text-brand-purply"
                >
                  <option value="all">Todos</option>
                  <option value="error">Errores</option>
                  <option value="warn">Advertencias</option>
                  <option value="info">Información</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => logger.clear()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar sesión
                </button>
              </div>
            </>
          )}
        </div>

        {view === "remote" && loading ? (
          <LoadingSpinner message="Cargando incidentes..." />
        ) : error && view === "remote" ? (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        ) : view === "remote" ? (
          <div className="space-y-3">
            {filteredIncidents.map((incident) => (
              <article key={incident.id} className="rounded-2xl border border-brand-seashell bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-extrabold uppercase text-red-700">
                        {incident.tag}
                      </span>
                      <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                        {incident.environment}
                      </span>
                      <span className="text-xs font-bold text-brand-pale">×{incident.count}</span>
                    </div>
                    <p className="mt-2 break-words text-sm font-bold text-brand-purply">{incident.message}</p>
                  </div>
                  <time className="text-xs text-brand-pale">{formatDate(incident.lastSeen)}</time>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-pale">
                  <span>{incident.lastUserName || incident.lastUid}</span>
                  <span>{incident.lastRoute || "/"}</span>
                  <span className="inline-flex items-center gap-1">
                    {incident.lastContext?.online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    {incident.lastContext?.online ? "Con conexión" : "Sin conexión"}
                  </span>
                </div>
                {incident.lastStack && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold text-brand-cta">Ver stack trace</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">
                      {incident.lastStack}
                    </pre>
                  </details>
                )}
              </article>
            ))}
            {filteredIncidents.length === 0 && (
              <p className="rounded-2xl border border-dashed border-brand-seashell p-8 text-center text-sm text-brand-pale">
                No hay incidentes para los filtros seleccionados.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {[...filteredSessionEntries].reverse().map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-brand-seashell bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2 py-1 text-xs font-extrabold uppercase ${
                    entry.level === "error" ? "bg-red-50 text-red-700" :
                    entry.level === "warn" ? "bg-amber-50 text-amber-700" :
                    "bg-blue-50 text-blue-700"
                  }`}>
                    {entry.level}
                  </span>
                  <span className="text-xs font-bold text-brand-pale">[{entry.tag}]</span>
                  <time className="ml-auto text-xs text-brand-pale">{formatDate(entry.timestamp)}</time>
                </div>
                <p className="mt-2 break-words text-sm text-brand-purply">{entry.message}</p>
                {entry.stack && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">{entry.stack}</pre>}
              </article>
            ))}
            {filteredSessionEntries.length === 0 && (
              <p className="rounded-2xl border border-dashed border-brand-seashell p-8 text-center text-sm text-brand-pale">
                No hay eventos en esta sesión.
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
