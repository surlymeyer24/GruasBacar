import { EtiquetaFoto } from "@gruasbacar/shared";

const DB_NAME = "gruasbacar_fotos";
const STORE_NAME = "borrador";
const DB_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LS_PREFIX = "fc:";

export interface FotoCacheSlot {
  etiqueta: EtiquetaFoto;
  base64: string;
}

export interface FotoCacheBorrador {
  key: string;
  slots: (FotoCacheSlot | null)[];
  fotoExtra?: FotoCacheSlot | null;
  fotosExtra?: FotoCacheSlot[];
  comentario: string;
  updatedAt: number;
}

export function claveBorradorFotos(servicioId: string, carpeta: "enganche" | "desenganche"): string {
  return `${servicioId}:${carpeta}`;
}

export function claveBorradorDraft(identificador: string, carpeta: "enganche" | "desenganche"): string {
  return `draft:${identificador}:${carpeta}`;
}

// ---------------------------------------------------------------------------
// localStorage backup — sincrónico, sobrevive al kill del tab por el OS
// ---------------------------------------------------------------------------

function lsSave(key: string, data: Omit<FotoCacheBorrador, "key" | "updatedAt">): void {
  try {
    localStorage.setItem(
      LS_PREFIX + key,
      JSON.stringify({ ...data, key, updatedAt: Date.now() })
    );
  } catch { /* storage full */ }
}

function lsLoad(key: string): FotoCacheBorrador | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const entry: FotoCacheBorrador = JSON.parse(raw);
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    return entry;
  } catch { return null; }
}

function lsClear(key: string): void {
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// IndexedDB — async, sin límite práctico de tamaño
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB"));
    });
  }
  return dbPromise;
}

function txStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return getDb().then(
    (db) => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  );
}

// ---------------------------------------------------------------------------
// API pública — escribe en ambos storages, lee el más reciente
// ---------------------------------------------------------------------------

export async function guardarBorradorFotos(
  key: string,
  data: Omit<FotoCacheBorrador, "key" | "updatedAt">
): Promise<void> {
  // Backup sincrónico — se completa antes de que el OS mate el tab
  lsSave(key, data);

  try {
    const store = await txStore("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...data, key, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[fotoCache] No se pudo guardar borrador en IDB", err);
  }
}

export async function cargarBorradorFotos(key: string): Promise<FotoCacheBorrador | null> {
  const lsEntry = lsLoad(key);

  let idbEntry: FotoCacheBorrador | null = null;
  try {
    const store = await txStore("readonly");
    const raw = await new Promise<FotoCacheBorrador | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as FotoCacheBorrador | undefined);
      req.onerror = () => reject(req.error);
    });
    if (raw && Date.now() - raw.updatedAt <= CACHE_TTL_MS) {
      idbEntry = raw;
    }
  } catch (err) {
    console.warn("[fotoCache] No se pudo cargar borrador de IDB", err);
  }

  if (lsEntry && idbEntry) {
    return lsEntry.updatedAt >= idbEntry.updatedAt ? lsEntry : idbEntry;
  }
  return lsEntry ?? idbEntry ?? null;
}

export async function limpiarBorradorFotos(key: string): Promise<void> {
  lsClear(key);
  try {
    const store = await txStore("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[fotoCache] No se pudo limpiar borrador", err);
  }
}

export function base64ToBlob(base64: string, mime = "image/jpeg"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------------------------------------------------------------------------
// Sesión de cámara — sobrevive al kill del tab al abrir cámara nativa
// ---------------------------------------------------------------------------

const CAM_SESSION_PREFIX = "fc:cam:";

export interface CameraSessionState {
  cacheKey: string;
  guidedIndex: number;
  extraMode: boolean;
  modalOpen: boolean;
  updatedAt: number;
}

/** Escritura 100% síncrona (llamar JUSTO antes de abrir &lt;input capture&gt;). */
export function guardarBorradorFotosSync(
  key: string,
  data: Omit<FotoCacheBorrador, "key" | "updatedAt">
): void {
  lsSave(key, data);
}

export function saveCameraSession(
  state: Omit<CameraSessionState, "updatedAt">
): void {
  try {
    localStorage.setItem(
      CAM_SESSION_PREFIX + state.cacheKey,
      JSON.stringify({ ...state, updatedAt: Date.now() })
    );
  } catch {
    /* storage full */
  }
}

export function loadCameraSession(cacheKey: string): CameraSessionState | null {
  try {
    const raw = localStorage.getItem(CAM_SESSION_PREFIX + cacheKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CameraSessionState;
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CAM_SESSION_PREFIX + cacheKey);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function clearCameraSession(cacheKey: string): void {
  try {
    localStorage.removeItem(CAM_SESSION_PREFIX + cacheKey);
  } catch {
    /* ok */
  }
}
