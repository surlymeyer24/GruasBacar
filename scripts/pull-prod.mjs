/**
 * Seed del emulador: lee producción y escribe solo en localhost.
 * Nunca escribe en el proyecto real.
 *
 * Requisitos:
 *   - Emuladores corriendo (npm run emu)
 *   - ServiceAccountKey.json en functions/src/auth/ (solo para LEER prod)
 *
 * Uso: npm run seed   |   npm run emu:seed   |   npm run pull-prod
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { applyEmulatorEnv, clearEmulatorEnv } from './lib/initFirebaseAdmin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const TEST_PASSWORD = 'Test1234!';

const COLLECTIONS = [
  'usuarios',
  'gruas',
  'corralones',
  'duplas',
  'servicios',
];

const SUB_COLLECTIONS = {
  servicios: ['eventos', 'fotosStaging', 'versiones'],
};

/** Tokens FCM de prod notificarían celulares reales si las functions del emulador los usaran. */
function sanitizeForEmulator(col, data) {
  if (col !== 'usuarios' || !data || typeof data !== 'object') return data;
  const { fcmTokens: _omit, ...rest } = data;
  return rest;
}


if (process.argv.includes('--prod')) {
  console.error(
    'Este script nunca escribe en producción. Para sembrar el emulador: npm run seed'
  );
  process.exit(1);
}

// ── Fase 1: leer TODO de producción (sin env vars de emulador) ──

clearEmulatorEnv();

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error('No se encontró functions/src/auth/ServiceAccountKey.json (hace falta para LEER prod).');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

const prodApp = admin.initializeApp(
  { credential: admin.credential.cert(serviceAccount) },
  'prod',
);
const prodDb = prodApp.firestore();
const prodAuth = prodApp.auth();

async function readCollection(name) {
  const snap = await prodDb.collection(name).get();
  if (snap.empty) return [];

  const docs = [];
  for (const doc of snap.docs) {
    const entry = { id: doc.id, data: doc.data(), subs: {} };

    const subNames = SUB_COLLECTIONS[name] || [];
    for (const subName of subNames) {
      const subSnap = await prodDb
        .collection(name)
        .doc(doc.id)
        .collection(subName)
        .get();
      entry.subs[subName] = subSnap.docs.map((s) => ({
        id: s.id,
        data: s.data(),
      }));
    }
    docs.push(entry);
  }
  return docs;
}

async function readAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const result = await prodAuth.listUsers(1000, pageToken);
    for (const user of result.users) {
      users.push({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || undefined,
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber || undefined,
        photoURL: user.photoURL || undefined,
        customClaims: user.customClaims || null,
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function assertEmulatorUp() {
  try {
    await fetch('http://127.0.0.1:8081');
  } catch {
    console.error('El emulador de Firestore no responde en 127.0.0.1:8081. Levantá `npm run emu`.');
    process.exit(1);
  }
}

async function main() {
  await assertEmulatorUp();
  console.log('Seed: copiando producción → emuladores (solo lectura de prod; escribe solo en localhost)...\n');

  // Fase 1: leer de producción
  console.log('Leyendo de producción...');

  const collectionData = {};
  for (const col of COLLECTIONS) {
    collectionData[col] = await readCollection(col);
    const subCount = collectionData[col].reduce(
      (acc, d) => acc + Object.values(d.subs).reduce((a, s) => a + s.length, 0),
      0,
    );
    const total = collectionData[col].length + subCount;
    console.log(`  ${col}: ${collectionData[col].length} docs (${total} total con sub-colecciones).`);
  }

  const authUsers = await readAuthUsers();
  console.log(`  Auth: ${authUsers.length} usuarios encontrados.`);

  // Cerrar conexión a producción
  await prodApp.delete();

  // ── Fase 2: escribir en emuladores ──
  console.log('\nEscribiendo en emuladores...');

  applyEmulatorEnv();

  const emuApp = admin.initializeApp({ projectId: 'gruasbacar' }, 'emulator');
  const emuDb = emuApp.firestore();
  const emuAuth = emuApp.auth();

  // Escribir Firestore
  let totalDocs = 0;
  for (const col of COLLECTIONS) {
    const docs = collectionData[col];
    const batchSize = 500;
    let batch = emuDb.batch();
    let batchCount = 0;

    for (const entry of docs) {
      batch.set(emuDb.collection(col).doc(entry.id), sanitizeForEmulator(col, entry.data));
      batchCount++;
      totalDocs++;

      for (const [subName, subDocs] of Object.entries(entry.subs)) {
        for (const subDoc of subDocs) {
          batch.set(
            emuDb.collection(col).doc(entry.id).collection(subName).doc(subDoc.id),
            subDoc.data,
          );
          batchCount++;
          totalDocs++;

          if (batchCount >= batchSize) {
            await batch.commit();
            batch = emuDb.batch();
            batchCount = 0;
          }
        }
      }

      if (batchCount >= batchSize) {
        await batch.commit();
        batch = emuDb.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
    console.log(`  ${col}: ✓`);
  }

  // Escribir Auth users
  let authCount = 0;
  for (const user of authUsers) {
    try {
      await emuAuth.createUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        phoneNumber: user.phoneNumber,
        photoURL: user.photoURL,
        password: TEST_PASSWORD,
      });
      if (user.customClaims && Object.keys(user.customClaims).length > 0) {
        await emuAuth.setCustomUserClaims(user.uid, user.customClaims);
      }
      authCount++;
    } catch (err) {
      if (
        err.code === 'auth/uid-already-exists' ||
        err.code === 'auth/email-already-exists'
      ) {
        console.log(`    ${user.email}: ya existe en emulador, se omite.`);
      } else {
        console.error(`    ${user.email}: error — ${err.message}`);
      }
    }
  }
  console.log(`  Auth: ${authCount} usuarios creados.`);

  console.log(`\nTotal: ${totalDocs} documentos en Firestore, ${authCount} usuarios en Auth.`);
  console.log(`Todos los usuarios usan la contraseña: ${TEST_PASSWORD}`);
  console.log('Tokens FCM de producción no se copian (el emulador no notifica celulares reales).');
  console.log('Emulator UI: http://localhost:4000');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
