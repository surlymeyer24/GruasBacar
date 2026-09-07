/**
 * Repara usuarios cuando el documento en Firestore no coincide con el UID de Firebase Auth
 * (p. ej. carga manual con ID inventado). Solo producción.
 *
 * Uso:
 *   npm run sync-usuarios
 */
import { initProdAdmin } from './lib/initFirebaseAdmin.mjs';

const { db, auth } = initProdAdmin(process.argv, { scriptName: 'sync-usuarios.mjs' });

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
  console.log('Sincronizando usuarios Auth ↔ Firestore (producción)...\n');
  console.log('Limpiando documentos huérfanos...');
  const authByEmail = await listAuthUsersByEmail();
  await removeOrphanDocs(authByEmail);
  console.log('\nListo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
