/**
 * Migra usuarios existentes al formato de UID determinístico:
 * - Admin: admin + nombre
 * - Resto: legajo + rol
 *
 * Firebase Auth no permite cambiar el UID; se recrea la cuenta Auth y se
 * actualizan referencias en Firestore (servicios.creadoPor, anuladoPor, etc.).
 *
 * Uso:
 *   npm run migrate-uids              # simulación (dry-run)
 *   npm run migrate-uids -- --apply     # ejecutar migración
 *   npm run migrate-uids:emulator -- --apply
 *   npm run migrate-uids -- --apply --email=admin@bacar.com
 */
import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildUsuarioUid, normalizeRoles } from '../shared/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const useEmulator = process.argv.includes('--emulator');
const dryRun = !process.argv.includes('--apply');
const emailFilter = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1]?.toLowerCase();

/** Contraseñas conocidas de cuentas de prueba (emulador / seed). */
const PASSWORDS_CONOCIDAS = {
  'admin@bacar.com': 'Admin123!',
  'chofer@bacar.com': 'Chofer123!',
};

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

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function resolveFirestoreUser(authUser) {
  const byUid = await db.collection('usuarios').doc(authUser.uid).get();
  if (byUid.exists) {
    return { ref: byUid.ref, data: byUid.data(), docId: byUid.id };
  }

  const email = authUser.email?.toLowerCase();
  if (email) {
    const q = await db.collection('usuarios').where('email', '==', email).limit(1).get();
    if (!q.empty) {
      const doc = q.docs[0];
      return { ref: doc.ref, data: doc.data(), docId: doc.id };
    }
  }

  return null;
}

function rolesFromFirestore(data) {
  return normalizeRoles(data.roles, data.rol);
}

function computeNewUid(authUser, firestoreData) {
  const nombre = firestoreData?.nombre ?? authUser.displayName ?? authUser.email ?? 'Usuario';
  const roles = rolesFromFirestore(firestoreData ?? {});
  const legajo = firestoreData?.legajo ?? null;
  return buildUsuarioUid({ nombre, roles, legajo });
}

async function updateServiciosUidField(field, oldUid, newUid) {
  const snap = await db.collection('servicios').where(field, '==', oldUid).get();
  if (snap.empty) return 0;

  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { [field]: newUid });
    ops += 1;
    updated += 1;

    if (ops >= 400) {
      if (!dryRun) await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0 && !dryRun) await batch.commit();
  return updated;
}

async function migrateAuthUser(oldUid, newUid, authUser) {
  const email = authUser.email;
  if (!email) {
    throw new Error(`Usuario ${oldUid} no tiene email; no se puede migrar Auth.`);
  }

  const password =
    PASSWORDS_CONOCIDAS[email.toLowerCase()] ?? randomBytes(18).toString('base64url');

  const tempEmail = `__migrating__${oldUid}@uid-migrate.invalid`;

  if (dryRun) {
    return { email, passwordKnown: !!PASSWORDS_CONOCIDAS[email.toLowerCase()] };
  }

  await auth.updateUser(oldUid, { email: tempEmail });

  try {
    await auth.createUser({
      uid: newUid,
      email,
      password,
      displayName: authUser.displayName ?? undefined,
      emailVerified: authUser.emailVerified,
      disabled: authUser.disabled,
    });
  } catch (err) {
    await auth.updateUser(oldUid, { email }).catch(() => undefined);
    throw err;
  }

  await auth.deleteUser(oldUid);

  let resetLink;
  const passwordGenerada =
    !PASSWORDS_CONOCIDAS[email.toLowerCase()] && !dryRun ? password : undefined;
  if (!PASSWORDS_CONOCIDAS[email.toLowerCase()] && !dryRun) {
    resetLink = await auth.generatePasswordResetLink(email);
  }

  return {
    email,
    passwordKnown: !!PASSWORDS_CONOCIDAS[email.toLowerCase()],
    passwordGenerada,
    resetLink,
  };
}

async function migrateOneUser(authUser) {
  const email = authUser.email?.toLowerCase() ?? '';
  if (emailFilter && email !== emailFilter) return null;

  const firestore = await resolveFirestoreUser(authUser);
  if (!firestore) {
    return {
      email: authUser.email,
      oldUid: authUser.uid,
      status: 'omitido',
      reason: 'Sin documento en Firestore usuarios/',
    };
  }

  const oldUid = authUser.uid;
  const { docId: oldDocId, data } = firestore;

  let newUid;
  try {
    newUid = computeNewUid(authUser, data);
  } catch (err) {
    return {
      email: authUser.email,
      oldUid,
      oldDocId,
      status: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const authNeedsMigration = oldUid !== newUid;
  const docNeedsMove = oldDocId !== newUid;

  if (!authNeedsMigration && !docNeedsMove) {
    if (data.uid !== newUid && !dryRun) {
      await db.collection('usuarios').doc(newUid).update({ uid: newUid });
    }
    return {
      email: authUser.email,
      oldUid,
      newUid,
      status: 'ok',
      reason: 'UID ya correcto',
    };
  }

  try {
    await auth.getUser(newUid);
    if (authNeedsMigration) {
      return {
        email: authUser.email,
        oldUid,
        newUid,
        status: 'error',
        reason: `Ya existe un usuario Auth con UID ${newUid}`,
      };
    }
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  const creadoPorCount = await db.collection('servicios').where('creadoPor', '==', oldUid).count().get();
  const anuladoPorCount = await db.collection('servicios').where('anuladoPor', '==', oldUid).count().get();
  const creadoPor = creadoPorCount.data().count;
  const anuladoPor = anuladoPorCount.data().count;

  if (dryRun) {
    return {
      email: authUser.email,
      oldUid,
      oldDocId,
      newUid,
      status: 'simulado',
      serviciosCreadoPor: creadoPor,
      serviciosAnuladoPor: anuladoPor,
    };
  }

  await db.collection('usuarios').doc(newUid).set({ ...data, uid: newUid }, { merge: false });

  let authResult;
  if (authNeedsMigration) {
    authResult = await migrateAuthUser(oldUid, newUid, authUser);
  }

  const creadoPorUpdated = await updateServiciosUidField('creadoPor', oldUid, newUid);
  const anuladoPorUpdated = await updateServiciosUidField('anuladoPor', oldUid, newUid);

  if (oldDocId !== newUid) {
    await db.collection('usuarios').doc(oldDocId).delete();
  }

  return {
    email: authUser.email,
    oldUid,
    oldDocId,
    newUid,
    status: 'migrado',
    serviciosCreadoPor: creadoPorUpdated || creadoPor,
    serviciosAnuladoPor: anuladoPorUpdated || anuladoPor,
    authResult,
  };
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (producción)';
  console.log(`Migración de UIDs de usuarios (${destino})`);
  console.log(dryRun ? 'MODO: simulación (agregá --apply para ejecutar)\n' : 'MODO: APLICAR CAMBIOS\n');

  const authUsers = await listAllAuthUsers();
  const results = [];

  for (const authUser of authUsers) {
    const result = await migrateOneUser(authUser);
    if (result) results.push(result);
  }

  console.log('--- Resultado ---\n');
  for (const r of results) {
    console.log(`${r.status.toUpperCase()}: ${r.email ?? r.oldUid}`);
    console.log(`  Auth UID: ${r.oldUid}${r.newUid && r.newUid !== r.oldUid ? ` → ${r.newUid}` : ''}`);
    if (r.oldDocId && r.oldDocId !== r.oldUid) {
      console.log(`  Doc Firestore: ${r.oldDocId} (distinto del Auth UID)`);
    }
    if (r.reason) console.log(`  ${r.reason}`);
    if (r.serviciosCreadoPor) console.log(`  Servicios creadoPor actualizados: ${r.serviciosCreadoPor}`);
    if (r.serviciosAnuladoPor) console.log(`  Servicios anuladoPor actualizados: ${r.serviciosAnuladoPor}`);
    if (r.authResult?.passwordGenerada) {
      console.log(`  Contraseña temporal (guardala): ${r.authResult.passwordGenerada}`);
    }
    if (r.authResult?.resetLink) {
      console.log(`  Link reset contraseña: ${r.authResult.resetLink}`);
    }
    console.log('');
  }

  const migrados = results.filter((r) => r.status === 'migrado' || r.status === 'simulado').length;
  const errores = results.filter((r) => r.status === 'error').length;
  console.log(`Total: ${results.length} | Migrables/simulados: ${migrados} | Errores/omitidos: ${errores + results.filter((r) => r.status === 'omitido').length}`);

  if (dryRun && migrados > 0) {
    console.log('\nEjecutá con --apply para aplicar los cambios.');
  }

  if (!dryRun && results.some((r) => r.authResult?.resetLink)) {
    console.log('\nAlgunos usuarios necesitan restablecer contraseña (ver links arriba).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
