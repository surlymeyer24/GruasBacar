import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, esEntornoTest, functions, isMock, usandoEmuladores } from "../firebase";
import { LogEntry, logger } from "../utils/logger";

interface QueuedError {
  id: string;
  createdAt: number;
  ownerUid?: string;
  tag: string;
  message: string;
  stack?: string;
  route: string;
  environment: "emulator" | "test" | "production";
  context: {
    online: boolean;
    userAgent: string;
  };
}

type ErrorReportPayload = Omit<QueuedError, "id" | "ownerUid">;

const DB_NAME = "gruasbacar_debug";
const STORE_NAME = "error_queue";
const DB_VERSION = 1;
const ACK_STORAGE_KEY = "gruasbacar_debug_reported_ids_v1";
const MAX_QUEUE_SIZE = 100;
const MAX_SEND_PER_FLUSH = 20;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;

let dbPromise: Promise<IDBDatabase> | null = null;
let flushPromise: Promise<void> | null = null;

function acknowledgedIds(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ACK_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function acknowledge(id: string): void {
  try {
    const ids = acknowledgedIds();
    sessionStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...ids, id].slice(-MAX_QUEUE_SIZE)));
  } catch {
    // Un duplicado eventual es preferible a perder el incidente.
  }
}

function environment(): QueuedError["environment"] {
  if (usandoEmuladores) return "emulator";
  return esEntornoTest ? "test" : "production";
}

function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
    });
  }
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await getDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllQueued(): Promise<QueuedError[]> {
  return withStore<QueuedError[]>("readonly", (store) => store.getAll());
}

async function getQueued(): Promise<QueuedError[]> {
  const queued = await getAllQueued();
  return queued.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeQueued(id: string): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}

async function trimQueue(): Promise<void> {
  const queued = await getQueued();
  const active = queued.filter((item) => Date.now() - item.createdAt <= RETENTION_MS);
  const expiredOrOverflow = [
    ...queued.filter((item) => Date.now() - item.createdAt > RETENTION_MS),
    ...active.slice(0, Math.max(0, active.length - MAX_QUEUE_SIZE)),
  ];
  await Promise.all(expiredOrOverflow.map((item) => removeQueued(item.id)));
}

async function enqueue(entry: LogEntry): Promise<void> {
  const queued: QueuedError = {
    id: entry.id,
    createdAt: entry.timestamp,
    ownerUid: auth.currentUser?.uid,
    tag: entry.tag,
    message: entry.message,
    stack: entry.stack,
    route: entry.route,
    environment: environment(),
    context: {
      online: navigator.onLine,
      userAgent: navigator.userAgent.slice(0, 300),
    },
  };
  await withStore<IDBValidKey>("readwrite", (store) => store.put(queued));
  await trimQueue();
}

export function flushQueuedErrors(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (isMock || !navigator.onLine || !auth.currentUser) return;

    const currentUid = auth.currentUser.uid;
    const queued = (await getQueued())
      .filter((item) =>
        Date.now() - item.createdAt <= RETENTION_MS &&
        (!item.ownerUid || item.ownerUid === currentUid)
      )
      .slice(0, MAX_SEND_PER_FLUSH);
    if (queued.length === 0) return;

    const report = httpsCallable<ErrorReportPayload, { ok: true }>(
      functions,
      "reportarErrorCliente"
    );
    for (const item of queued) {
      try {
        const payload: ErrorReportPayload = {
          createdAt: item.createdAt,
          tag: item.tag,
          message: item.message,
          ...(item.stack ? { stack: item.stack } : {}),
          route: item.route,
          environment: item.environment,
          context: item.context,
        };
        await report(payload);
        await removeQueued(item.id);
        acknowledge(item.id);
      } catch {
        // Se conserva en IndexedDB y se reintenta cuando vuelva la conectividad.
        break;
      }
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

export function installErrorReporting(): () => void {
  if (isMock) return () => {};

  logger.setErrorReporter(async (entry) => {
    try {
      await enqueue(entry);
      await flushQueuedErrors();
    } catch {
      // El buffer de sessionStorage sigue disponible como último respaldo.
    }
  });

  const onOnline = () => void flushQueuedErrors();
  window.addEventListener("online", onOnline);
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (user) void flushQueuedErrors();
  });
  const intervalId = window.setInterval(() => void flushQueuedErrors(), 60_000);
  const acknowledged = new Set(acknowledgedIds());
  void Promise.all(
    logger.getEntries()
      .filter((entry) => entry.level === "error" && !acknowledged.has(entry.id))
      .map((entry) => enqueue(entry).catch(() => undefined))
  ).then(() => flushQueuedErrors());

  return () => {
    logger.setErrorReporter(null);
    window.removeEventListener("online", onOnline);
    unsubscribeAuth();
    window.clearInterval(intervalId);
  };
}
