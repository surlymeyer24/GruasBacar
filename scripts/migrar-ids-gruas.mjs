/**
 * Migra documentos de gruas al ID determinístico G-{patente}
 * y actualiza referencias en duplas.gruaId.
 *
 * Uso:
 *   npm run migrate-gruas              # simulación
 *   npm run migrate-gruas -- --apply   # ejecutar
 *   npm run migrate-gruas:emulator -- --apply
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildGruaId } from '../shared/dist/index.js';

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

function normalizePatente(patente) {
  return patente?.trim().toUpperCase().replace(/\s/g, '') ?? '';
}

async function countDuplasConGrua(gruaId) {
  const snap = await db.collection('duplas').where('gruaId', '==', gruaId).get();
  return snap.size;
}

async function updateDuplasGruaId(oldId, newId) {
  const snap = await db.collection('duplas').where('gruaId', '==', oldId).get();
  if (snap.empty) return 0;

  if (dryRun) return snap.size;

  let batch = db.batch();
  let ops = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { gruaId: newId });
    ops += 1;
    updated += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return updated;
}

async function migrateOneGrua(docSnap, reservedNewIds) {
  const oldId = docSnap.id;
  const data = docSnap.data() ?? {};
  const patenteRaw = data.patente;
  const patente = normalizePatente(patenteRaw);

  if (!patente) {
    return {
      oldId,
      status: 'error',
      reason: 'Sin patente en el documento',
    };
  }

  const newId = buildGruaId(patente);

  if (oldId === newId) {
    if (!dryRun && data.id !== newId) {
      await db.collection('gruas').doc(newId).update({ id: newId, patente });
    }
    return {
      oldId,
      newId,
      patente,
      status: 'ok',
      reason: 'ID ya correcto',
    };
  }

  if (reservedNewIds.has(newId) && reservedNewIds.get(newId) !== oldId) {
    return {
      oldId,
      newId,
      patente,
      status: 'error',
      reason: `Conflicto: otra grúa ya migrará al ID ${newId}`,
    };
  }

  const existingNew = await db.collection('gruas').doc(newId).get();
  if (existingNew.exists && existingNew.id !== oldId) {
    return {
      oldId,
      newId,
      patente,
      status: 'error',
      reason: `Ya existe gruas/${newId}`,
    };
  }

  const duplasCount = await countDuplasConGrua(oldId);

  if (dryRun) {
    return {
      oldId,
      newId,
      patente,
      status: 'simulado',
      duplasActualizadas: duplasCount,
    };
  }

  const payload = {
    ...data,
    id: newId,
    patente,
  };

  await db.collection('gruas').doc(newId).set(payload, { merge: false });
  const duplasUpdated = await updateDuplasGruaId(oldId, newId);
  await db.collection('gruas').doc(oldId).delete();

  return {
    oldId,
    newId,
    patente,
    status: 'migrado',
    duplasActualizadas: duplasUpdated,
  };
}

async function main() {
  const destino = useEmulator ? 'emuladores locales' : 'gruasbacar (producción)';
  console.log(`Migración de IDs de grúas (${destino})`);
  console.log(dryRun ? 'MODO: simulación (agregá --apply para ejecutar)\n' : 'MODO: APLICAR CAMBIOS\n');

  const snap = await db.collection('gruas').get();
  const reservedNewIds = new Map();

  for (const doc of snap.docs) {
    const patente = normalizePatente(doc.data()?.patente);
    if (!patente) continue;
    reservedNewIds.set(buildGruaId(patente), doc.id);
  }

  const results = [];
  for (const doc of snap.docs) {
    results.push(await migrateOneGrua(doc, reservedNewIds));
  }

  console.log('--- Resultado ---\n');
  for (const r of results) {
    console.log(`${r.status.toUpperCase()}: ${r.patente ?? r.oldId}`);
    console.log(`  Doc: ${r.oldId}${r.newId && r.newId !== r.oldId ? ` → ${r.newId}` : ''}`);
    if (r.reason) console.log(`  ${r.reason}`);
    if (r.duplasActualizadas) console.log(`  Duplas actualizadas: ${r.duplasActualizadas}`);
    console.log('');
  }

  const migrados = results.filter((r) => r.status === 'migrado' || r.status === 'simulado').length;
  const errores = results.filter((r) => r.status === 'error').length;
  console.log(`Total: ${results.length} | A migrar/simulados: ${migrados} | Errores: ${errores}`);

  if (dryRun && migrados > 0) {
    console.log('\nEjecutá con --apply para aplicar los cambios.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
