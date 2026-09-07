/**
 * Lee colecciones del emulador Firestore y las guarda como JSON.
 *
 * Requisitos: emulador corriendo con --import=.emulator-data
 * Uso: node scripts/export-emulator-collections.mjs
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initEmulatorAdmin } from './lib/initFirebaseAdmin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COLLECTIONS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DEFAULT_COLLECTIONS = ['gruas', 'corralones', 'duplas', 'notificaciones'];
const target = COLLECTIONS.length > 0 ? COLLECTIONS : DEFAULT_COLLECTIONS;

const { db } = initEmulatorAdmin(process.argv);

function serializeValue(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') {
    return { __type: 'Timestamp', iso: value.toDate().toISOString() };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 4) {
    return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value._latitude != null && value._longitude != null) {
    return { __type: 'GeoPoint', latitude: value._latitude, longitude: value._longitude };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

async function main() {
  const outDir = join(__dirname, '../.backups/recovery-from-emulator');
  mkdirSync(outDir, { recursive: true });

  console.log('Exportando desde emulador Firestore (127.0.0.1:8081)...\n');

  const summary = {};
  for (const name of target) {
    const snap = await db.collection(name).get();
    const docs = snap.docs.map((d) => ({
      id: d.id,
      data: serializeValue(d.data()),
    }));
    const path = join(outDir, `${name}.json`);
    writeFileSync(path, JSON.stringify(docs, null, 2), 'utf8');
    summary[name] = docs.length;
    console.log(`  ${name}: ${docs.length} docs → ${path}`);
  }

  // Inventario completo de colecciones presentes
  const all = await db.listCollections();
  const inventory = [];
  for (const col of all) {
    const count = (await col.count().get()).data().count;
    inventory.push({ id: col.id, count });
  }
  writeFileSync(join(outDir, '_inventory.json'), JSON.stringify(inventory, null, 2), 'utf8');
  console.log('\nInventario completo:');
  for (const row of inventory) {
    console.log(`  ${row.id}: ${row.count}`);
  }
  console.log(`\nListo. Archivos en .backups/recovery-from-emulator/`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
