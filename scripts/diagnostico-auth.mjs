import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  const result = await auth.listUsers(1000);
  console.log('=== Auth vs Firestore usuarios ===\n');
  for (const u of result.users) {
    const snap = await db.collection('usuarios').doc(u.uid).get();
    const status = snap.exists ? 'OK' : 'FALTA DOC';
    const activo = snap.exists ? snap.data()?.activo : '—';
    console.log(`${u.email}`);
    console.log(`  Auth UID: ${u.uid} | disabled: ${u.disabled} | Firestore: ${status} | activo: ${activo}`);
    if (snap.exists) {
      const d = snap.data();
      console.log(`  nombre: ${d.nombre} | roles: ${JSON.stringify(d.roles ?? d.rol)} | legajo: ${d.legajo ?? '—'}`);
    }
    // orphan docs by email
    if (!snap.exists && u.email) {
      const q = await db.collection('usuarios').where('email', '==', u.email).limit(3).get();
      for (const doc of q.docs) {
        console.log(`  DOC HUÉRFANO: usuarios/${doc.id} (email coincide, UID distinto)`);
      }
    }
    console.log('');
  }
}

main().catch(console.error);
