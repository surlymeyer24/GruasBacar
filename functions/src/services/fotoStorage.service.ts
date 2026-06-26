import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { EtiquetaFoto } from '@gruasbacar/shared';
import { buildRutaFoto, fotosOpcionalesEnDev } from '../utils/validators';

const db = admin.firestore;

const CARPETAS_VALIDAS = new Set(['enganche', 'desenganche']);
const ETIQUETAS_VALIDAS = new Set<string>([
  'DELANTERA',
  'LADO_DERECHO',
  'LADO_IZQUIERDO',
  'TRASERA',
  'OBSERVACION',
]);

export interface ParsedStoragePath {
  servicioId: string;
  carpeta: 'enganche' | 'desenganche';
  etiqueta: EtiquetaFoto;
}

export function parseStorageFotoPath(filePath: string): ParsedStoragePath | null {
  const match = filePath.match(/^servicios\/([^/]+)\/(enganche|desenganche)\/([A-Z_]+)\.jpg$/);
  if (!match) return null;
  const [, servicioId, carpeta, etiqueta] = match;
  if (!CARPETAS_VALIDAS.has(carpeta) || !ETIQUETAS_VALIDAS.has(etiqueta)) return null;
  return {
    servicioId,
    carpeta: carpeta as 'enganche' | 'desenganche',
    etiqueta: etiqueta as EtiquetaFoto,
  };
}

export function stagingDocId(carpeta: string, etiqueta: string): string {
  return `${carpeta}_${etiqueta}`;
}

function isStorageNotFound(err: unknown): boolean {
  const code = (err as { code?: number }).code;
  if (code === 404) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('No such object') || msg.includes('Not Found');
}

function isStaleUploadGen(existingGen: string | undefined, incomingGen: string): boolean {
  if (!existingGen || !incomingGen) return false;
  return existingGen > incomingGen;
}

async function legajoParaFotosDesdeServicio(
  servicio: FirebaseFirestore.DocumentData
): Promise<string> {
  const legajoServicio = servicio.legajoChofer as string | undefined;
  if (legajoServicio?.trim()) return legajoServicio.trim();

  const creadoPor = servicio.creadoPor as string | undefined;
  if (creadoPor) {
    const usuarioSnap = await db().collection('usuarios').doc(creadoPor).get();
    const legajoUsuario = usuarioSnap.data()?.legajo as string | undefined;
    if (legajoUsuario?.trim()) return legajoUsuario.trim();
  }

  throw new HttpsError(
    'failed-precondition',
    'El servicio no tiene legajo del enganchador.'
  );
}

export async function procesarFotoDesdeStorage(
  bucketName: string,
  filePath: string,
  driveFolderId: string,
  customMetadata: Record<string, string> | undefined
): Promise<void> {
  const parsed = parseStorageFotoPath(filePath);
  if (!parsed) {
    console.info('[procesarFotoDesdeStorage] Ruta ignorada:', filePath);
    return;
  }

  const { servicioId, carpeta, etiqueta } = parsed;
  const stagingRef = db()
    .collection('servicios')
    .doc(servicioId)
    .collection('fotosStaging')
    .doc(stagingDocId(carpeta, etiqueta));

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) {
    console.warn('[procesarFotoDesdeStorage] Servicio no encontrado:', servicioId);
    return;
  }

  const servicio = servicioSnap.data()!;
  const uidMeta = customMetadata?.uid?.trim();
  if (uidMeta && servicio.creadoPor !== uidMeta) {
    console.warn('[procesarFotoDesdeStorage] UID no coincide:', servicioId, uidMeta);
    return;
  }

  const indexRaw = customMetadata?.index;
  const index =
    typeof indexRaw === 'string' && /^\d+$/.test(indexRaw) ? parseInt(indexRaw, 10) : 0;
  const uploadGen = customMetadata?.uploadGen?.trim() ?? '';

  const stagingBefore = await stagingRef.get();
  const existing = stagingBefore.data();

  if (existing?.status === 'ready') {
    if (!uploadGen || existing.uploadGen === uploadGen) {
      console.info('[procesarFotoDesdeStorage] Ya procesada:', filePath);
      return;
    }
    if (isStaleUploadGen(existing.uploadGen as string | undefined, uploadGen)) {
      console.info('[procesarFotoDesdeStorage] Trigger obsoleto (gen anterior):', filePath);
      return;
    }
  }

  if (uploadGen && isStaleUploadGen(existing?.uploadGen as string | undefined, uploadGen)) {
    console.info('[procesarFotoDesdeStorage] Gen obsoleto, omitiendo:', filePath, uploadGen);
    return;
  }

  const claimed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(stagingRef);
    const data = snap.data();
    if (data?.status === 'ready' && data.uploadGen === uploadGen) return false;
    if (data?.status === 'processing' && data.uploadGen === uploadGen) return false;
    if (uploadGen && isStaleUploadGen(data?.uploadGen as string | undefined, uploadGen)) {
      return false;
    }
    tx.set(
      stagingRef,
      {
        carpeta,
        etiqueta,
        index,
        uploadGen: uploadGen || data?.uploadGen || null,
        status: 'processing',
        error: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });

  if (!claimed) {
    console.info('[procesarFotoDesdeStorage] Otro trigger procesando o ya listo:', filePath);
    return;
  }

  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(filePath);

  try {
    let buffer: Buffer;
    try {
      [buffer] = await file.download();
    } catch (downloadErr) {
      if (isStorageNotFound(downloadErr)) {
        const afterSnap = await stagingRef.get();
        const after = afterSnap.data();
        if (after?.status === 'ready') {
          console.info(
            '[procesarFotoDesdeStorage] Archivo ya borrado, staging listo:',
            filePath
          );
          return;
        }
      }
      throw downloadErr;
    }

    const legajo = await legajoParaFotosDesdeServicio(servicio);
    const patente = servicio.patente as string;
    const numeroInfraccion = servicio.numeroInfraccion as string;

    const drive = await import('./drive.service');
    const relativePath = buildRutaFoto(
      legajo,
      patente,
      numeroInfraccion,
      carpeta,
      etiqueta,
      index,
      servicio.creadoEn
    );

    const existenteEnDrive = await drive.obtenerFotoEnDrive(driveFolderId, relativePath);
    const uploaded =
      existenteEnDrive ?? (await drive.subirFotoDriveFromBuffer(driveFolderId, relativePath, buffer));

    await stagingRef.set(
      {
        carpeta,
        etiqueta,
        index,
        uploadGen: uploadGen || null,
        status: 'ready',
        url: uploaded.url,
        driveFileId: uploaded.driveFileId,
        error: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await file.delete();
    } catch (deleteErr) {
      console.warn('[procesarFotoDesdeStorage] No se pudo borrar de Storage:', filePath, deleteErr);
    }

    void maybeRunStorageCleanup(driveFolderId);
  } catch (err) {
    const message =
      err instanceof HttpsError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Error desconocido al procesar la foto.';

    if (isStorageNotFound(err)) {
      const afterSnap = await stagingRef.get();
      if (afterSnap.data()?.status === 'ready') {
        console.info('[procesarFotoDesdeStorage] Error 404 pero staging listo:', filePath);
        return;
      }
    }

    if (fotosOpcionalesEnDev()) {
      console.warn('[procesarFotoDesdeStorage] Drive falló en dev:', message);
      await stagingRef.set(
        {
          carpeta,
          etiqueta,
          index,
          uploadGen: uploadGen || null,
          status: 'ready',
          url: `dev://local/${filePath}`,
          driveFileId: `dev_${servicioId}_${etiqueta}`,
          error: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      try {
        await file.delete();
      } catch {
        /* noop */
      }
      return;
    }

    const currentSnap = await stagingRef.get();
    const currentGen = currentSnap.data()?.uploadGen as string | undefined;
    if (uploadGen && currentGen && currentGen !== uploadGen) {
      console.info('[procesarFotoDesdeStorage] Error en gen obsoleto, no se marca error:', filePath);
      return;
    }

    await stagingRef.set(
      {
        status: 'error',
        error: message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    throw err;
  }
}

export async function limpiarFotosStaging(
  servicioId: string,
  carpeta: 'enganche' | 'desenganche'
): Promise<void> {
  const snap = await db()
    .collection('servicios')
    .doc(servicioId)
    .collection('fotosStaging')
    .where('carpeta', '==', carpeta)
    .get();

  if (snap.empty) return;

  const batch = db().batch();
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
}

const STORAGE_CLEANUP_MIN_AGE_MS = 5 * 60 * 1000;
const STORAGE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function storageFileAgeMs(metadata: { updated?: string; timeCreated?: string } | undefined): number {
  const raw = metadata?.updated ?? metadata?.timeCreated;
  if (!raw) return Number.POSITIVE_INFINITY;
  const ts = new Date(raw).getTime();
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

/** Ejecuta limpieza de Storage como mucho una vez por hora (sin Cloud Scheduler). */
export async function maybeRunStorageCleanup(driveFolderId: string): Promise<void> {
  const ref = db().doc('_maintenance/storageCleanup');
  const shouldRun = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastRunMs = snap.data()?.lastRunAt?.toMillis?.() ?? 0;
    if (Date.now() - lastRunMs < STORAGE_CLEANUP_INTERVAL_MS) return false;
    tx.set(
      ref,
      { lastRunAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return true;
  });

  if (!shouldRun) return;

  try {
    await limpiarStorageFotosSubidas(driveFolderId);
  } catch (err) {
    console.warn('[maybeRunStorageCleanup] Limpieza falló:', err);
  }
}

/** Borra de Storage fotos ya procesadas (staging ready o presentes en Drive por nombre). */
export async function limpiarStorageFotosSubidas(driveFolderId: string): Promise<{ deleted: number; scanned: number }> {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: 'servicios/' });
  const drive = await import('./drive.service');

  let deleted = 0;

  for (const file of files) {
    const parsed = parseStorageFotoPath(file.name);
    if (!parsed) continue;

    const [metadata] = await file.getMetadata().catch(() => [undefined]);
    if (storageFileAgeMs(metadata) < STORAGE_CLEANUP_MIN_AGE_MS) continue;

    const { servicioId, carpeta, etiqueta } = parsed;
    const stagingRef = db()
      .collection('servicios')
      .doc(servicioId)
      .collection('fotosStaging')
      .doc(stagingDocId(carpeta, etiqueta));

    const stagingSnap = await stagingRef.get();
    if (stagingSnap.data()?.status === 'ready') {
      try {
        await file.delete();
        deleted++;
      } catch (err) {
        console.warn('[limpiarStorageFotosSubidas] No se pudo borrar (staging ready):', file.name, err);
      }
      continue;
    }

    const servicioSnap = await db().collection('servicios').doc(servicioId).get();
    if (!servicioSnap.exists) continue;

    const servicio = servicioSnap.data()!;
    try {
      const legajo = await legajoParaFotosDesdeServicio(servicio);
      const indexRaw = metadata?.metadata?.index;
      const index =
        typeof indexRaw === 'string' && /^\d+$/.test(indexRaw) ? parseInt(indexRaw, 10) : 0;

      const relativePath = buildRutaFoto(
        legajo,
        servicio.patente as string,
        servicio.numeroInfraccion as string,
        carpeta,
        etiqueta,
        index,
        servicio.creadoEn
      );

      const enDrive = await drive.obtenerFotoEnDrive(driveFolderId, relativePath);
      if (!enDrive) continue;

      await stagingRef.set(
        {
          carpeta,
          etiqueta,
          index,
          status: 'ready',
          url: enDrive.url,
          driveFileId: enDrive.driveFileId,
          error: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      try {
        await file.delete();
        deleted++;
      } catch (err) {
        console.warn('[limpiarStorageFotosSubidas] No se pudo borrar (en Drive):', file.name, err);
      }
    } catch (err) {
      console.warn('[limpiarStorageFotosSubidas] Error evaluando:', file.name, err);
    }
  }

  console.info('[limpiarStorageFotosSubidas] escaneados:', files.length, 'borrados:', deleted);
  return { deleted, scanned: files.length };
}
