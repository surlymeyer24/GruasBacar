import { Readable } from 'stream';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildCarpetaServicio,
  fechaCarpetaDrive,
} from '../utils/validators';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

export interface VerificarDriveResult {
  ok: true;
  folderId: string;
  folderName: string;
  testFileId: string;
  testFileName: string;
  testFileUrl: string;
  serviceAccountEmail: string;
}

export interface SubirFotoDriveResult {
  url: string;
  driveFileId: string;
}

type GoogleApisModule = typeof import('googleapis');
type DriveClient = ReturnType<GoogleApisModule['google']['drive']>;

const folderCache = new Map<string, string>();
const rootFolderNameCache = new Map<string, string>();
/** Lock por clave para evitar creaciones duplicadas concurrentes en la misma instancia. */
const folderCreateLocks = new Map<string, Promise<string>>();
let cachedServiceAccountEmail: string | null = null;
let googleApisPromise: Promise<GoogleApisModule> | null = null;

/** googleapis es pesado (~10s). Carga diferida para no bloquear el deploy de Functions. */
async function loadGoogleApis(): Promise<GoogleApisModule> {
  if (!googleApisPromise) {
    googleApisPromise = import('googleapis');
  }
  return googleApisPromise;
}

async function getDriveClient(): Promise<DriveClient> {
  const { google } = await loadGoogleApis();
  const auth = new google.auth.GoogleAuth({ scopes: DRIVE_SCOPES });
  return google.drive({ version: 'v3', auth });
}

async function getServiceAccountEmail(): Promise<string> {
  if (cachedServiceAccountEmail) return cachedServiceAccountEmail;
  const { google } = await loadGoogleApis();
  const auth = new google.auth.GoogleAuth({ scopes: DRIVE_SCOPES });
  const client = await auth.getClient();
  if ('email' in client && typeof client.email === 'string' && client.email) {
    cachedServiceAccountEmail = client.email;
    return client.email;
  }
  const envEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (envEmail) {
    cachedServiceAccountEmail = envEmail;
    return envEmail;
  }
  throw new Error(
    'No se pudo obtener el email del service account. ' +
    'Verificar configuración de IAM o definir GOOGLE_SERVICE_ACCOUNT_EMAIL.'
  );
}

const SA_EMAIL_FALLBACK = '231607744664-compute@developer.gserviceaccount.com';

function isStorageQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const gaxios = err as Error & { errors?: Array<{ message?: string }> };
  const apiMsg = gaxios.errors?.[0]?.message?.toLowerCase() ?? '';
  return msg.includes('storage quota') || apiMsg.includes('storage quota');
}

function sharedDriveRequiredMessage(saEmail: string): string {
  return (
    `Las service accounts no tienen cuota en "Mi unidad" personal. ` +
    `La carpeta debe estar dentro de un Drive compartido (Google Workspace): ` +
    `(1) Creá un Drive compartido, (2) agregá ${saEmail} como Administrador de contenido, ` +
    `(3) creá la carpeta raíz adentro, (4) actualizá GOOGLE_DRIVE_FOLDER_ID con el ID de esa carpeta.`
  );
}

function driveErrorMessage(err: unknown, folderId?: string, saEmail?: string): string {
  const email = saEmail ?? SA_EMAIL_FALLBACK;
  const saHint = `Compartí la carpeta con Editor (o Content manager en Drive compartido) a: ${email}`;

  if (isStorageQuotaError(err)) {
    return sharedDriveRequiredMessage(email);
  }

  if (err instanceof Error) {
    const gaxios = err as Error & { code?: number; errors?: Array<{ message?: string }> };
    if (gaxios.code === 404) {
      return `No se encontró la carpeta${folderId ? ` (${folderId})` : ''}. Revisá GOOGLE_DRIVE_FOLDER_ID. ${saHint}`;
    }
    if (gaxios.code === 403) {
      return `Sin permiso en Drive. ${saHint}. ${sharedDriveRequiredMessage(email)}`;
    }
    if (gaxios.errors?.[0]?.message) {
      return `${gaxios.errors[0].message}. ${saHint}`;
    }
    return `${err.message}. ${saHint}`;
  }
  return `Error desconocido al acceder a Google Drive. ${saHint}`;
}

async function getFolderMetadata(
  drive: DriveClient,
  folderId: string
): Promise<{ id: string; name?: string | null; mimeType?: string | null; driveId?: string | null }> {
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,mimeType,driveId',
    supportsAllDrives: true,
  });
  if (!res.data.id) {
    throw new HttpsError('not-found', 'No se pudo leer la carpeta de Drive.');
  }
  return res.data as { id: string; name?: string | null; mimeType?: string | null; driveId?: string | null };
}

async function assertRootFolderAccess(drive: DriveClient, folderId: string): Promise<void> {
  const saEmail = await getServiceAccountEmail();
  try {
    const folder = await getFolderMetadata(drive, folderId);
    if (folder.mimeType !== 'application/vnd.google-apps.folder') {
      throw new HttpsError('invalid-argument', 'El ID configurado no corresponde a una carpeta de Google Drive.');
    }
    if (!folder.driveId) {
      throw new HttpsError('failed-precondition', sharedDriveRequiredMessage(saEmail));
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[assertRootFolderAccess]', folderId, saEmail, err);
    throw new HttpsError(
      'failed-precondition',
      `La service account (${saEmail}) no puede acceder a la carpeta. ${driveErrorMessage(err, folderId, saEmail)}`
    );
  }
}

async function findChildFolder(
  drive: DriveClient,
  parentId: string,
  name: string
): Promise<string | null> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, createdTime)',
    orderBy: 'createdTime',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function findFileInFolder(
  drive: DriveClient,
  parentId: string,
  fileName: string
): Promise<string | null> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = `name='${escaped}' and '${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolderOnDrive(
  drive: DriveClient,
  parentId: string,
  name: string
): Promise<string> {
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new HttpsError('internal', `No se pudo crear la carpeta "${name}" en Drive.`);
  }
  return created.data.id;
}

function folderCacheDocId(parentId: string, name: string): string {
  return `${parentId}__${name}`.replace(/\//g, '_').slice(0, 500);
}

/**
 * Busca carpeta en Drive; crea solo si no existe.
 * Usa Firestore como lock distribuido para evitar duplicados entre instancias de CF:
 * 1. Cache en memoria (misma instancia)
 * 2. Firestore _driveFolders (cross-instancia, fuertemente consistente)
 * 3. Drive files.list (eventualmente consistente, fallback)
 * 4. Crear + claim atómico en Firestore (primer escritor gana)
 */
async function getOrCreateFolder(drive: DriveClient, parentId: string, name: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const pendingLock = folderCreateLocks.get(cacheKey);
  if (pendingLock) return pendingLock;

  const work = (async () => {
    const docRef = admin.firestore().collection('_driveFolders').doc(folderCacheDocId(parentId, name));

    try {
      const docSnap = await docRef.get();
      if (docSnap.exists && docSnap.data()?.folderId) {
        const folderId = docSnap.data()!.folderId as string;
        folderCache.set(cacheKey, folderId);
        return folderId;
      }
    } catch (err) {
      console.warn('[getOrCreateFolder] Firestore cache read falló, continúa con Drive:', err);
    }

    const existing = await findChildFolder(drive, parentId, name);
    if (existing) {
      folderCache.set(cacheKey, existing);
      docRef.set({ folderId: existing, parentId, name }).catch(() => {});
      return existing;
    }

    const created = await createFolderOnDrive(drive, parentId, name);

    try {
      await docRef.create({ folderId: created, parentId, name });
    } catch {
      try {
        const snap = await docRef.get();
        if (snap.exists && snap.data()?.folderId) {
          const canonical = snap.data()!.folderId as string;
          folderCache.set(cacheKey, canonical);
          return canonical;
        }
      } catch { /* fallback al creado */ }
    }

    folderCache.set(cacheKey, created);
    return created;
  })();

  folderCreateLocks.set(cacheKey, work);
  try {
    return await work;
  } finally {
    folderCreateLocks.delete(cacheKey);
  }
}

async function getRootFolderName(drive: DriveClient, rootFolderId: string): Promise<string> {
  const cached = rootFolderNameCache.get(rootFolderId);
  if (cached !== undefined) return cached;
  const folder = await getFolderMetadata(drive, rootFolderId);
  const name = folder.name?.trim().toLowerCase() ?? '';
  rootFolderNameCache.set(rootFolderId, name);
  return name;
}

/** Evita Gruas/Gruas/... cuando GOOGLE_DRIVE_FOLDER_ID ya apunta a la carpeta "Gruas". */
function stripDuplicateGruasSegment(rootFolderName: string, segments: string[]): string[] {
  if (segments[0]?.toLowerCase() === 'gruas' && rootFolderName === 'gruas') {
    return segments.slice(1);
  }
  return segments;
}

async function ensureFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  segments: string[]
): Promise<string> {
  const rootFolderName = await getRootFolderName(drive, rootFolderId);
  const normalized = stripDuplicateGruasSegment(rootFolderName, segments);
  let parentId = rootFolderId;
  for (const segment of normalized) {
    parentId = await getOrCreateFolder(drive, parentId, segment);
  }
  return parentId;
}

type FechaServicioInput = Date | string | { toDate: () => Date } | null | undefined;

/** Inyecta un folder ID conocido en el caché para evitar creaciones duplicadas entre instancias. */
export function seedFolderCache(parentId: string, name: string, folderId: string): void {
  folderCache.set(`${parentId.trim()}/${name}`, folderId);
}

/** Crea carpeta fecha/servicio. Devuelve ambos folder IDs para persistirlos en Firestore. */
export async function prepararCarpetasServicio(
  rootFolderId: string,
  legajo: string,
  patente: string,
  numeroInfraccion: string | undefined,
  fechaServicio?: FechaServicioInput
): Promise<{ fechaFolderId: string; carpetaId: string }> {
  const folderId = rootFolderId.trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const fecha = fechaServicio ?? new Date();
  const fechaStr = fechaCarpetaDrive(fecha);
  const carpetaServicio = buildCarpetaServicio(legajo, patente, numeroInfraccion, fecha);

  const drive = await getDriveClient();
  const fechaFolderId = await ensureFolderPath(drive, folderId, [fechaStr]);
  const carpetaId = await ensureFolderPath(drive, folderId, [fechaStr, carpetaServicio]);
  return { fechaFolderId, carpetaId };
}

/** Resuelve parentId de una ruta relativa sin crear carpetas (solo listado Drive + caché en memoria). */
async function resolveFolderIdForPath(
  drive: DriveClient,
  rootFolderId: string,
  folderSegments: string[]
): Promise<string | null> {
  const rootFolderName = await getRootFolderName(drive, rootFolderId);
  const normalized = stripDuplicateGruasSegment(rootFolderName, folderSegments);
  let parentId = rootFolderId.trim();
  for (const segment of normalized) {
    const cacheKey = `${parentId}/${segment}`;
    const cached = folderCache.get(cacheKey);
    if (cached) {
      parentId = cached;
      continue;
    }
    const found = await findChildFolder(drive, parentId, segment);
    if (!found) return null;
    folderCache.set(cacheKey, found);
    parentId = found;
  }
  return parentId;
}

/** Indica si ya existe un archivo con ese nombre en la ruta relativa de Drive. */
export async function existeFotoEnDrive(
  rootFolderId: string,
  relativePath: string
): Promise<boolean> {
  const found = await obtenerFotoEnDrive(rootFolderId, relativePath);
  return found !== null;
}

/** Busca archivo existente por ruta relativa (sin crear carpetas ni duplicar). */
export async function obtenerFotoEnDrive(
  rootFolderId: string,
  relativePath: string
): Promise<SubirFotoDriveResult | null> {
  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;

  const drive = await getDriveClient();
  const parentId = await resolveFolderIdForPath(drive, rootFolderId, parts);
  if (!parentId) return null;

  const fileId = await findFileInFolder(drive, parentId, fileName);
  if (!fileId) return null;

  const meta = await drive.files.get({
    fileId,
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  return {
    driveFileId: fileId,
    url: meta.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/** Sube JPEG a Drive bajo rootFolderId siguiendo relativePath (ej. 2026-06-17/CH001/AB123CD_INF228391/enganche/delantera.jpg). */
export async function subirFotoDriveFromBuffer(
  rootFolderId: string,
  relativePath: string,
  buffer: Buffer,
  drive?: DriveClient
): Promise<SubirFotoDriveResult> {
  const folderId = rootFolderId.trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new HttpsError('invalid-argument', 'Ruta de foto inválida.');
  }

  const client = drive ?? (await getDriveClient());

  try {
    const parentId =
      parts.length > 0 ? await ensureFolderPath(client, folderId, parts) : folderId;

    const existingFileId = await findFileInFolder(client, parentId, fileName);

    if (existingFileId) {
      const updated = await client.files.update({
        fileId: existingFileId,
        media: {
          mimeType: 'image/jpeg',
          body: Readable.from(buffer),
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      });

      const fileId = updated.data.id ?? existingFileId;
      return {
        driveFileId: fileId,
        url: updated.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
      };
    }

    const created = await client.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media: {
        mimeType: 'image/jpeg',
        body: Readable.from(buffer),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    if (!created.data.id) {
      throw new HttpsError('internal', 'Drive no devolvió el ID del archivo subido.');
    }

    const fileId = created.data.id;
    try {
      await client.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      console.warn('[subirFotoDrive] No se pudo compartir la foto con enlace', fileId, permErr);
    }

    return {
      driveFileId: fileId,
      url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[subirFotoDrive]', relativePath, err);
    const saEmail = await getServiceAccountEmail();
    const message = `No se pudo guardar la foto en Drive: ${driveErrorMessage(err, folderId, saEmail)}`;
    throw new HttpsError(isStorageQuotaError(err) ? 'failed-precondition' : 'failed-precondition', message);
  }
}

export async function subirFotoDrive(
  rootFolderId: string,
  relativePath: string,
  base64: string,
  drive?: DriveClient
): Promise<SubirFotoDriveResult> {
  return subirFotoDriveFromBuffer(rootFolderId, relativePath, Buffer.from(base64, 'base64'), drive);
}

/** Valida acceso, prepara carpetas y sube el lote en paralelo. */
export async function subirFotosDrive(
  rootFolderId: string,
  items: Array<{ relativePath: string; base64: string }>
): Promise<SubirFotoDriveResult[]> {
  const folderId = rootFolderId.trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }
  if (items.length === 0) return [];

  const drive = await getDriveClient();
  await assertRootFolderAccess(drive, folderId);

  const rutasCarpeta = new Set<string>();
  for (const item of items) {
    const parts = item.relativePath.split('/').filter(Boolean);
    parts.pop();
    if (parts.length > 0) rutasCarpeta.add(parts.join('/'));
  }
  for (const ruta of rutasCarpeta) {
    await ensureFolderPath(drive, folderId, ruta.split('/'));
  }

  return Promise.all(
    items.map((item) => subirFotoDrive(folderId, item.relativePath, item.base64, drive))
  );
}

/** URLs de vista previa vía API (funciona con archivos privados en Drive compartido). */
export async function obtenerUrlsPreviewFotos(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(driveFileIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const drive = await getDriveClient();
  const result: Record<string, string> = {};

  await Promise.all(
    ids.map(async (fileId) => {
      try {
        const res = await drive.files.get({
          fileId,
          fields: 'thumbnailLink,webContentLink',
          supportsAllDrives: true,
        });
        result[fileId] =
          res.data.thumbnailLink ??
          res.data.webContentLink ??
          `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      } catch (err) {
        console.warn('[obtenerUrlsPreviewFotos]', fileId, err);
        result[fileId] = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      }
    })
  );

  return result;
}

const MAX_FOTOS_PDF = 30;
const MAX_BYTES_FOTO_PDF = 4 * 1024 * 1024;

/** Imágenes en base64 para incrustar en el PDF (descarga vía cuenta de servicio). */
export async function obtenerFotosParaPdf(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(driveFileIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_FOTOS_PDF);
  if (ids.length === 0) return {};

  const drive = await getDriveClient();
  const result: Record<string, string> = {};

  await Promise.all(
    ids.map(async (fileId) => {
      try {
        const meta = await drive.files.get({
          fileId,
          fields: 'mimeType,size',
          supportsAllDrives: true,
        });
        const size = Number(meta.data.size ?? 0);
        if (size > MAX_BYTES_FOTO_PDF) {
          console.warn('[obtenerFotosParaPdf] archivo demasiado grande, se omite', fileId, size);
          return;
        }
        const mime = (meta.data.mimeType as string | undefined) || 'image/jpeg';
        const res = await drive.files.get(
          { fileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        const b64 = Buffer.from(res.data as ArrayBuffer).toString('base64');
        result[fileId] = `data:${mime};base64,${b64}`;
      } catch (err) {
        console.warn('[obtenerFotosParaPdf]', fileId, err);
      }
    })
  );

  return result;
}

export async function verificarAccesoDrive(folderId: string): Promise<VerificarDriveResult> {
  const normalizedId = folderId.trim();
  if (!normalizedId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const drive = await getDriveClient();
  const serviceAccountEmail = await getServiceAccountEmail();

  try {
    await assertRootFolderAccess(drive, normalizedId);
    const folder = await getFolderMetadata(drive, normalizedId);

    const testFileName = `_verificacion-gruasbacar-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    const created = await drive.files.create({
      requestBody: {
        name: testFileName,
        parents: [normalizedId],
      },
      media: {
        mimeType: 'text/plain',
        body: `Verificación OK — ${new Date().toISOString()}`,
      },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    });

    if (!created.data.id) {
      throw new HttpsError('internal', 'Drive respondió pero no devolvió el ID del archivo de prueba.');
    }

    return {
      ok: true,
      folderId: folder.id ?? normalizedId,
      folderName: folder.name ?? '(sin nombre)',
      testFileId: created.data.id,
      testFileName: created.data.name ?? testFileName,
      testFileUrl: created.data.webViewLink ?? `https://drive.google.com/file/d/${created.data.id}/view`,
      serviceAccountEmail,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[verificarAccesoDrive]', err);
    throw new HttpsError(
      'failed-precondition',
      driveErrorMessage(err, normalizedId, serviceAccountEmail)
    );
  }
}
