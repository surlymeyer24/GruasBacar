/**
 * Exporta los datos de Firestore de produccion a un archivo JSON local.
 * Uso: node scripts/backup-firestore.mjs
 *
 * Requiere: firebase-admin con credenciales de service account,
 * o estar logueado con `firebase login` + tener permisos en el proyecto.
 *
 * Alternativa rapida via gcloud (si tenes gcloud CLI):
 *   gcloud firestore export gs://gruasbacar.appspot.com/backups/YYYY-MM-DD
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { requireProdFlag } from './lib/initFirebaseAdmin.mjs';

requireProdFlag(process.argv, 'backup-firestore.mjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const backupsDir = join(ROOT, '.backups');
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = join(backupsDir, timestamp);

const collections = ['usuarios', 'gruas', 'corralones', 'duplas', 'servicios', 'notificaciones'];

const header = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);

header(`Backup de Firestore - ${now.toLocaleString('es-AR')}`);

mkdirSync(backupDir, { recursive: true });

for (const col of collections) {
  process.stdout.write(`  Exportando ${col}...`);
  try {
    const raw = execSync(
      `firebase firestore:get ${col} --project gruasbacar --format json`,
      { cwd: ROOT, stdio: 'pipe', shell: true }
    ).toString();
    writeFileSync(join(backupDir, `${col}.json`), raw, 'utf-8');
    console.log(` \x1b[32m✓\x1b[0m`);
  } catch {
    console.log(` \x1b[33m(vacio o error)\x1b[0m`);
    writeFileSync(join(backupDir, `${col}.json`), '[]', 'utf-8');
  }
}

ok(`Backup guardado en: .backups/${timestamp}/`);
console.log('');

if (!existsSync(join(ROOT, '.gitignore'))) process.exit(0);
import { readFileSync } from 'fs';
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
if (!gitignore.includes('.backups')) {
  console.log('\x1b[33m  Tip: agrega ".backups/" a .gitignore\x1b[0m\n');
}
