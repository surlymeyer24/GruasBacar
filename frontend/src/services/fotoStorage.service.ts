import {
  deleteDoc,
  doc,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import { EtiquetaFoto, Foto } from "@gruasbacar/shared";

export type CarpetaFoto = "enganche" | "desenganche";

export type FaseSubidaFoto = "idle" | "storage" | "drive" | "ready" | "error";

export interface ProgresoSubidaFotos {
  fase: FaseSubidaFoto;
  storageCompletadas: number;
  storageTotal: number;
  driveCompletadas: number;
  driveTotal: number;
  mensaje?: string;
}

export function buildStorageFotoPath(
  servicioId: string,
  carpeta: CarpetaFoto,
  etiqueta: EtiquetaFoto
): string {
  return `servicios/${servicioId}/${carpeta}/${etiqueta}.jpg`;
}

export function stagingDocId(carpeta: CarpetaFoto, etiqueta: EtiquetaFoto): string {
  return `${carpeta}_${etiqueta}`;
}

interface StagingDoc {
  carpeta?: CarpetaFoto;
  etiqueta?: EtiquetaFoto;
  status?: "processing" | "ready" | "error";
  uploadGen?: string;
  url?: string;
  driveFileId?: string;
  error?: string;
}

let uploadSeq = 0;

export function newUploadGen(): string {
  uploadSeq += 1;
  return `${Date.now()}_${uploadSeq}`;
}

/** Serializa subidas al mismo servicio/carpeta para evitar triggers paralelos. */
const uploadLocks = new Map<string, Promise<unknown>>();

function lockKey(servicioId: string, carpeta: CarpetaFoto): string {
  return `${servicioId}:${carpeta}`;
}

async function withUploadLock<T>(
  servicioId: string,
  carpeta: CarpetaFoto,
  fn: () => Promise<T>
): Promise<T> {
  const key = lockKey(servicioId, carpeta);
  const prev = uploadLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  uploadLocks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (uploadLocks.get(key) === chained) {
      uploadLocks.delete(key);
    }
  }
}

export async function limpiarStagingLocal(
  servicioId: string,
  carpeta: CarpetaFoto,
  etiquetas: EtiquetaFoto[]
): Promise<void> {
  await Promise.all(
    etiquetas.map((etiqueta) =>
      deleteDoc(
        doc(db, "servicios", servicioId, "fotosStaging", stagingDocId(carpeta, etiqueta))
      ).catch(() => undefined)
    )
  );
}

export async function uploadFotoBlob(
  blob: Blob,
  servicioId: string,
  carpeta: CarpetaFoto,
  etiqueta: EtiquetaFoto,
  index: number,
  uploadGen: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Tenés que iniciar sesión para subir fotos.");
  }

  const path = buildStorageFotoPath(servicioId, carpeta, etiqueta);
  const storageRef = ref(storage, path);

  const task = uploadBytesResumable(storageRef, blob, {
    contentType: "image/jpeg",
    customMetadata: {
      uid,
      servicioId,
      carpeta,
      etiqueta,
      index: String(index),
      uploadGen,
    },
  });

  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", () => undefined, reject, () => resolve());
  });
}

export function watchFotosStaging(
  servicioId: string,
  carpeta: CarpetaFoto,
  etiquetas: EtiquetaFoto[],
  onUpdate: (progreso: ProgresoSubidaFotos, fotos?: Foto[]) => void,
  expectedUploadGen?: string
): Unsubscribe {
  const byEtiqueta = new Map<EtiquetaFoto, StagingDoc>();

  const matchesUploadGen = (data: StagingDoc): boolean =>
    !expectedUploadGen || data.uploadGen === expectedUploadGen;

  const emit = () => {
    let errorMsg: string | null = null;

    for (const etiqueta of etiquetas) {
      const data = byEtiqueta.get(etiqueta);
      if (!data) continue;
      if (data.status === "error") {
        errorMsg = data.error?.trim() || "No se pudo procesar una foto.";
        break;
      }
    }

    if (errorMsg) {
      onUpdate({
        fase: "error",
        storageCompletadas: etiquetas.length,
        storageTotal: etiquetas.length,
        driveCompletadas: 0,
        driveTotal: etiquetas.length,
        mensaje: errorMsg,
      });
      return;
    }

    const driveReady = etiquetas.filter((e) => {
      const s = byEtiqueta.get(e);
      return s?.status === "ready" && s.url && s.driveFileId;
    });

    const driveProcessing = etiquetas.filter((e) => byEtiqueta.get(e)?.status === "processing");

    if (driveReady.length === etiquetas.length) {
      const fotos: Foto[] = etiquetas.map((etiqueta) => {
        const s = byEtiqueta.get(etiqueta)!;
        return {
          etiqueta,
          url: s.url!,
          driveFileId: s.driveFileId!,
        };
      });
      onUpdate(
        {
          fase: "ready",
          storageCompletadas: etiquetas.length,
          storageTotal: etiquetas.length,
          driveCompletadas: etiquetas.length,
          driveTotal: etiquetas.length,
        },
        fotos
      );
      return;
    }

    if (driveProcessing.length > 0 || driveReady.length > 0) {
      onUpdate({
        fase: "drive",
        storageCompletadas: etiquetas.length,
        storageTotal: etiquetas.length,
        driveCompletadas: driveReady.length,
        driveTotal: etiquetas.length,
        mensaje: `Procesando en Drive (${driveReady.length}/${etiquetas.length})…`,
      });
      return;
    }

    onUpdate({
      fase: "drive",
      storageCompletadas: etiquetas.length,
      storageTotal: etiquetas.length,
      driveCompletadas: 0,
      driveTotal: etiquetas.length,
      mensaje: "Esperando procesamiento en Drive…",
    });
  };

  const onSnapshotError = (err: unknown) => {
    console.error("[watchFotosStaging]", err);
    onUpdate({
      fase: "error",
      storageCompletadas: 0,
      storageTotal: etiquetas.length,
      driveCompletadas: 0,
      driveTotal: etiquetas.length,
      mensaje: "No se pudo verificar el estado de las fotos.",
    });
  };

  const unsubs = etiquetas.map((etiqueta) => {
    const ref = doc(
      db,
      "servicios",
      servicioId,
      "fotosStaging",
      stagingDocId(carpeta, etiqueta)
    );

    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          byEtiqueta.delete(etiqueta);
          emit();
          return;
        }

        const data = snap.data() as StagingDoc;
        if (
          data.carpeta !== carpeta ||
          data.etiqueta !== etiqueta ||
          !matchesUploadGen(data) ||
          (data.status !== "ready" && data.status !== "processing" && data.status !== "error")
        ) {
          byEtiqueta.delete(etiqueta);
        } else {
          byEtiqueta.set(etiqueta, data);
        }
        emit();
      },
      onSnapshotError
    );
  });

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function waitForFotosEnDrive(
  servicioId: string,
  carpeta: CarpetaFoto,
  etiquetas: EtiquetaFoto[],
  timeoutMs = 180_000
): Promise<Foto[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error("Tiempo de espera agotado al procesar las fotos en Drive."));
    }, timeoutMs);

    const unsub = watchFotosStaging(servicioId, carpeta, etiquetas, (progreso, fotos) => {
      if (settled) return;
      if (progreso.fase === "error") {
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error(progreso.mensaje ?? "Error al procesar las fotos."));
        return;
      }
      if (progreso.fase === "ready" && fotos) {
        settled = true;
        clearTimeout(timeout);
        unsub();
        resolve(fotos);
      }
    });
  });
}

export async function subirFotosViaStorage(
  servicioId: string,
  carpeta: CarpetaFoto,
  fotosMeta: Omit<Foto, "url" | "driveFileId">[],
  blobs: Blob[],
  onProgress?: (progreso: ProgresoSubidaFotos) => void,
  uploadGen = newUploadGen()
): Promise<Foto[]> {
  if (blobs.length === 0) return [];

  return withUploadLock(servicioId, carpeta, async () => {
    const etiquetas = fotosMeta.map((f) => f.etiqueta);
    await limpiarStagingLocal(servicioId, carpeta, etiquetas);

    return new Promise<Foto[]>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsub();
        reject(new Error("Tiempo de espera agotado al procesar las fotos en Drive."));
      }, 180_000);

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        fn();
      };

      const unsub = watchFotosStaging(
        servicioId,
        carpeta,
        etiquetas,
        (progreso, fotos) => {
          onProgress?.(progreso);
          if (progreso.fase === "error") {
            finish(() => reject(new Error(progreso.mensaje ?? "Error al procesar las fotos.")));
          } else if (progreso.fase === "ready" && fotos) {
            finish(() => resolve(fotos));
          }
        },
        uploadGen
      );

      (async () => {
        try {
          onProgress?.({
            fase: "storage",
            storageCompletadas: 0,
            storageTotal: blobs.length,
            driveCompletadas: 0,
            driveTotal: blobs.length,
            mensaje: "Subiendo fotos…",
          });

          for (let i = 0; i < blobs.length; i++) {
            await uploadFotoBlob(
              blobs[i],
              servicioId,
              carpeta,
              fotosMeta[i].etiqueta,
              i,
              uploadGen
            );
            onProgress?.({
              fase: "storage",
              storageCompletadas: i + 1,
              storageTotal: blobs.length,
              driveCompletadas: 0,
              driveTotal: blobs.length,
              mensaje: `Subiendo fotos (${i + 1}/${blobs.length})…`,
            });
          }

          onProgress?.({
            fase: "drive",
            storageCompletadas: blobs.length,
            storageTotal: blobs.length,
            driveCompletadas: 0,
            driveTotal: blobs.length,
            mensaje: "Procesando en Drive…",
          });
        } catch (err) {
          finish(() =>
            reject(err instanceof Error ? err : new Error("No se pudieron subir las fotos."))
          );
        }
      })();
    });
  });
}
