/**
 * Carga datos iniciales en Firestore y usuarios de prueba.
 * Uso: npm run seed (desde la raíz del proyecto)
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildUsuarioUid, buildGruaId } from '../shared/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const useEmulator = process.argv.includes('--emulator');

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
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

const GRUAS = [
  { patente: 'AB123CD', descripcion: 'Grúa plataforma 1', activa: true },
  { patente: 'AC456EF', descripcion: 'Grúa plataforma 2', activa: true },
];

const CORRALONES = [
  { nombre: 'Corralón Norte', direccion: 'Av. Example 100', activo: true },
  { nombre: 'Corralón Sur', direccion: 'Calle Example 200', activo: true },
];

const DUPLAS = [
  { chofer: 'Juan Pérez', enganchador: 'Carlos Gómez', activa: true },
  { chofer: 'María López', enganchador: 'Pedro Ruiz', activa: true },
];

const USUARIOS_PRUEBA = [
  { email: 'admin@bacar.com', password: 'Admin123!', nombre: 'Admin BACAR', rol: 'ADMIN' },
  { email: 'chofer@bacar.com', password: 'Chofer123!', nombre: 'Enganchador BACAR', rol: 'ENGANCHADOR', legajo: 'CH001' },
];

async function seedGruas() {
  const snap = await db.collection('gruas').limit(1).get();
  if (!snap.empty) {
    console.log('  gruas: ya tiene datos, se omite.');
    return;
  }
  for (const g of GRUAS) {
    const id = buildGruaId(g.patente);
    await db.collection('gruas').doc(id).set({
      id,
      patente: g.patente,
      descripcion: g.descripcion,
      activa: g.activa,
      tipo: 'TRANSITO',
    });
  }
  console.log(`  gruas: ${GRUAS.length} documentos creados.`);
}

async function seedCollection(name, items) {
  const snap = await db.collection(name).limit(1).get();
  if (!snap.empty) {
    console.log(`  ${name}: ya tiene datos, se omite.`);
    return;
  }
  const batch = db.batch();
  for (const item of items) {
    const ref = db.collection(name).doc();
    batch.set(ref, item);
  }
  await batch.commit();
  console.log(`  ${name}: ${items.length} documentos creados.`);
}

async function seedUsuarios() {
  for (const u of USUARIOS_PRUEBA) {
    const roles = [u.rol];
    const uidEsperado = buildUsuarioUid({
      nombre: u.nombre,
      roles,
      legajo: u.legajo ?? null,
    });

    let uid;
    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      await auth.updateUser(uid, {
        password: u.password,
        displayName: u.nombre,
        disabled: false,
      });
      console.log(`  ${u.email}: ya existe (${uid}) — contraseña actualizada`);
    } catch {
      const record = await auth.createUser({
        uid: uidEsperado,
        email: u.email,
        password: u.password,
        displayName: u.nombre,
      });
      uid = record.uid;
      console.log(`  ${u.email}: creado (${uid})`);
    }

    await db.collection('usuarios').doc(uid).set(
      {
        uid,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        legajo: u.legajo ?? null,
        servicioActivoId: null,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (producción)';
  console.log(`Sembrando Firestore (${destino})...\n`);
  await seedGruas();
  await seedCollection('corralones', CORRALONES);
  await seedCollection('duplas', DUPLAS);
  console.log('\nUsuarios de prueba:');
  await seedUsuarios();
  console.log('\nListo. Credenciales:');
  console.log('  Admin:  admin@bacar.com  / Admin123!');
  console.log('  Enganchador: chofer@bacar.com / Chofer123!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
