import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error('No se encontró ServiceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();

const EMAILS_TO_KEEP = ['surlymeyer@gmail.com', 'desarrollo.it@bacarsa.com.ar'];

async function main() {
  console.log('--- Eliminando usuarios de Auth ---');
  let result = await auth.listUsers(1000);
  const uidsToKeep = new Set();

  for (const u of result.users) {
    if (EMAILS_TO_KEEP.includes(u.email)) {
      uidsToKeep.add(u.uid);
      console.log(`Manteniendo Auth: ${u.email} (${u.uid})`);
    } else {
      await auth.deleteUser(u.uid);
      console.log(`Eliminado Auth: ${u.email} (${u.uid})`);
    }
  }

  console.log('\n--- Vaciando colecciones de Firestore ---');
  const collections = await db.listCollections();
  
  for (const collection of collections) {
    const docs = await collection.get();
    for (const doc of docs.docs) {
      if (collection.id === 'usuarios' && uidsToKeep.has(doc.id)) {
        console.log(`Manteniendo Doc: ${collection.id}/${doc.id}`);
        // Optionally, clear current 'servicioActivoId' if any, since services are being deleted
        await doc.ref.update({ servicioActivoId: null });
        console.log(`  -> Reseteado servicioActivoId a null`);
      } else {
        await db.recursiveDelete(doc.ref);
        console.log(`Eliminado recursivamente: ${collection.id}/${doc.id}`);
      }
    }
  }

  console.log('\nBase de datos vaciada con éxito. Sólo quedaron los usuarios requeridos.');
}

main().catch(console.error);
