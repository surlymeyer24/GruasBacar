import { EtiquetaFoto } from "@gruasbacar/shared";

const DB_NAME = "gruasbacar_fotos";
const STORE_NAME = "borrador";
const DB_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface FotoCacheSlot {
  etiqueta: EtiquetaFoto;
  base64: string;
}

export interface FotoCacheBorrador {
  key: string;
  slots: (FotoCacheSlot | null)[];
  fotoExtra: FotoCacheSlot | null;
  comentario: string;
  updatedAt: number;
}

export function claveBorradorFotos(servicioId: string, carpeta: "enganche" | "desenganche"): string {
  return `${servicioId}:${carpeta}`;
}

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

export async function guardarBorradorFotos(
  key: string,
  data: Omit<FotoCacheBorrador, "key" | "updatedAt">
): Promise<void> {
  try {
    const store = await txStore("readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...data, key, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[fotoCache] No se pudo guardar borrador", err);
  }
}

export async function cargarBorradorFotos(key: string): Promise<FotoCacheBorrador | null> {
  try {
    const store = await txStore("readonly");
    const entry = await new Promise<FotoCacheBorrador | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as FotoCacheBorrador | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
      await limpiarBorradorFotos(key);
      return null;
    }
    return entry;
  } catch (err) {
    console.warn("[fotoCache] No se pudo cargar borrador", err);
    return null;
  }
}

export async function limpiarBorradorFotos(key: string): Promise<void> {
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
