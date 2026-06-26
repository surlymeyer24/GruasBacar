/**
 * Migra servicios al ID determinístico = identificadorCompuesto
 * y normaliza grua a formato G-{patente}.
 *
 * Uso:
 *   npm run migrate-servicios
 *   npm run migrate-servicios -- --apply
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  buildIdentificadorCompuesto,
  normalizeGruaId,
} from '../shared/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const dryRun = !process.argv.includes('--apply');

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });

const db = admin.firestore();

async function copySubcollection(fromRef, toRef, name) {
  const snap = await fromRef.collection(name).get();
  if (snap.empty) return 0;
  if (dryRun) return snap.size;

  let batch = db.batch();
  let ops = 0;
  let count = 0;
  for (const doc of snap.docs) {
    batch.set(toRef.collection(name).doc(doc.id), doc.data());
    ops += 1;
    count += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return count;
}

function targetIdFor(data) {
  const patente = (data.patente ?? '').trim();
  const infraccion = (data.numeroInfraccion ?? '').trim();
  const legajo = (data.legajoChofer ?? '').trim();
  if (data.identificadorCompuesto?.trim()) return data.identificadorCompuesto.trim();
  if (patente && infraccion && legajo) {
    return buildIdentificadorCompuesto(infraccion, legajo, patente);
  }
  return null;
}

async function updateUsuariosServicioActivo(oldId, newId) {
  const snap = await db.collection('usuarios').where('servicioActivoId', '==', oldId).get();
  if (snap.empty) return 0;
  if (dryRun) return snap.size;

  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const resumen = data.servicioActivoResumen;
    await doc.ref.update({
      servicioActivoId: newId,
      ...(resumen?.id === oldId
        ? { servicioActivoResumen: { ...resumen, id: newId } }
        : {}),
    });
    updated += 1;
  }
  return updated;
}

async function migrateOne(docSnap) {
  const oldId = docSnap.id;
  const data = docSnap.data() ?? {};
  const newId = targetIdFor(data);

  if (!newId) {
    return { oldId, status: 'error', reason: 'No se pudo calcular identificadorCompuesto' };
  }

  const gruaActual = data.grua ?? '';
  const gruaNueva = normalizeGruaId(gruaActual);
  const idOk = oldId === newId;
  const gruaOk = !gruaActual || gruaActual === gruaNueva;

  if (idOk && gruaOk) {
    return { oldId, newId, status: 'ok', reason: 'Ya correcto' };
  }

  const destinoSnap = await db.collection('servicios').doc(newId).get();
  if (!idOk && destinoSnap.exists && destinoSnap.id !== oldId) {
    return { oldId, newId, status: 'error', reason: `Ya existe servicios/${newId}` };
  }

  if (dryRun) {
    return {
      oldId,
      newId,
      grua: gruaNueva,
      status: 'simulado',
      reason: idOk ? 'Actualizar grua' : 'Mover documento y subcolecciones',
    };
  }

  const payload = { ...data, identificadorCompuesto: newId, grua: gruaNueva };
  const newRef = db.collection('servicios').doc(newId);

  if (!idOk) {
    await newRef.set(payload, { merge: false });
    const eventos = await copySubcollection(docSnap.ref, newRef, 'eventos');
    const fotos = await copySubcollection(docSnap.ref, newRef, 'fotosStaging');
    const usuarios = await updateUsuariosServicioActivo(oldId, newId);
    await docSnap.ref.delete();
    return {
      oldId,
      newId,
      grua: gruaNueva,
      status: 'migrado',
      eventos,
      fotosStaging: fotos,
      usuarios,
    };
  }

  await docSnap.ref.update({ grua: gruaNueva });
  return { oldId, newId, grua: gruaNueva, status: 'migrado', reason: 'Grua normalizada' };
}

async function main() {
  console.log('Migración servicios → ID = identificadorCompuesto');
  console.log(dryRun ? 'MODO: simulación\n' : 'MODO: APLICAR\n');

  const snap = await db.collection('servicios').get();
  const results = [];
  for (const doc of snap.docs) {
    results.push(await migrateOne(doc));
  }

  for (const r of results) {
    console.log(`${r.status.toUpperCase()}: ${r.oldId}${r.newId && r.newId !== r.oldId ? ` → ${r.newId}` : ''}`);
    if (r.grua) console.log(`  grua: ${r.grua}`);
    if (r.reason) console.log(`  ${r.reason}`);
    if (r.eventos) console.log(`  eventos copiados: ${r.eventos}`);
    if (r.usuarios) console.log(`  usuarios actualizados: ${r.usuarios}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
