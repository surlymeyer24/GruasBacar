/**
 * Restaura colecciones JSON (extraídas del emulador) hacia Firestore de PRODUCCIÓN.
 *
 * Uso (dry-run por defecto):
 *   node scripts/restore-collections-to-prod.mjs
 *
 * Escritura real (pide confirmación explícita):
 *   node scripts/restore-collections-to-prod.mjs --write
 *
 * Colecciones específicas:
 *   node scripts/restore-collections-to-prod.mjs --write gruas corralones duplas notificaciones
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { requireProdFlag } from './lib/initFirebaseAdmin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

requireProdFlag(process.argv, 'restore-collections-to-prod.mjs');

const args = process.argv.slice(2);
const doWrite = args.includes('--write');
const collections = args.filter((a) => a !== '--write');
const DEFAULT = ['gruas', 'corralones', 'duplas', 'notificaciones'];
const target = collections.length > 0 ? collections : DEFAULT;

const backupDir = join(__dirname, '../.backups/recovery-from-emulator');
const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');

if (!existsSync(keyPath)) {
  console.error('No se encontró ServiceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function deserializeValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (typeof value === 'object') {
    if (value.__type === 'Timestamp' && value.iso) {
      return admin.firestore.Timestamp.fromDate(new Date(value.iso));
    }
    if (value.__type === 'GeoPoint') {
      return new admin.firestore.GeoPoint(value.latitude, value.longitude);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserializeValue(v);
    return out;
  }
  return value;
}

async function main() {
  console.log(doWrite ? 'MODO ESCRITURA → PRODUCCIÓN\n' : 'DRY-RUN (no escribe). Pasá --write para aplicar.\n');

  for (const name of target) {
    const file = join(backupDir, `${name}.json`);
    if (!existsSync(file)) {
      console.error(`Falta ${file}. Corré primero export-emulator-collections.mjs`);
      process.exit(1);
    }
    const docs = JSON.parse(readFileSync(file, 'utf8'));
    const existing = await db.collection(name).get();
    console.log(`${name}: backup=${docs.length} docs, prod actual=${existing.size} docs`);

    if (!doWrite) continue;

    let batch = db.batch();
    let n = 0;
    for (const entry of docs) {
      const ref = db.collection(name).doc(entry.id);
      batch.set(ref, deserializeValue(entry.data), { merge: false });
      n++;
      if (n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (n % 400 !== 0) await batch.commit();
    console.log(`  ✓ restaurados ${n} docs`);
  }

  if (!doWrite) {
    console.log('\nRevisá los conteos. Si están bien: node scripts/restore-collections-to-prod.mjs --write');
  } else {
    console.log('\nRestore completado.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
