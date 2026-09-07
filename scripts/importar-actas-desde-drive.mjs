/**
 * Reconstruye actas en Firestore enlazando fotos que ya están en Drive.
 * No vuelve a subir archivos. La ubicación queda pendiente (sin GPS).
 *
 * 1) Carpetas de Drive sin acta:
 *    node scripts/importar-actas-desde-drive.mjs --scan --desde 2026-07-01 --hasta 2026-07-31
 *
 * 2) Completar el CSV y simular:
 *    node scripts/importar-actas-desde-drive.mjs --csv actas-drive.csv
 *
 * 3) Escribir en producción:
 *    node scripts/importar-actas-desde-drive.mjs --csv actas-drive.csv --write
 *
 * CSV:
 *   fecha,hora,patente,legajo,enganchador,chofer,grua,infraccion,corralon,folderId
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
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

requireProdFlag(process.argv, 'importar-actas-desde-drive.mjs');

const ROOT_DEFAULT = process.env.GOOGLE_DRIVE_FOLDER_ID || '0AArtffLAEpGgUk9PVA';
const KEY_PATH = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
const OUT_DIR = join(__dirname, '../.backups');

const ETIQUETA_ALIAS = {
  DELANTERA: 'DELANTERA',
  DELANTERO: 'DELANTERA',
  FRENTE: 'DELANTERA',
  LADO_DERECHO: 'LADO_DERECHO',
  DERECHO: 'LADO_DERECHO',
  DERECHA: 'LADO_DERECHO',
  COPILOTO: 'LADO_DERECHO',
  LADO_IZQUIERDO: 'LADO_IZQUIERDO',
  IZQUIERDO: 'LADO_IZQUIERDO',
  IZQUIERDA: 'LADO_IZQUIERDO',
  PILOTO: 'LADO_IZQUIERDO',
  TRASERA: 'TRASERA',
  TRASERO: 'TRASERA',
  DETRAS: 'TRASERA',
  OBSERVACION: 'OBSERVACION',
  ADICIONAL: 'OBSERVACION',
  EXTRA: 'OBSERVACION',
};

const args = parseArgs(process.argv.slice(2));

if (!existsSync(KEY_PATH)) {
  console.error('No se encontró functions/src/auth/ServiceAccountKey.json');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

function parseArgs(argv) {
  const out = {
    scan: false,
    write: false,
    yes: false,
    help: false,
    csv: null,
    desde: null,
    hasta: null,
    out: null,
    root: ROOT_DEFAULT,
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan') out.scan = true;
    else if (a === '--write') out.write = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--csv') out.csv = argv[++i];
    else if (a === '--desde') out.desde = argv[++i];
    else if (a === '--hasta') out.hasta = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Uso:
  node scripts/importar-actas-desde-drive.mjs --scan [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD]
  node scripts/importar-actas-desde-drive.mjs --csv archivo.csv [--write]

No re-sube fotos: crea el acta con driveFileId de los archivos existentes.
La ubicación queda como PENDIENTE.`);
}

async function driveGet(path, params = {}) {
  const client = await auth.getClient();
  const url = new URL('https://www.googleapis.com/drive/v3' + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
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
      fields: 'nextPageToken, files(id,name,mimeType,createdTime)',
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

function isImage(f) {
  if ((f.mimeType || '').startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic)$/i.test(f.name || '');
}

function looksLikeDate(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function parseServicioFolder(name) {
  const m = String(name || '').match(/^(\d{4}-\d{2}-\d{2})_(.+)_([A-Za-z0-9]+)(?:_(\d{6}))?$/);
  if (!m) return null;
  return {
    fecha: m[1],
    legajo: m[2],
    patente: m[3].toUpperCase(),
    infraccion: m[4] || null,
    name,
  };
}

function normalizarPatente(raw) {
  const clean = String(raw || '').replace(/[\s-]/g, '').toUpperCase();
  if (clean === 'SN' || clean === 'SIN') return 'S/N';
  return clean;
}

function buildIdentificador(infraccion, legajo, patente) {
  const inf = String(infraccion || '').trim();
  const leg = String(legajo || '').trim().replace(/\//g, '');
  const pat = String(patente || '').trim().replace(/\//g, '');
  return inf ? `${inf}-${leg}-${pat}` : `${leg}-${pat}`;
}

function fechaAR(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }
  if (value.iso) {
    return new Date(value.iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value.slice(0, 10);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }
  return null;
}

function parseHoraFecha(fecha, hora) {
  const h = String(hora || '12:00').trim();
  const hhmm = /^\d{1,2}:\d{2}$/.test(h) ? (h.length === 4 ? `0${h}` : h) : '12:00';
  const d = new Date(`${fecha}T${hhmm}:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const alias = {
    fecha: 'fecha',
    date: 'fecha',
    hora: 'hora',
    time: 'hora',
    patente: 'patente',
    legajo: 'legajo',
    legajo_enganchador: 'legajo',
    enganchador: 'enganchador',
    nombre_enganchador: 'enganchador',
    chofer: 'chofer',
    grua: 'grua',
    grua_patente: 'grua',
    infraccion: 'infraccion',
    numero_infraccion: 'infraccion',
    acta: 'infraccion',
    corralon: 'corralon',
    folderid: 'folderId',
    folder_id: 'folderId',
    drive_folder_id: 'folderId',
  };
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      const key = alias[h.replace(/\s+/g, '_')];
      if (key) row[key] = (cols[i] || '').trim();
    });
    return row;
  });
}

function inferEtiqueta(fileName) {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .toUpperCase();
  const parts = base.split(/_+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const slice = parts.slice(Math.max(0, i - 1), i + 1).join('_');
    if (ETIQUETA_ALIAS[slice]) return ETIQUETA_ALIAS[slice];
    if (ETIQUETA_ALIAS[parts[i]]) return ETIQUETA_ALIAS[parts[i]];
  }
  return 'OBSERVACION';
}

function inferCarpeta(fileName, parentFolderName) {
  const n = `${parentFolderName || ''} ${fileName || ''}`.toLowerCase();
  if (/(^|_)ds(_|$)|desenganche/.test(n)) return 'desenganche';
  if (/(^|_)en(_|$)|enganche/.test(n)) return 'enganche';
  if (/^ds[_-]/i.test(fileName || '')) return 'desenganche';
  if (/^en[_-]/i.test(fileName || '')) return 'enganche';
  return 'enganche';
}

function fotoUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

async function collectServicioFolders(dateFolder, fecha, depth = 0) {
  const out = [];
  const kids = (await listChildren(dateFolder.id)).filter(isFolder);
  for (const k of kids) {
    const parsed = parseServicioFolder(k.name);
    if (parsed) {
      out.push({ ...parsed, id: k.id, fechaCarpeta: fecha, createdTime: k.createdTime });
      continue;
    }
    if (looksLikeDate(k.name) && depth < 2) {
      out.push(...(await collectServicioFolders(k, k.name, depth + 1)));
    }
  }
  return out;
}

async function findGruasFolder(rootId) {
  const rootMeta = await driveGet(`/files/${rootId}`, {
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  });
  if (String(rootMeta.name || '').toLowerCase() === 'gruas') return rootMeta;
  const top = await listChildren(rootId);
  const gruas = top.find((f) => isFolder(f) && String(f.name).toLowerCase() === 'gruas');
  if (!gruas) throw new Error('No encontré la carpeta Gruas en Drive.');
  return gruas;
}

async function scanDriveFolders({ desde, hasta, limit }) {
  const gruas = await findGruasFolder(args.root);
  const dateFolders = (await listChildren(gruas.id))
    .filter((f) => isFolder(f) && looksLikeDate(f.name))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const selected = dateFolders.filter((f) => {
    if (desde && f.name < desde) return false;
    if (hasta && f.name > hasta) return false;
    return true;
  });
  const servicios = [];
  for (const df of selected) {
    const kids = await collectServicioFolders(df, df.name);
    console.log(`  Drive ${df.name}: ${kids.length} carpetas`);
    servicios.push(...kids);
    if (servicios.length >= limit) break;
  }
  return servicios.slice(0, limit);
}

async function listarFotosDeCarpeta(folderId) {
  const children = await listChildren(folderId);
  const fotos = [];
  for (const child of children) {
    if (isFolder(child)) {
      const nested = (await listChildren(child.id)).filter(isImage);
      for (const f of nested) {
        fotos.push({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime,
          carpeta: inferCarpeta(f.name, child.name),
          etiqueta: inferEtiqueta(f.name),
        });
      }
      continue;
    }
    if (!isImage(child)) continue;
    fotos.push({
      id: child.id,
      name: child.name,
      createdTime: child.createdTime,
      carpeta: inferCarpeta(child.name, ''),
      etiqueta: inferEtiqueta(child.name),
    });
  }
  return fotos;
}

function fotosParaEvento(fotos, carpeta) {
  const required = ['DELANTERA', 'LADO_DERECHO', 'LADO_IZQUIERDO', 'TRASERA'];
  const list = fotos.filter((f) => f.carpeta === carpeta);
  const used = new Set();
  const assigned = [];
  for (const tag of required) {
    const idx = list.findIndex((f, i) => !used.has(i) && f.etiqueta === tag);
    if (idx < 0) continue;
    used.add(idx);
    assigned.push(list[idx]);
  }
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    const f = list[i];
    const missing = required.find((t) => !assigned.some((a) => a.etiqueta === t));
    assigned.push(missing && f.etiqueta === 'OBSERVACION' ? { ...f, etiqueta: missing } : f);
    used.add(i);
  }
  return assigned.map((f) => ({
    url: fotoUrl(f.id),
    driveFileId: f.id,
    etiqueta: f.etiqueta,
  }));
}

async function loadCatalogos() {
  const [usuariosSnap, gruasSnap, corralonesSnap, turnosSnap, duplasSnap] = await Promise.all([
    db.collection('usuarios').get(),
    db.collection('gruas').get(),
    db.collection('corralones').get(),
    db.collection('turnos').get(),
    db.collection('duplas').get(),
  ]);
  const usuarios = usuariosSnap.docs.map((d) => ({ ...d.data(), uid: d.id }));
  const byLegajo = new Map();
  for (const u of usuarios) {
    const key = String(u.legajo || '').trim().toLowerCase();
    if (key) byLegajo.set(key, u);
  }
  const gruas = new Map();
  for (const d of gruasSnap.docs) {
    const data = d.data();
    const patente = normalizarPatente(data.patente || String(d.id).replace(/^G-/i, ''));
    const row = { id: d.id, ...data, patente };
    gruas.set(patente, row);
    gruas.set(d.id, row);
  }
  return {
    usuarios,
    byLegajo,
    gruas,
    corralones: corralonesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    turnos: turnosSnap.docs.map((d) => d.data()),
    duplas: duplasSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function loadServiciosIndex() {
  const snap = await db
    .collection('servicios')
    .select('patente', 'numeroInfraccion', 'legajoChofer', 'creadoEn', 'identificadorCompuesto')
    .get();
  const byId = new Set(snap.docs.map((d) => d.id));
  const byInfPat = new Set();
  const byFechaLegPat = new Set();
  for (const d of snap.docs) {
    const x = d.data();
    const inf = String(x.numeroInfraccion || '').padStart(6, '0');
    const pat = normalizarPatente(x.patente);
    const fecha = fechaAR(x.creadoEn);
    const leg = String(x.legajoChofer || '').trim();
    byInfPat.add(`${inf}|${pat}`);
    if (fecha) byFechaLegPat.add(`${fecha}|${leg}|${pat}`);
  }
  return { byId, byInfPat, byFechaLegPat, count: snap.size };
}

function lookupTurno(catalogos, fecha, legajo) {
  const key = String(legajo || '').trim().toLowerCase();
  if (!key || !fecha) return null;
  return (
    catalogos.turnos.find((t) => {
      if (t.fecha !== fecha) return false;
      const legs = [t.legajoEnganchador, t.legajoChofer, t.operadorLegajo]
        .map((v) => String(v || '').trim().toLowerCase());
      return legs.includes(key);
    }) || null
  );
}

function lookupDupla(catalogos, legajo, nombre) {
  const key = String(legajo || '').trim().toLowerCase();
  const nom = String(nombre || '').trim().toLowerCase();
  return (
    catalogos.duplas.find((d) => {
      const legs = [d.legajoEnganchador, d.legajoChofer].map((v) => String(v || '').trim().toLowerCase());
      if (key && legs.includes(key)) return true;
      return nom && String(d.enganchador || '').trim().toLowerCase() === nom;
    }) || null
  );
}

function resolverFila(row, folder, catalogos) {
  const fecha = row.fecha || folder?.fecha || folder?.fechaCarpeta || '';
  const patente = normalizarPatente(row.patente || folder?.patente);
  const legajo = String(row.legajo || folder?.legajo || '').trim();
  const infraccionRaw = String(row.infraccion || folder?.infraccion || '').trim();
  const infraccion = infraccionRaw ? infraccionRaw.padStart(6, '0') : '';
  const usuario = catalogos.byLegajo.get(legajo.toLowerCase()) || null;
  const turno = lookupTurno(catalogos, fecha, legajo);
  const duplaCat = lookupDupla(catalogos, legajo, row.enganchador || usuario?.nombre);
  const enganchador =
    row.enganchador || usuario?.nombre || turno?.duplaEnganchador || duplaCat?.enganchador || '';
  const chofer = row.chofer || turno?.duplaChofer || duplaCat?.chofer || '';
  const gruaRaw = row.grua || turno?.gruaPatente || duplaCat?.gruaId || '';
  const gruaPatente = normalizarPatente(String(gruaRaw).replace(/^G-/i, ''));
  const grua = catalogos.gruas.get(gruaPatente) || catalogos.gruas.get(`G-${gruaPatente}`) || null;
  let corralonNombre = row.corralon || '';
  let corralonId = null;
  if (corralonNombre) {
    const hit = catalogos.corralones.find(
      (c) => String(c.nombre || '').toLowerCase() === corralonNombre.toLowerCase() || c.id === corralonNombre,
    );
    if (hit) {
      corralonNombre = hit.nombre;
      corralonId = hit.id;
    }
  }
  const choferUser = catalogos.usuarios.find(
    (u) => String(u.nombre || '').trim().toLowerCase() === String(chofer).trim().toLowerCase(),
  );
  return {
    fecha,
    hora: row.hora || '',
    patente,
    legajo,
    infraccion,
    enganchador,
    chofer,
    gruaId: grua ? (String(grua.id).startsWith('G-') ? grua.id : `G-${grua.patente}`) : gruaPatente ? `G-${gruaPatente}` : '',
    gruaPatente,
    tipoFlota: grua?.tipo || turno?.tipoFlota || duplaCat?.tipo || 'TRANSITO',
    corralonNombre,
    corralonId,
    folderId: row.folderId || folder?.id || '',
    folderName: folder?.name || '',
    uidEnganchador: usuario?.uid || turno?.operadorUid || '',
    uidChofer: choferUser?.uid || '',
    legajoChoferDupla: turno?.legajoChofer || duplaCat?.legajoChofer || choferUser?.legajo || '',
  };
}

function problemasDeFila(row) {
  const p = [];
  if (!row.fecha) p.push('falta fecha');
  if (!row.patente) p.push('falta patente');
  if (!row.legajo) p.push('falta legajo');
  if (!row.enganchador) p.push('falta nombre enganchador');
  if (!row.chofer) p.push('falta chofer (completar CSV o turno de ese día)');
  if (!row.gruaId) p.push('falta grúa');
  if (!row.folderId) p.push('falta carpeta Drive');
  if (!row.infraccion) p.push('falta n° de infracción');
  return p;
}

function yaExiste(index, row) {
  const inf = String(row.infraccion || '').padStart(6, '0');
  const id = inf && row.legajo && row.patente ? buildIdentificador(inf, row.legajo, row.patente) : '';
  if (id && index.byId.has(id)) return true;
  if (inf && row.patente && index.byInfPat.has(`${inf}|${row.patente}`)) return true;
  if (row.fecha && row.legajo && row.patente && index.byFechaLegPat.has(`${row.fecha}|${row.legajo}|${row.patente}`)) {
    return true;
  }
  return false;
}

function confirmar(pregunta) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(pregunta, (answer) => {
      rl.close();
      resolve(/^s(i|í)?$/i.test(String(answer).trim()));
    });
  });
}

async function importarFila(row, fotos, ts, write) {
  const infraccion = String(row.infraccion).padStart(6, '0');
  const id = buildIdentificador(infraccion, row.legajo, row.patente);
  const enganche = fotosParaEvento(fotos, 'enganche');
  const desenganche = fotosParaEvento(fotos, 'desenganche');
  const totalFotos = enganche.length + desenganche.length;
  const estado = desenganche.length > 0 ? 'DESENGANCHADO' : 'ENGANCHADO';
  const tsFin = desenganche.length > 0
    ? admin.firestore.Timestamp.fromDate(new Date(ts.toDate().getTime() + 30 * 60 * 1000))
    : null;
  const dupla = { chofer: row.chofer, enganchador: row.enganchador };
  if (row.legajoChoferDupla) dupla.legajoChofer = row.legajoChoferDupla;
  if (row.legajo) dupla.legajoEnganchador = row.legajo;
  if (row.uidChofer) dupla.uidChofer = row.uidChofer;
  if (row.uidEnganchador) dupla.uidEnganchador = row.uidEnganchador;
  const payload = { id, infraccion, estado, totalFotos, enganche: enganche.length, desenganche: desenganche.length };
  if (!write) return payload;

  const obs = 'Acta reconstruida desde fotos de Drive. Ubicación pendiente.';
  const ref = db.collection('servicios').doc(id);
  const batch = db.batch();
  const doc = {
    patente: row.patente,
    numeroInfraccion: infraccion,
    identificadorCompuesto: id,
    estado,
    grua: row.gruaId,
    gruaDocId: row.gruaId,
    tipoFlota: row.tipoFlota,
    corralon: row.corralonNombre || null,
    corralonId: row.corralonId || null,
    creadoPor: row.uidEnganchador || 'import-drive',
    legajoChofer: row.legajo,
    dupla,
    origenManual: true,
    creadoEn: ts,
    versionCount: 1,
    totalFotos,
    ultimaEdicionPor: 'import-drive',
    ultimaEdicionEn: ts,
  };
  if (tsFin) doc.finalizadoEn = tsFin;
  batch.set(ref, doc);

  const eventos = ref.collection('eventos');
  batch.set(eventos.doc(), {
    tipo: 'ENGANCHE',
    timestamp: ts,
    ubicacionReferencia: 'PENDIENTE',
    fotos: enganche,
    observacionGeneral: obs,
  });
  batch.set(eventos.doc(), { tipo: 'TRASLADO', timestamp: ts });
  if (row.corralonNombre) {
    batch.set(eventos.doc(), {
      tipo: 'LLEGADA_CORRALON',
      timestamp: tsFin || ts,
      corralon: row.corralonNombre,
    });
  }
  if (desenganche.length > 0) {
    batch.set(eventos.doc(), {
      tipo: 'DESENGANCHE',
      timestamp: tsFin || ts,
      fotos: desenganche,
      observacionGeneral: obs,
    });
  }
  batch.set(ref.collection('versiones').doc(), {
    version: 1,
    tipo: 'CREACION_MANUAL',
    editadoEn: ts,
    editadoPorUid: 'import-drive',
    editadoPorNombre: 'Importación Drive',
    editadoPorRol: 'ADMIN',
    motivo: 'Reconstrucción desde carpeta de fotos en Drive',
    cambios: [{ campo: 'origen', etiqueta: 'Origen', valorAnterior: null, valorNuevo: 'Importación Drive' }],
  });
  await batch.commit();
  return payload;
}

async function maybeBumpCounter(maxInfraccion) {
  const n = Number(maxInfraccion);
  if (!Number.isFinite(n) || n <= 0) return;
  const ref = db.collection('contadores').doc('actas');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ultimo = snap.data()?.ultimo ?? 0;
    if (n > ultimo) tx.set(ref, { ultimo: n }, { merge: true });
  });
}

async function runScan() {
  console.log('Escaneando Drive vs Firestore...\n');
  const [folders, index, catalogos] = await Promise.all([
    scanDriveFolders({ desde: args.desde, hasta: args.hasta, limit: args.limit }),
    loadServiciosIndex(),
    loadCatalogos(),
  ]);
  console.log(`\nCarpetas Drive: ${folders.length}. Actas en Firestore: ${index.count}.`);
  const rows = [];
  for (const folder of folders) {
    const resolved = resolverFila({}, folder, catalogos);
    if (yaExiste(index, resolved)) continue;
    rows.push(resolved);
  }
  const header = 'fecha,hora,patente,legajo,enganchador,chofer,grua,infraccion,corralon,folderId';
  const lines = [
    header,
    ...rows.map((r) =>
      [r.fecha, r.hora, r.patente, r.legajo, r.enganchador, r.chofer, r.gruaPatente, r.infraccion, r.corralonNombre, r.folderId]
        .map(csvEscape)
        .join(','),
    ),
  ];
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = args.out || join(OUT_DIR, 'actas-drive-faltantes.csv');
  writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nSin acta en BD: ${rows.length}`);
  console.log(`CSV: ${outPath}`);
  console.log('Completá hora / chofer / grúa si vinieron vacíos y corré --csv o --csv --write.');
}

async function runCsv() {
  const rawRows = parseCsv(readFileSync(args.csv, 'utf8'));
  if (rawRows.length === 0) {
    console.error('CSV vacío o sin datos.');
    process.exit(1);
  }
  const [index, catalogos] = await Promise.all([loadServiciosIndex(), loadCatalogos()]);
  const report = { ok: [], skipped: [], errors: [] };
  let maxInf = 0;
  console.log(args.write ? 'MODO ESCRITURA\n' : 'DRY-RUN (no escribe). Pasá --write para crear las actas.\n');
  if (args.write && !args.yes) {
    const ok = await confirmar(`Esto va a crear actas en PRODUCCIÓN (${rawRows.length} filas). ¿Continuar? (si/no) `);
    if (!ok) {
      console.log('Cancelado.');
      process.exit(0);
    }
  }
  for (const raw of rawRows.slice(0, args.limit)) {
    const folder = raw.folderId
      ? {
          id: raw.folderId,
          name: '',
          fecha: raw.fecha,
          patente: raw.patente,
          legajo: raw.legajo,
          infraccion: raw.infraccion,
        }
      : null;
    const row = resolverFila(raw, folder, catalogos);
    if (yaExiste(index, row)) {
      report.skipped.push({ patente: row.patente, infraccion: row.infraccion, motivo: 'ya existe' });
      continue;
    }
    const issues = problemasDeFila(row);
    if (issues.length) {
      report.errors.push({ patente: row.patente, issues });
      console.log(`  ✗ ${row.fecha || '?'} ${row.patente || '?'}: ${issues.join('; ')}`);
      continue;
    }
    const fotos = await listarFotosDeCarpeta(row.folderId);
    if (fotos.length === 0) {
      report.errors.push({ patente: row.patente, issues: ['carpeta Drive sin fotos'] });
      console.log(`  ✗ ${row.patente}: carpeta sin fotos`);
      continue;
    }
    const createdFromFoto = fotos.map((f) => f.createdTime).filter(Boolean).sort()[0];
    const hora = row.hora || (createdFromFoto
      ? new Date(createdFromFoto).toLocaleTimeString('en-GB', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '12:00');
    const when = parseHoraFecha(row.fecha, hora);
    if (!when) {
      report.errors.push({ patente: row.patente, issues: ['fecha/hora inválida'] });
      continue;
    }
    try {
      const ts = admin.firestore.Timestamp.fromDate(when);
      const created = await importarFila(row, fotos, ts, args.write);
      report.ok.push({ ...created, hora, fotos: fotos.length });
      maxInf = Math.max(maxInf, Number(created.infraccion) || 0);
      index.byId.add(created.id);
      console.log(`  ${args.write ? '✓' : '·'} ${created.id}  En:${created.enganche} Ds:${created.desenganche}  ${hora}`);
    } catch (err) {
      report.errors.push({ patente: row.patente, issues: [err.message] });
      console.log(`  ✗ ${row.patente}: ${err.message}`);
    }
  }
  if (args.write && maxInf > 0) await maybeBumpCounter(maxInf);
  mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = join(OUT_DIR, `import-drive-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nOK: ${report.ok.length}  omitidas: ${report.skipped.length}  errores: ${report.errors.length}`);
  console.log(`Reporte: ${reportPath}`);
}

async function main() {
  if (args.help || (!args.scan && !args.csv)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }
  if (args.scan) await runScan();
  if (args.csv) await runCsv();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
