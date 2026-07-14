/**
 * Carga las 8 cuentas nuevas (chofer/enganchador) y las 6 duplas correspondientes.
 * No toca usuarios ya existentes (Benitez, Chacon, Quiroga, Reynoso).
 * Reemplaza las 2 duplas viejas que quedaron con pareos incorrectos
 * (Benitez-Chacon -> Benitez-Asinardi, Quiroga-Isaac -> Quiroga-Lescano).
 *
 * Uso: node scripts/cargar-nuevas-duplas.mjs [--emulator] [--dry-run]
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildUsuarioUid } from '../shared/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const useEmulator = process.argv.includes('--emulator');
const dryRun = process.argv.includes('--dry-run');

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
const auth = admin.auth();

const PASSWORD_TEMPORAL = 'Bacar2026!';

// nombre = "Nombre(s) Apellido" siguiendo la convención ya usada en la BD
// (Apellido es la primera palabra de la lista "Apellido y Nombre" del usuario).
const NUEVOS_USUARIOS = [
  { legajo: '2575', nombre: 'Lucas Javier Ascari', email: 'lucas.ascari1993@gmail.com', roles: ['CHOFER'] },
  { legajo: '3210', nombre: 'Genes Ariel Eduardo Asinardi', email: 'asinardiariel@gmail.com', roles: ['ENGANCHADOR'] },
  { legajo: '2956', nombre: 'Roberto Adrian Bustos', email: 'robertoadrianbustos956@gmail.com', roles: ['ENGANCHADOR'] },
  { legajo: '3569', nombre: 'Gustavo Daniel Di Martino', email: 'gustavoddimartino1981@gmail.com', roles: ['ENGANCHADOR'] },
  { legajo: '285', nombre: 'Rodrigo Rafael Granado', email: 'coreagranado@gmail.com', roles: ['CHOFER'] },
  { legajo: '3038', nombre: 'Jonathan Ezequiel Heredia', email: 'jonathanezequielheredia@gmail.com', roles: ['CHOFER'] },
  { legajo: '2698', nombre: 'Hector Domingo Lescano', email: 'ellococolifa617@gmail.com', roles: ['ENGANCHADOR'] },
  { legajo: '3571', nombre: 'Ariel Alejandro Prandi', email: 'prandiariel@gmail.com', roles: ['CHOFER'] },
];

// Duplas finales (chofer -> enganchador) usando el nombre tal como queda guardado en Usuario.nombre.
// Quiroga-Lescano y Benitez-Asinardi se resuelven actualizando las duplas viejas (ver más abajo),
// el resto son documentos nuevos.
const DUPLAS_NUEVAS = [
  { id: 'D004-GRBU', chofer: 'Rodrigo Rafael Granado', enganchador: 'Roberto Adrian Bustos' },
  { id: 'D004-HEDI', chofer: 'Jonathan Ezequiel Heredia', enganchador: 'Gustavo Daniel Di Martino' },
  { id: 'D004-ASRE', chofer: 'Lucas Javier Ascari', enganchador: 'Isaac' },
  { id: 'D004-PRCH', chofer: 'Ariel Alejandro Prandi', enganchador: 'Diego Ezequiel Chacon' },
];

async function assertLegajoUnico(legajo) {
  const snap = await db.collection('usuarios').where('legajo', '==', legajo).get();
  if (!snap.empty) {
    throw new Error(`legajo ${legajo} ya está en uso por ${snap.docs[0].id}`);
  }
}

async function crearUsuario(u) {
  const roles = u.roles;
  const uid = buildUsuarioUid({ nombre: u.nombre, roles, legajo: u.legajo });

  await assertLegajoUnico(u.legajo);

  const existingDoc = await db.collection('usuarios').doc(uid).get();
  if (existingDoc.exists) {
    throw new Error(`uid ${uid} ya existe en Firestore`);
  }
  try {
    await auth.getUser(uid);
    throw new Error(`uid ${uid} ya existe en Auth`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  if (dryRun) {
    console.log(`  [dry-run] crearía ${u.email} -> uid=${uid} roles=${roles.join(',')} legajo=${u.legajo}`);
    return;
  }

  try {
    await auth.createUser({
      uid,
      email: u.email,
      password: PASSWORD_TEMPORAL,
      displayName: u.nombre,
      emailVerified: true,
    });
  } catch (err) {
    console.error(`  ERROR creando Auth para ${u.email}:`, err.message);
    return;
  }

  try {
    await db.collection('usuarios').doc(uid).set({
      uid,
      nombre: u.nombre,
      email: u.email,
      roles,
      legajo: u.legajo,
      servicioActivoId: null,
      servicioActivoResumen: null,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    await auth.deleteUser(uid).catch(() => undefined);
    console.error(`  ERROR creando Firestore para ${u.email}, se revirtió Auth:`, err.message);
    return;
  }

  console.log(`  OK: ${u.email} -> uid=${uid}`);
}

async function reemplazarDuplaVieja(id, nueva) {
  if (dryRun) {
    console.log(`  [dry-run] reemplazaría dupla ${id} -> chofer="${nueva.chofer}" enganchador="${nueva.enganchador}"`);
    return;
  }
  await db.collection('duplas').doc(id).update({
    chofer: nueva.chofer,
    enganchador: nueva.enganchador,
  });
  console.log(`  OK: dupla ${id} actualizada -> "${nueva.chofer}" / "${nueva.enganchador}"`);
}

async function crearDupla(d) {
  if (dryRun) {
    console.log(`  [dry-run] crearía dupla ${d.id} -> chofer="${d.chofer}" enganchador="${d.enganchador}"`);
    return;
  }
  const ref = db.collection('duplas').doc(d.id);
  const existing = await ref.get();
  if (existing.exists) {
    console.log(`  omitido: dupla ${d.id} ya existe`);
    return;
  }
  await ref.set({
    id: d.id,
    chofer: d.chofer,
    enganchador: d.enganchador,
    tipo: 'TRANSITO',
  });
  console.log(`  OK: dupla ${d.id} creada -> "${d.chofer}" / "${d.enganchador}"`);
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (PRODUCCIÓN)';
  console.log(`Destino: ${destino}${dryRun ? ' [DRY RUN]' : ''}\n`);

  console.log('== Creando usuarios nuevos ==');
  for (const u of NUEVOS_USUARIOS) {
    await crearUsuario(u);
  }

  console.log('\n== Reemplazando duplas viejas con pareo incorrecto ==');
  // D003-BECH (Benitez-Chacon) -> Benitez-Asinardi
  await reemplazarDuplaVieja('D003-BECH', { chofer: 'Martin Ariel Benitez', enganchador: 'Genes Ariel Eduardo Asinardi' });
  // D003-QUIS (Quiroga-Isaac) -> Quiroga-Lescano
  await reemplazarDuplaVieja('D003-QUIS', { chofer: 'Alberto Gaspar Quiroga', enganchador: 'Hector Domingo Lescano' });

  console.log('\n== Creando duplas nuevas restantes ==');
  for (const d of DUPLAS_NUEVAS) {
    await crearDupla(d);
  }

  console.log('\nListo.');
  if (!dryRun) {
    console.log(`Password temporal para las cuentas nuevas: ${PASSWORD_TEMPORAL}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
