/**
 * Migra campos legacy en Firestore:
 *   - usuarios: `rol` (string) → `roles` (array), luego borra `rol`
 *   - servicios: `fechaCreacion` → `creadoEn`, luego borra `fechaCreacion`
 *
 * Uso:
 *   node scripts/migrar-rol-fecha.mjs              # simulación
 *   node scripts/migrar-rol-fecha.mjs --apply      # ejecutar
 *   node scripts/migrar-rol-fecha.mjs --emulator --apply
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const useEmulator = process.argv.includes('--emulator');
const dryRun = !process.argv.includes('--apply');

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'gruasbacar' });
} else {
  const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
  if (!existsSync(keyPath)) {
    console.error('No se encontró functions/src/auth/ServiceAccountKey.json');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const ROLES_VALIDOS = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'VISOR', 'CHOFER', 'ENGANCHADOR'];

function normalizeRol(rol) {
  const key = typeof rol === 'string' ? rol.trim().toUpperCase() : '';
  if (key === 'AYUDANTE') return 'ENGANCHADOR';
  if (ROLES_VALIDOS.includes(key)) return key;
  return 'ENGANCHADOR';
}

function mergeRoles(rolesArr, legacyRol) {
  const set = new Set();
  if (Array.isArray(rolesArr)) {
    for (const r of rolesArr) set.add(normalizeRol(r));
  }
  if (legacyRol) {
    set.add(normalizeRol(legacyRol));
  }
  if (set.size === 0) set.add('ENGANCHADOR');
  return [...set];
}

async function migrateUsuario(docSnap) {
  const uid = docSnap.id;
  const data = docSnap.data() ?? {};
  const tieneRol = 'rol' in data;
  const tieneRoles = 'roles' in data && Array.isArray(data.roles);

  if (!tieneRol) {
    return { uid, status: 'ok', reason: 'Sin campo legacy rol' };
  }

  const merged = mergeRoles(tieneRoles ? data.roles : undefined, data.rol);

  if (tieneRoles) {
    const current = data.roles.map(r => normalizeRol(r)).sort();
    const mergedSorted = [...merged].sort();
    const sameContent = current.length === mergedSorted.length &&
      current.every((v, i) => v === mergedSorted[i]);

    if (sameContent) {
      if (dryRun) {
        return { uid, status: 'simulado', reason: `Borrar rol="${data.rol}" (roles ya contiene lo mismo)` };
      }
      await docSnap.ref.update({ rol: FieldValue.delete() });
      return { uid, status: 'migrado', reason: `Borrado rol="${data.rol}" (roles ya contenía lo mismo)` };
    }
  }

  if (dryRun) {
    return {
      uid,
      status: 'simulado',
      reason: tieneRoles
        ? `Mergear rol="${data.rol}" + roles=[${data.roles}] → [${merged}], borrar rol`
        : `Crear roles=[${merged}] desde rol="${data.rol}", borrar rol`,
    };
  }

  await docSnap.ref.update({
    roles: merged,
    rol: FieldValue.delete(),
  });

  return {
    uid,
    status: 'migrado',
    reason: tieneRoles
      ? `Mergeado rol="${data.rol}" + roles → [${merged}]`
      : `Creado roles=[${merged}] desde rol="${data.rol}"`,
  };
}

async function migrateServicio(docSnap) {
  const id = docSnap.id;
  const data = docSnap.data() ?? {};
  const tieneFechaCreacion = 'fechaCreacion' in data;
  const tieneCreadoEn = 'creadoEn' in data && data.creadoEn != null;

  if (!tieneFechaCreacion) {
    return { id, status: 'ok', reason: 'Sin campo legacy fechaCreacion' };
  }

  if (tieneCreadoEn) {
    if (dryRun) {
      return { id, status: 'simulado', reason: 'Borrar fechaCreacion (creadoEn ya existe)' };
    }
    await docSnap.ref.update({ fechaCreacion: FieldValue.delete() });
    return { id, status: 'migrado', reason: 'Borrado fechaCreacion (creadoEn ya existía)' };
  }

  if (dryRun) {
    return { id, status: 'simulado', reason: `Copiar fechaCreacion → creadoEn, borrar fechaCreacion` };
  }

  await docSnap.ref.update({
    creadoEn: data.fechaCreacion,
    fechaCreacion: FieldValue.delete(),
  });

  return { id, status: 'migrado', reason: 'Copiado fechaCreacion → creadoEn' };
}

function printResults(label, results) {
  console.log(`\n--- ${label} ---\n`);
  for (const r of results) {
    const key = r.uid ?? r.id;
    console.log(`  ${r.status.toUpperCase()}: ${key}`);
    if (r.reason) console.log(`    ${r.reason}`);
  }
  const migrados = results.filter(r => r.status === 'migrado' || r.status === 'simulado').length;
  const sinCambio = results.filter(r => r.status === 'ok').length;
  console.log(`\n  Total: ${results.length} | Cambios: ${migrados} | Sin cambio: ${sinCambio}`);
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'producción';
  console.log(`Migración rol→roles + fechaCreacion→creadoEn (${destino})`);
  console.log(dryRun ? 'MODO: simulación (agregá --apply para ejecutar)\n' : 'MODO: APLICAR CAMBIOS\n');

  const usuariosSnap = await db.collection('usuarios').get();
  const usuariosResults = [];
  for (const doc of usuariosSnap.docs) {
    usuariosResults.push(await migrateUsuario(doc));
  }
  printResults('Usuarios: rol → roles', usuariosResults);

  const serviciosSnap = await db.collection('servicios').get();
  const serviciosResults = [];
  for (const doc of serviciosSnap.docs) {
    serviciosResults.push(await migrateServicio(doc));
  }
  printResults('Servicios: fechaCreacion → creadoEn', serviciosResults);

  if (dryRun) {
    const totalSimulados = [...usuariosResults, ...serviciosResults].filter(r => r.status === 'simulado').length;
    if (totalSimulados > 0) {
      console.log('\nEjecutá con --apply para aplicar los cambios.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
