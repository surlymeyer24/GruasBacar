import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  sanitizePathPart,
  buildCarpetaPatenteInfraccion,
  fechaCarpetaDrive,
} from '../utils/validators';

function db() {
  return admin.firestore();
}

type DriveClient = ReturnType<typeof import('googleapis')['google']['drive']>;

interface FotoRef {
  driveFileId: string;
  carpeta: 'enganche' | 'desenganche';
}

interface MigrationResult {
  totalServicios: number;
  totalFotos: number;
  moved: number;
  alreadyCorrect: number;
  errors: number;
  notFound: number;
  details: Array<{
    servicioId: string;
    driveFileId: string;
    action: 'moved' | 'already_correct' | 'error' | 'not_found';
    from?: string;
    to?: string;
    error?: string;
  }>;
}

async function getDriveClient(): Promise<DriveClient> {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

const folderIdCache = new Map<string, string>();
const folderNameCache = new Map<string, string>();

async function getFileParents(
  drive: DriveClient,
  fileIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const BATCH = 5;
  for (let i = 0; i < fileIds.length; i += BATCH) {
    const batch = fileIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (fileId) => {
        try {
          const res = await drive.files.get({
            fileId,
            fields: 'id,parents',
            supportsAllDrives: true,
          });
          return { fileId, parentId: res.data.parents?.[0] ?? null };
        } catch {
          return { fileId, parentId: null };
        }
      })
    );
    for (const r of results) {
      if (r.parentId) result.set(r.fileId, r.parentId);
    }
  }
  return result;
}

async function findChildFolder(
  drive: DriveClient,
  parentId: string,
  name: string
): Promise<string | null> {
  const cacheKey = `${parentId}/${name}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  const escaped = name.replace(/'/g, "\\'");
  const q = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const id = res.data.files?.[0]?.id ?? null;
  if (id) folderIdCache.set(cacheKey, id);
  return id;
}

async function getOrCreateFolder(
  drive: DriveClient,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`No se pudo crear carpeta "${name}"`);
  const cacheKey = `${parentId}/${name}`;
  folderIdCache.set(cacheKey, created.data.id);
  return created.data.id;
}

async function ensureFolderPath(
  drive: DriveClient,
  rootFolderId: string,
  rootFolderName: string,
  segments: string[]
): Promise<string> {
  const fullKey = segments.join('/');
  const cached = folderIdCache.get(`path:${fullKey}`);
  if (cached) return cached;

  let normalized = segments;
  if (segments[0]?.toLowerCase() === 'gruas' && rootFolderName === 'gruas') {
    normalized = segments.slice(1);
  }
  let parentId = rootFolderId;
  for (const segment of normalized) {
    parentId = await getOrCreateFolder(drive, parentId, segment);
  }
  folderIdCache.set(`path:${fullKey}`, parentId);
  return parentId;
}

async function getFolderName(
  drive: DriveClient,
  folderId: string
): Promise<string> {
  const cached = folderNameCache.get(folderId);
  if (cached) return cached;
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'name',
      supportsAllDrives: true,
    });
    const name = res.data.name ?? '?';
    folderNameCache.set(folderId, name);
    return name;
  } catch {
    return '?';
  }
}

async function legajoParaServicio(
  servicio: FirebaseFirestore.DocumentData
): Promise<string | null> {
  const legajo = servicio.legajoChofer as string | undefined;
  if (legajo?.trim()) return legajo.trim();
  const creadoPor = servicio.creadoPor as string | undefined;
  if (creadoPor) {
    const snap = await db().collection('usuarios').doc(creadoPor).get();
    const legajoUsuario = snap.data()?.legajo as string | undefined;
    if (legajoUsuario?.trim()) return legajoUsuario.trim();
  }
  return null;
}

function extractFotosFromEventos(
  eventos: FirebaseFirestore.QuerySnapshot
): FotoRef[] {
  const fotos: FotoRef[] = [];
  for (const doc of eventos.docs) {
    const data = doc.data();
    const tipo = data.tipo as string;
    const carpeta: 'enganche' | 'desenganche' =
      tipo === 'DESENGANCHE' ? 'desenganche' : 'enganche';
    const fotosArr = data.fotos as Array<{ driveFileId?: string }> | undefined;
    if (!Array.isArray(fotosArr)) continue;
    for (const f of fotosArr) {
      if (f.driveFileId?.trim()) {
        fotos.push({ driveFileId: f.driveFileId.trim(), carpeta });
      }
    }
  }
  return fotos;
}

export async function migrarCarpetasDrive(
  rootFolderId: string,
  dryRun: boolean
): Promise<MigrationResult> {
  const folderId = rootFolderId.trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const drive = await getDriveClient();
  const rootFolderName = await getFolderName(drive, folderId);
  folderNameCache.set(folderId, rootFolderName);

  const result: MigrationResult = {
    totalServicios: 0,
    totalFotos: 0,
    moved: 0,
    alreadyCorrect: 0,
    errors: 0,
    notFound: 0,
    details: [],
  };

  const serviciosSnap = await db().collection('servicios').get();
  result.totalServicios = serviciosSnap.size;
  console.log(`[migración] ${serviciosSnap.size} servicios a procesar`);

  for (const servicioDoc of serviciosSnap.docs) {
    const servicio = servicioDoc.data();
    const servicioId = servicioDoc.id;

    const legajo = await legajoParaServicio(servicio);
    if (!legajo) continue;

    const patente = servicio.patente as string | undefined;
    if (!patente) continue;

    const numeroInfraccion = servicio.numeroInfraccion as string | undefined;
    const fechaServicio = servicio.creadoEn;

    const eventosSnap = await db()
      .collection('servicios')
      .doc(servicioId)
      .collection('eventos')
      .get();

    const fotos = extractFotosFromEventos(eventosSnap);
    if (fotos.length === 0) continue;

    const fechaStr = fechaCarpetaDrive(fechaServicio);
    const legajoSafe = sanitizePathPart(legajo);
    const servicioSafe = buildCarpetaPatenteInfraccion(patente, numeroInfraccion);

    // Resolver carpetas correctas (enganche/desenganche) una sola vez por servicio
    const correctParentIds: Record<string, string> = {};
    for (const carpeta of ['enganche', 'desenganche'] as const) {
      const segments = ['Gruas', fechaStr, legajoSafe, servicioSafe, carpeta];
      correctParentIds[carpeta] = await ensureFolderPath(
        drive, folderId, rootFolderName.trim().toLowerCase(), segments
      );
    }

    // Obtener parents actuales en batch
    const fileIds = fotos.map((f) => f.driveFileId);
    const currentParents = await getFileParents(drive, fileIds);

    for (const foto of fotos) {
      result.totalFotos++;
      const currentParentId = currentParents.get(foto.driveFileId);

      if (!currentParentId) {
        result.notFound++;
        result.details.push({
          servicioId,
          driveFileId: foto.driveFileId,
          action: 'not_found',
        });
        continue;
      }

      const correctParentId = correctParentIds[foto.carpeta];

      if (currentParentId === correctParentId) {
        result.alreadyCorrect++;
        result.details.push({
          servicioId,
          driveFileId: foto.driveFileId,
          action: 'already_correct',
        });
        continue;
      }

      try {
        const fromName = await getFolderName(drive, currentParentId);
        const toPath = `${fechaStr}/${legajoSafe}/${servicioSafe}/${foto.carpeta}`;

        if (!dryRun) {
          await drive.files.update({
            fileId: foto.driveFileId,
            addParents: correctParentId,
            removeParents: currentParentId,
            supportsAllDrives: true,
          });
        }

        result.moved++;
        result.details.push({
          servicioId,
          driveFileId: foto.driveFileId,
          action: 'moved',
          from: fromName,
          to: toPath,
        });
      } catch (err) {
        result.errors++;
        result.details.push({
          servicioId,
          driveFileId: foto.driveFileId,
          action: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(`[migración] servicio ${servicioId}: ${fotos.length} fotos procesadas`);
  }

  return result;
}
