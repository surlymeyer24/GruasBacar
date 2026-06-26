/**
 * Repara usuarios cuando el documento en Firestore no coincide con el UID de Firebase Auth
 * (p. ej. carga manual con ID inventado).
 *
 * Uso:
 *   npm run sync-usuarios
 *   npm run sync-usuarios:emulator
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

const USUARIOS_PRUEBA = [
  { email: 'admin@bacar.com', password: 'Admin123!', nombre: 'Admin BACAR', rol: 'ADMIN' },
  { email: 'chofer@bacar.com', password: 'Chofer123!', nombre: 'Enganchador BACAR', rol: 'ENGANCHADOR', legajo: 'CH001' },
];

async function listAuthUsersByEmail() {
  const map = new Map();
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if (u.email) map.set(u.email.toLowerCase(), u);
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return map;
}

async function ensureAuthUser(def) {
  try {
    const existing = await auth.getUserByEmail(def.email);
    await auth.updateUser(existing.uid, {
      password: def.password,
      displayName: def.nombre,
      disabled: false,
    });
    console.log(`  Auth ${def.email}: existe (${existing.uid}) — contraseña actualizada`);
    return existing;
  } catch {
    const uid = buildUsuarioUid({
      nombre: def.nombre,
      roles: [def.rol ?? 'ENGANCHADOR'],
      legajo: def.legajo ?? null,
    });
    const created = await auth.createUser({
      uid,
      email: def.email,
      password: def.password,
      displayName: def.nombre,
    });
    console.log(`  Auth ${def.email}: creado (${created.uid})`);
    return created;
  }
}

async function upsertFirestoreUser(authUser, def) {
  const ref = db.collection('usuarios').doc(authUser.uid);
  await ref.set(
    {
      uid: authUser.uid,
      nombre: def?.nombre ?? authUser.displayName ?? authUser.email,
      email: authUser.email,
      rol: def?.rol ?? 'ENGANCHADOR',
      servicioActivoId: null,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`  Firestore usuarios/${authUser.uid}: OK (${def?.rol ?? 'ENGANCHADOR'})`);
}

async function removeOrphanDocs(authByEmail) {
  const snap = await db.collection('usuarios').get();
  const validUids = new Set([...authByEmail.values()].map((u) => u.uid));

  for (const doc of snap.docs) {
    const data = doc.data();
    const email = (data.email ?? '').toLowerCase();
    const authUser = email ? authByEmail.get(email) : undefined;

    if (authUser && doc.id !== authUser.uid) {
      console.log(`  Eliminando doc huérfano usuarios/${doc.id} (email ${email}, UID real ${authUser.uid})`);
      await doc.ref.delete();
      continue;
    }

    if (!validUids.has(doc.id)) {
      console.log(`  Eliminando doc sin cuenta Auth: usuarios/${doc.id} (${email || 'sin email'})`);
      await doc.ref.delete();
    }
  }
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (producción)';
  console.log(`Sincronizando usuarios Auth ↔ Firestore (${destino})...\n`);

  for (const def of USUARIOS_PRUEBA) {
    console.log(def.email);
    const authUser = await ensureAuthUser(def);
    await upsertFirestoreUser(authUser, def);
  }

  console.log('\nLimpiando documentos huérfanos...');
  const authByEmail = await listAuthUsersByEmail();
  await removeOrphanDocs(authByEmail);

  console.log('\nListo. Credenciales:');
  console.log('  Admin:  admin@bacar.com  / Admin123!');
  console.log('  Enganchador: chofer@bacar.com / Chofer123!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
