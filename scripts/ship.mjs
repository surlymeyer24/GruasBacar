/**
 * Deploy guiado a produccion.
 * Uso:
 *   node scripts/ship.mjs              → deploy completo (hosting + functions + rules)
 *   node scripts/ship.mjs --hosting    → solo hosting (frontend)
 *   node scripts/ship.mjs --functions  → solo Cloud Functions
 *   node scripts/ship.mjs --rules      → solo Firestore + Storage rules e indexes
 *   node scripts/ship.mjs --dry-run    → simula sin deployar
 */
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const onlyHosting = args.includes('--hosting');
const onlyFunctions = args.includes('--functions');
const onlyRules = args.includes('--rules');
const dryRun = args.includes('--dry-run');
const skipPreflight = args.includes('--skip-preflight');
const deployAll = !onlyHosting && !onlyFunctions && !onlyRules;

const banner = (msg) => console.log(`\n\x1b[1m\x1b[44m\x1b[37m  ${msg}  \x1b[0m\n`);
const step = (msg) => console.log(`\x1b[36m>>>\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
const fail = (msg) => console.log(`\x1b[31m  ✗\x1b[0m ${msg}`);

function run(cmd) {
  console.log(`\x1b[90m  $ ${cmd}\x1b[0m`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', shell: true });
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

// ── Que se va a deployar ──
banner('DEPLOY A PRODUCCION - gruasBacar');

const targets = [];
if (deployAll || onlyHosting) targets.push('hosting (frontend)');
if (deployAll || onlyFunctions) targets.push('functions');
if (deployAll || onlyRules) targets.push('firestore rules + indexes', 'storage rules');

console.log('Se va a deployar:');
targets.forEach((t) => console.log(`  - ${t}`));

if (dryRun) {
  console.log('\n\x1b[33m  MODO DRY-RUN: no se va a deployar nada realmente.\x1b[0m');
}

// ── Preflight ──
if (!skipPreflight) {
  step('Ejecutando chequeos pre-deploy...');
  try {
    run('node scripts/preflight.mjs');
  } catch {
    fail('Preflight fallo. Corregir los problemas antes de continuar.');
    process.exit(1);
  }
}

// ── Confirmacion ──
const respuesta = await ask(
  `\n\x1b[33m¿Deployar a PRODUCCION?\x1b[0m (escribi "si" para confirmar): `
);

if (respuesta !== 'si' && respuesta !== 'sí') {
  console.log('\nDeploy cancelado.');
  process.exit(0);
}

// ── Build ──
step('Compilando todo...');
try {
  run('npm run build');
  ok('Build completo');
} catch (e) {
  fail('Build fallo');
  process.exit(1);
}

// ── Deploy ──
const dryFlag = dryRun ? ' --debug' : '';

try {
  if (deployAll) {
    step('Deployando functions + rules + hosting producción...');
    run(`firebase deploy --only functions,firestore,storage,hosting:production${dryFlag}`);
  } else {
    if (onlyHosting) {
      step('Deployando hosting producción (frontend)...');
      run(`firebase deploy --only hosting:production${dryFlag}`);
    }
    if (onlyFunctions) {
      step('Deployando Cloud Functions...');
      run(`firebase deploy --only functions${dryFlag}`);
    }
    if (onlyRules) {
      step('Deployando reglas de Firestore...');
      run(`firebase deploy --only firestore${dryFlag}`);
      step('Deployando reglas de Storage...');
      run(`firebase deploy --only storage${dryFlag}`);
    }
  }

  banner('DEPLOY EXITOSO');
  console.log('  URL: \x1b[4mhttps://gruasbacar.web.app\x1b[0m');
  console.log('  Consola: \x1b[4mhttps://console.firebase.google.com/project/gruasbacar\x1b[0m\n');
} catch (e) {
  fail('Deploy fallo. Revisar el error arriba.');
  process.exit(1);
}
