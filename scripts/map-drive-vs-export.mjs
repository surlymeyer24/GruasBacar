/**
 * Lista carpetas de servicios en Drive y las compara con el export JSON.
 * Uso: node scripts/map-drive-vs-export.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { requireProdFlag } from './lib/initFirebaseAdmin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { GoogleAuth } = require(
  require.resolve('google-auth-library', { paths: [require.resolve('firebase-admin')] }),
);
const admin = require('firebase-admin');

requireProdFlag(process.argv, 'map-drive-vs-export.mjs');

const ROOT = '0AArtffLAEpGgUk9PVA';
const sa = JSON.parse(
  readFileSync(join(__dirname, '../functions/src/auth/ServiceAccountKey.json'), 'utf8'),
);
const exportPath = join(__dirname, '../.backups/recovery-from-emulator/servicios.json');

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

async function driveGet(path, params = {}) {
  const client = await auth.getClient();
  const url = new URL('https://www.googleapis.com/drive/v3' + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await client.request({ url: url.toString() });
  return res.data;
}

async function listChildren(parentId) {
  const files = [];
  let pageToken;
  do {
    const data = await driveGet('/files', {
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'allDrives',
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

function isFolder(f) {
  return f.mimeType === 'application/vnd.google-apps.folder';
}

function looksLikeDate(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function parseServicioFolder(name) {
  // 2026-07-22_2698_AD326CV_000103
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(.+)_([A-Za-z0-9]+)_(\d{6})$/);
  if (!m) return null;
  return { fecha: m[1], legajo: m[2], patente: m[3], infraccion: m[4], name };
}

async function collectServicioFolders(dateFolder, fecha, depth = 0) {
  const out = [];
  const kids = (await listChildren(dateFolder.id)).filter(isFolder);
  for (const k of kids) {
    const parsed = parseServicioFolder(k.name);
    if (parsed) {
      out.push({ ...parsed, id: k.id, fechaCarpeta: fecha });
      continue;
    }
    if (looksLikeDate(k.name) && depth < 2) {
      const nested = await collectServicioFolders(k, k.name, depth + 1);
      out.push(...nested);
      continue;
    }
    out.push({
      fecha: fecha,
      fechaCarpeta: fecha,
      name: k.name,
      id: k.id,
      legajo: null,
      patente: null,
      infraccion: null,
    });
  }
  return out;
}

function fechaAR(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

async function main() {
  const rootMeta = await driveGet(`/files/${ROOT}`, {
    fields: 'id,name,mimeType,driveId',
    supportsAllDrives: true,
  });
  const top = await listChildren(ROOT);
  const gruas = top.find((f) => isFolder(f) && String(f.name).toLowerCase() === 'gruas');
  if (!gruas) {
    console.error('No encontré carpeta Gruas.');
    process.exit(1);
  }

  const dateFolders = (await listChildren(gruas.id)).filter((f) => isFolder(f) && looksLikeDate(f.name));
  dateFolders.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const driveServicios = [];
  for (const df of dateFolders) {
    const kids = await collectServicioFolders(df, df.name);
    console.log(df.name, kids.length);
    driveServicios.push(...kids);
  }

  const exported = JSON.parse(readFileSync(exportPath, 'utf8'));
  const exportByInf = new Map();
  const exportKeys = new Set();
  for (const d of exported) {
    const inf = String(d.data.numeroInfraccion || '').padStart(6, '0');
    const patente = String(d.data.patente || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const fecha = fechaAR(d.data.creadoEn?.iso);
    const key = `${fecha}|${inf}|${patente}`;
    exportKeys.add(key);
    if (!exportByInf.has(inf)) exportByInf.set(inf, []);
    exportByInf.get(inf).push({ id: d.id, fecha, patente, key });
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const prodSnap = await admin.firestore().collection('servicios').select('numeroInfraccion', 'patente', 'creadoEn').get();
  const prodKeys = new Set();
  const prodByInf = new Map();
  for (const d of prodSnap.docs) {
    const x = d.data();
    const inf = String(x.numeroInfraccion || '').padStart(6, '0');
    const patente = String(x.patente || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const fecha = x.creadoEn?.toDate
      ? x.creadoEn.toDate().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
      : null;
    const key = `${fecha}|${inf}|${patente}`;
    prodKeys.add(key);
    prodByInf.set(inf, true);
  }

  const matchedExport = [];
  const notInExport = [];
  for (const s of driveServicios) {
    const patente = String(s.patente || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const key = `${s.fecha}|${s.infraccion}|${patente}`;
    const inExport =
      (s.infraccion && exportKeys.has(key)) ||
      (s.infraccion && (exportByInf.get(s.infraccion) || []).some((e) => e.patente === patente));
    const inProd =
      (s.infraccion && prodKeys.has(key)) ||
      (s.infraccion && prodByInf.has(s.infraccion) && patente);
    const row = { ...s, inExport: !!inExport, inProd: !!inProd };
    if (inExport) matchedExport.push(row);
    else notInExport.push(row);
  }

  const porFecha = {};
  for (const s of notInExport) {
    const f = s.fechaCarpeta || s.fecha || 'sin-fecha';
    if (!porFecha[f]) porFecha[f] = { total: 0, noEnProd: 0 };
    porFecha[f].total++;
    if (!s.inProd) porFecha[f].noEnProd++;
  }

  const jul22 = driveServicios.filter((s) => (s.fechaCarpeta || s.fecha) === '2026-07-22');
  const noEnExportNiProd = notInExport.filter((s) => !s.inProd);

  const outDir = join(__dirname, '../.backups/recovery-from-emulator');
  mkdirSync(outDir, { recursive: true });
  const out = {
    driveServicios: driveServicios.length,
    exportActas: exported.length,
    matchedExport: matchedExport.length,
    enDriveNoEnExport: notInExport.length,
    enDriveNoEnExportNiProd: noEnExportNiProd.length,
    porFecha,
    jul22: jul22.map((s) => ({
      name: s.name,
      infraccion: s.infraccion,
      inExport: matchedExport.some((m) => m.id === s.id),
      inProd: notInExport.find((n) => n.id === s.id)?.inProd || matchedExport.some((m) => m.id === s.id),
    })),
    noEnExportNiProd: noEnExportNiProd.map((s) => ({
      fecha: s.fechaCarpeta || s.fecha,
      name: s.name,
      infraccion: s.infraccion,
    })),
  };
  writeFileSync(join(outDir, 'drive-no-en-export.json'), JSON.stringify(out, null, 2), 'utf8');

  console.log('\nServicios-carpeta en Drive:', driveServicios.length);
  console.log('Match con export:', matchedExport.length);
  console.log('En Drive y NO en export:', notInExport.length);
  console.log('De esas, tampoco en prod:', noEnExportNiProd.length);
  console.log('\nPor fecha (no en export / de esas tampoco en prod):');
  for (const f of Object.keys(porFecha).sort()) {
    const x = porFecha[f];
    console.log(' ', f, x.total, '/', x.noEnProd);
  }
  console.log('\n22/07 carpetas:', jul22.length);
  for (const s of jul22) console.log(' ', s.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
