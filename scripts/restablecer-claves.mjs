/**
 * Restablece contraseñas de usuarios Auth (post-migración de UIDs).
 *
 * Uso:
 *   node scripts/restablecer-claves.mjs --password="TuClave123!"
 *   node scripts/restablecer-claves.mjs --password="TuClave123!" --apply
 *   node scripts/restablecer-claves.mjs --email=surlymeyer@gmail.com --password="TuClave123!" --apply
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const dryRun = !process.argv.includes('--apply');
const emailFilter = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1]?.toLowerCase();
const passwordArg = process.argv.find((a) => a.startsWith('--password='))?.split('=').slice(1).join('=');

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error('No se encontró ServiceAccountKey.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });

const auth = admin.auth();

async function main() {
  if (!passwordArg || passwordArg.length < 6) {
    console.error('Indicá una contraseña con --password="..." (mínimo 6 caracteres).');
    process.exit(1);
  }

  console.log(dryRun ? 'MODO: simulación (--apply para aplicar)\n' : 'Restableciendo contraseñas...\n');

  const result = await auth.listUsers(1000);
  for (const u of result.users) {
    if (!u.email) continue;
    if (emailFilter && u.email.toLowerCase() !== emailFilter) continue;

    if (dryRun) {
      console.log(`  ${u.email} (${u.uid}) → contraseña se actualizaría`);
      continue;
    }

    await auth.updateUser(u.uid, { password: passwordArg, disabled: false });
    console.log(`  OK: ${u.email} (${u.uid})`);
  }

  if (dryRun) {
    console.log('\nEjecutá con --apply para aplicar.');
  } else {
    console.log('\nListo. Probá iniciar sesión con la contraseña indicada.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
