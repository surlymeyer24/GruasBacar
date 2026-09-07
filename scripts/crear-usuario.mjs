/**
 * Crea un usuario de prueba en los emuladores (nunca producción).
 * Uso: node scripts/crear-usuario.mjs --email eng2@bacar.com --nombre "Pedro Ruiz" --rol ENGANCHADOR --legajo ENG002 --password Eng123!
 */
import { initEmulatorAdmin } from './lib/initFirebaseAdmin.mjs';
import { buildUsuarioUid } from '../shared/dist/index.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const email = flag('email');
const nombre = flag('nombre');
const rol = flag('rol') || 'ENGANCHADOR';
const legajo = flag('legajo') || null;
const password = flag('password') || 'Test123!';

if (!email || !nombre) {
  console.log('Uso: node scripts/crear-usuario.mjs --email X --nombre "Y" [--rol ROL] [--legajo L] [--password P]');
  process.exit(1);
}

const { admin, db, auth } = initEmulatorAdmin(process.argv);

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
