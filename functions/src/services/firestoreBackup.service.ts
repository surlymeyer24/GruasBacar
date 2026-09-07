import { gzipSync } from 'zlib';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { fechaCarpetaDrive } from '../utils/validators';
import { enEmulador, driveHabilitadoEnEmulador } from '../utils/entorno';
import { enviarEmail, obtenerEmailsAdminsActivos } from './email.service';
import { purgarCarpetasFechaDrive, subirArchivoPrivadoDrive } from './drive.service';

const db = () => admin.firestore();

const BACKUP_FOLDER = 'Backups';
const DIAS_RETENCION = 30;
const PAGE_SIZE = 200;

const COLECCIONES: Array<{ name: string; subs?: string[] }> = [
  { name: 'usuarios' },
  { name: 'gruas' },
  { name: 'corralones' },
  { name: 'duplas' },
  { name: 'contadores' },
  { name: 'carnets' },
  { name: 'itv' },
  { name: 'polizas' },
  { name: 'turnos' },
  { name: 'notificaciones' },
  { name: 'servicios', subs: ['eventos', 'versiones'] },
];

export interface BackupFirestoreResult {
  ok: true;
  generatedAt: string;
  fechaCarpeta: string;
  driveFileId: string;
  driveUrl: string;
  bytesGzip: number;
  counts: Record<string, number>;
  authUsers: number;
  purged: string[];
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (value instanceof admin.firestore.Timestamp) {
    return {
      __fs: 'Timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: value.toDate().toISOString(),
    };
  }

  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __fs: 'GeoPoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof admin.firestore.DocumentReference) {
    return { __fs: 'DocumentReference', path: value.path };
  }

  if (Buffer.isBuffer(value)) {
    return { __fs: 'Bytes', base64: value.toString('base64') };
  }

  if (Array.isArray(value)) return value.map(serializeValue);

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(nested);
    }
    return out;
  }

  return value;
}

async function exportQuery(
  query: admin.firestore.Query
): Promise<Array<{ id: string; data: unknown }>> {
  const docs: Array<{ id: string; data: unknown }> = [];
  let last: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let page = query.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      docs.push({ id: doc.id, data: serializeValue(doc.data()) });
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return docs;
}

async function exportCollection(
  name: string,
  subs: string[] = []
): Promise<{ docs: unknown[]; count: number }> {
  const top = await exportQuery(db().collection(name));
  let extra = 0;
  const docs = [];

  for (const doc of top) {
    const entry: { id: string; data: unknown; subs?: Record<string, unknown> } = {
      id: doc.id,
      data: doc.data,
    };

    if (subs.length > 0) {
      entry.subs = {};
      for (const sub of subs) {
        const subDocs = await exportQuery(
          db().collection(name).doc(doc.id).collection(sub)
        );
        entry.subs[sub] = subDocs;
        extra += subDocs.length;
      }
    }

    docs.push(entry);
  }

  return { docs, count: top.length + extra };
}

async function exportAuthUsers(): Promise<unknown[]> {
  const users: unknown[] = [];
  let pageToken: string | undefined;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    for (const user of result.users) {
      users.push({
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber ?? null,
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function notificarFallo(error: unknown): Promise<void> {
  try {
    const admins = await obtenerEmailsAdminsActivos();
    if (admins.length === 0) return;
    const detalle = error instanceof Error ? error.message : String(error);
    await enviarEmail({
      to: admins.map((a) => a.email),
      subject: '[Grúas BACAR] Falló el backup diario de Firestore',
      html: `
        <p>El backup automático de Firestore hacia Google Drive falló.</p>
        <p><strong>Error:</strong> ${detalle.replace(/</g, '&lt;')}</p>
        <p>Revisá los logs de la function <code>backupFirestoreDiario</code>.</p>
      `,
    });
  } catch (mailErr) {
    console.error('[firestoreBackup] no se pudo notificar el fallo por email', mailErr);
  }
}

export async function ejecutarBackupFirestore(rootFolderId: string): Promise<BackupFirestoreResult> {
  if (enEmulador() && !driveHabilitadoEnEmulador()) {
    throw new HttpsError(
      'failed-precondition',
      'Backup a Drive deshabilitado en emulador (no se toca el Drive de producción).'
    );
  }
  const folderId = rootFolderId.trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'GOOGLE_DRIVE_FOLDER_ID no está configurado.');
  }

  const generatedAt = new Date();
  const fechaCarpeta = fechaCarpetaDrive(generatedAt);
  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const counts: Record<string, number> = {};
  const collections: Record<string, unknown> = {};

  for (const col of COLECCIONES) {
    const exported = await exportCollection(col.name, col.subs);
    collections[col.name] = exported.docs;
    counts[col.name] = exported.count;
    console.log(`[firestoreBackup] ${col.name}: ${exported.count} docs`);
  }

  const authUsers = await exportAuthUsers();
  counts.auth = authUsers.length;

  const payload = {
    generatedAt: generatedAt.toISOString(),
    projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'gruasbacar',
    counts,
    collections,
    authUsers,
  };

  const gzip = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const relativePath = `${BACKUP_FOLDER}/${fechaCarpeta}/gruasbacar-firestore-${stamp}.json.gz`;

  const uploaded = await subirArchivoPrivadoDrive(
    folderId,
    relativePath,
    gzip,
    'application/gzip'
  );

  const manifest = Buffer.from(
    JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        file: `gruasbacar-firestore-${stamp}.json.gz`,
        bytesGzip: gzip.length,
        counts,
        retencionDias: DIAS_RETENCION,
        nota: 'Archivo gzip con JSON de colecciones Firestore + listado de Auth (sin contraseñas). No incluye fotos (están en Drive).',
      },
      null,
      2
    ),
    'utf8'
  );

  await subirArchivoPrivadoDrive(
    folderId,
    `${BACKUP_FOLDER}/${fechaCarpeta}/manifest.json`,
    manifest,
    'application/json'
  );

  const { purged } = await purgarCarpetasFechaDrive(folderId, [BACKUP_FOLDER], DIAS_RETENCION);

  return {
    ok: true,
    generatedAt: generatedAt.toISOString(),
    fechaCarpeta,
    driveFileId: uploaded.driveFileId,
    driveUrl: uploaded.url,
    bytesGzip: gzip.length,
    counts,
    authUsers: authUsers.length,
    purged,
  };
}

export async function ejecutarBackupFirestoreConAlerta(rootFolderId: string): Promise<BackupFirestoreResult> {
  try {
    const result = await ejecutarBackupFirestore(rootFolderId);
    console.log('[firestoreBackup] OK', result.driveFileId, result.bytesGzip, result.counts);
    return result;
  } catch (err) {
    console.error('[firestoreBackup] falló', err);
    await notificarFallo(err);
    throw err;
  }
}
