/**
 * Crea un usuario de prueba en los emuladores.
 * Uso: node scripts/crear-usuario.mjs --emulator --email eng2@bacar.com --nombre "Pedro Ruiz" --rol ENGANCHADOR --legajo ENG002 --password Eng123!
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { buildUsuarioUid } from '../shared/dist/index.js';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const useEmulator = args.includes('--emulator');
const email = flag('email');
const nombre = flag('nombre');
const rol = flag('rol') || 'ENGANCHADOR';
const legajo = flag('legajo') || null;
const password = flag('password') || 'Test123!';

if (!email || !nombre) {
  console.log('Uso: node scripts/crear-usuario.mjs --emulator --email X --nombre "Y" [--rol ROL] [--legajo L] [--password P]');
  process.exit(1);
}

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  admin.initializeApp({ projectId: 'gruasbacar' });
} else {
  const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
  if (!existsSync(keyPath)) {
    console.error('No se encontró ServiceAccountKey.json');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();
const auth = admin.auth();

const roles = [rol];
const uid = buildUsuarioUid({ nombre, roles, legajo });

try {
  const record = await auth.createUser({ uid, email, password, displayName: nombre });
  await db.collection('usuarios').doc(record.uid).set({
    uid: record.uid,
    nombre,
    email,
    rol,
    roles,
    legajo,
    servicioActivoId: null,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`\nUsuario creado:`);
  console.log(`  Nombre:  ${nombre}`);
  console.log(`  Email:   ${email}`);
  console.log(`  Rol:     ${rol}`);
  console.log(`  Legajo:  ${legajo || '(sin legajo)'}`);
  console.log(`  UID:     ${record.uid}`);
  console.log(`  Password: ${password}`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
