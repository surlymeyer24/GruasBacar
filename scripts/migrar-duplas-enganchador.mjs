/**
 * Migra duplas: campo legacy `ayudante` → `enganchador`.
 *
 * Uso:
 *   npm run migrate-duplas              # simulación
 *   npm run migrate-duplas -- --apply   # ejecutar
 *   npm run migrate-duplas:emulator -- --apply
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const useEmulator = process.argv.includes('--emulator');
const dryRun = !process.argv.includes('--apply');

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
const FieldValue = admin.firestore.FieldValue;

async function migrateOneDupla(docSnap) {
  const docId = docSnap.id;
  const data = docSnap.data() ?? {};
  const ayudante = typeof data.ayudante === 'string' ? data.ayudante.trim() : '';
  const enganchador = typeof data.enganchador === 'string' ? data.enganchador.trim() : '';
  const tieneAyudante = 'ayudante' in data;

  if (!tieneAyudante) {
    return {
      docId,
      chofer: data.chofer,
      status: 'ok',
      reason: 'Sin campo ayudante',
    };
  }

  if (!ayudante && enganchador) {
    if (dryRun) {
      return {
        docId,
        chofer: data.chofer,
        status: 'simulado',
        reason: 'Eliminar ayudante vacío (enganchador ya existe)',
      };
    }
    await docSnap.ref.update({ ayudante: FieldValue.delete() });
    return {
      docId,
      chofer: data.chofer,
      status: 'migrado',
      reason: 'Eliminado ayudante vacío',
    };
  }

  if (ayudante && enganchador && ayudante !== enganchador) {
    return {
      docId,
      chofer: data.chofer,
      status: 'error',
      reason: `Conflicto: ayudante="${ayudante}" distinto de enganchador="${enganchador}"`,
    };
  }

  const enganchadorFinal = enganchador || ayudante;

  if (dryRun) {
    return {
      docId,
      chofer: data.chofer,
      enganchador: enganchadorFinal,
      status: 'simulado',
      reason: ayudante ? 'Copiar ayudante → enganchador y borrar ayudante' : 'Sin cambios',
    };
  }

  await docSnap.ref.update({
    enganchador: enganchadorFinal,
    ayudante: FieldValue.delete(),
  });

  return {
    docId,
    chofer: data.chofer,
    enganchador: enganchadorFinal,
    status: 'migrado',
    reason: 'Campo ayudante migrado a enganchador',
  };
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (producción)';
  console.log(`Migración duplas ayudante → enganchador (${destino})`);
  console.log(dryRun ? 'MODO: simulación (agregá --apply para ejecutar)\n' : 'MODO: APLICAR CAMBIOS\n');

  const snap = await db.collection('duplas').get();
  const results = [];

  for (const doc of snap.docs) {
    results.push(await migrateOneDupla(doc));
  }

  console.log('--- Resultado ---\n');
  for (const r of results) {
    console.log(`${r.status.toUpperCase()}: ${r.docId} (${r.chofer ?? 'sin chofer'})`);
    if (r.enganchador) console.log(`  Enganchador: ${r.enganchador}`);
    if (r.reason) console.log(`  ${r.reason}`);
    console.log('');
  }

  const migrados = results.filter((r) => r.status === 'migrado' || r.status === 'simulado').length;
  const errores = results.filter((r) => r.status === 'error').length;
  console.log(`Total: ${results.length} | Migrados/simulados: ${migrados} | Errores: ${errores}`);

  if (dryRun && results.some((r) => r.status === 'simulado')) {
    console.log('\nEjecutá con --apply para aplicar los cambios.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
