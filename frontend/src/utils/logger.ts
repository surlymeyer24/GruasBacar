export type LogLevel = "error" | "warn" | "info";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  tag: string;
  message: string;
  stack?: string;
  route: string;
}

type Listener = () => void;
type ErrorReporter = (entry: LogEntry) => void | Promise<void>;

const STORAGE_KEY = "gruasbacar_debug_log_v1";
const MAX_ENTRIES = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2_000;

let entries: LogEntry[] = loadEntries();
let reporter: ErrorReporter | null = null;
const listeners = new Set<Listener>();

function redact(value: string, maxLength: number): string {
  return value
    .replace(/(api[_-]?key|token|authorization|password|secret)=([^&\s]+)/gi, "$1=[REDACTADO]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTADO]")
    .slice(0, maxLength);
}

function normalizeTag(tag: string): string {
  const clean = tag.trim().replace(/^\[|\]$/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
  return (clean || "app").slice(0, 40).toLowerCase();
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return redact(window.location.hash.replace(/^#/, "") || "/", 200);
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorDetails(error: unknown): { message?: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; stack?: unknown };
    return {
      message: typeof candidate.message === "string" ? candidate.message : undefined,
      stack: typeof candidate.stack === "string" ? candidate.stack : undefined,
    };
  }
  return {};
}

function loadEntries(): LogEntry[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is LogEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as LogEntry).id === "string" &&
        typeof (entry as LogEntry).timestamp === "number"
      )
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // El log en memoria sigue disponible aunque el storage esté lleno.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function add(level: LogLevel, tag: string, message: string, error?: unknown): LogEntry {
  const details = errorDetails(error);
  const baseMessage = message.trim() || details.message || "Error sin mensaje";
  const fullMessage =
    details.message && details.message !== baseMessage
      ? `${baseMessage}: ${details.message}`
      : baseMessage;
  const entry: LogEntry = {
    id: makeId(),
    timestamp: Date.now(),
    level,
    tag: normalizeTag(tag),
    message: redact(fullMessage, MAX_MESSAGE_LENGTH),
    stack: details.stack ? redact(details.stack, MAX_STACK_LENGTH) : undefined,
    route: currentRoute(),
  };

  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  persist();
  emit();

  const prefix = `[${entry.tag}]`;
  if (level === "error") {
    console.error(prefix, message, error ?? "");
    if (reporter) void Promise.resolve(reporter(entry)).catch(() => {});
  } else if (level === "warn") {
    console.warn(prefix, message, error ?? "");
  } else {
    console.info(prefix, message);
  }
  return entry;
}

export const logger = {
  error(tag: string, message: string, error?: unknown): LogEntry {
    return add("error", tag, message, error);
  },
  warn(tag: string, message: string, error?: unknown): LogEntry {
    return add("warn", tag, message, error);
  },
  info(tag: string, message: string): LogEntry {
    return add("info", tag, message);
  },
  getEntries(): LogEntry[] {
    return entries;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  clear(): void {
    entries = [];
    persist();
    emit();
  },
  setErrorReporter(nextReporter: ErrorReporter | null): void {
    reporter = nextReporter;
  },
  exportText(): string {
    if (entries.length === 0) return "Sin eventos registrados en esta sesión.";
    return entries
      .map((entry) => {
        const header = `${new Date(entry.timestamp).toISOString()} ${entry.level.toUpperCase()} [${entry.tag}] ${entry.route}`;
        return `${header}\n${entry.message}${entry.stack ? `\n${entry.stack}` : ""}`;
      })
      .join("\n\n");
  },
};

export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    logger.error("global", event.message || "Error JavaScript no manejado", event.error);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    logger.error("promise", "Promesa rechazada sin manejar", reason);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
