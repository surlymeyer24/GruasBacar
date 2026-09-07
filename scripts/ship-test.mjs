/**
 * Deploy del frontend al site de prueba (test-gruasbacar).
 * Misma Firestore/Auth/Functions que prod; el build marca actas con esTest.
 *
 * Uso:
 *   node scripts/ship-test.mjs
 *   node scripts/ship-test.mjs --dry-run
 *
 * Prerrequisitos (una sola vez):
 *   1. Crear el site en Firebase Console → Hosting → Add another site → test-gruasbacar
 *   2. firebase target:apply hosting test test-gruasbacar
 *   3. firebase target:apply hosting production gruasbacar
 */
import { execSync } from 'child_process';
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const banner = (msg) => console.log(`\n\x1b[1m\x1b[43m\x1b[30m  ${msg}  \x1b[0m\n`);
const step = (msg) => console.log(`\x1b[36m>>>\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
const fail = (msg) => console.log(`\x1b[31m  ✗\x1b[0m ${msg}`);

function run(cmd, cwd = ROOT) {
  console.log(`\x1b[90m  $ ${cmd}\x1b[0m`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

banner('DEPLOY A TEST - test-gruasbacar');

console.log('Se va a deployar:');
console.log('  - hosting target "test" (frontend con VITE_ES_TEST=true)');
console.log('  - misma BD / Auth / Functions que producción');
console.log('  - las actas nuevas se marcan esTest y no aparecen en prod\n');

if (dryRun) {
  console.log('\x1b[33m  MODO DRY-RUN: no se va a deployar nada realmente.\x1b[0m\n');
}

const respuesta = await ask(
  `\x1b[33m¿Deployar a TEST (test-gruasbacar)?\x1b[0m (escribi "si" para confirmar): `
);

if (respuesta !== 'si' && respuesta !== 'sí') {
  console.log('\nDeploy cancelado.');
  process.exit(0);
}

const envTestPath = join(FRONTEND, '.env.test.local');
const envProductionPath = join(FRONTEND, '.env.production.local');
const envBackupPath = join(FRONTEND, '.env.production.local.__bak_ship_test');
let restored = false;

function cleanupEnvOverride() {
  if (restored) return;
  try {
    if (existsSync(envProductionPath)) unlinkSync(envProductionPath);
    if (existsSync(envBackupPath)) {
      copyFileSync(envBackupPath, envProductionPath);
      unlinkSync(envBackupPath);
    }
  } catch (e) {
    console.warn('No se pudo restaurar .env.production.local:', e);
  }
  restored = true;
}

process.on('exit', cleanupEnvOverride);
process.on('SIGINT', () => {
  cleanupEnvOverride();
  process.exit(1);
});

try {
  step('Preparando build de test (VITE_ES_TEST=true)...');

  if (existsSync(envProductionPath)) {
    copyFileSync(envProductionPath, envBackupPath);
    unlinkSync(envProductionPath);
  }

  // Vite carga .env.production.local en mode production; lo usamos solo para este build.
  const baseEnv = existsSync(join(FRONTEND, '.env.local'))
    ? '' // el usuario ya tiene secrets en .env.local; Vite también los carga
    : '';
  void baseEnv;

  const envTestContent = [
    '# Generado por scripts/ship-test.mjs — no editar a mano durante el deploy',
    'VITE_ES_TEST=true',
    'VITE_USE_EMULATORS=false',
    'VITE_IS_MOCK=false',
  ].join('\n') + '\n';

  const { writeFileSync } = await import('fs');
  writeFileSync(envProductionPath, envTestContent, 'utf8');
  if (existsSync(envTestPath)) {
    // Opcional: merge de overrides específicos de test
    ok('Usando también frontend/.env.test.local si existe vía copia manual');
  }
  ok('Flag VITE_ES_TEST=true aplicado al build');

  step('Compilando frontend...');
  run('npm run build --workspace=gruasbacar-frontend');
  ok('Build completo');

  step('Deployando hosting:test...');
  if (!dryRun) {
    run('firebase deploy --only hosting:test');
  } else {
    console.log('\x1b[90m  (dry-run) firebase deploy --only hosting:test\x1b[0m');
  }

  banner('DEPLOY TEST EXITOSO');
  console.log('  URL: \x1b[4mhttps://test-gruasbacar.web.app\x1b[0m');
  console.log('  Las actas creadas aquí tienen esTest=true y no se listan en producción.\n');
} catch (e) {
  fail('Deploy test falló. Revisar el error arriba.');
  process.exit(1);
} finally {
  cleanupEnvOverride();
}
