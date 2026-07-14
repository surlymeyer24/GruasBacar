/**
 * Chequeos pre-deploy: verifica que todo compile y esté listo antes de subir.
 * Uso: node scripts/preflight.mjs
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
const header = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

let errors = 0;

function findTsc() {
  const candidates = [
    join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(ROOT, 'frontend', 'node_modules', 'typescript', 'bin', 'tsc'),
    join(ROOT, 'functions', 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  return candidates.find((p) => existsSync(p)) || 'npx tsc';
}

const TSC = findTsc();

function run(cmd, cwd = ROOT) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe', shell: true });
    return true;
  } catch {
    return false;
  }
}

function runOutput(cmd, cwd = ROOT) {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', shell: true }).toString().trim();
  } catch {
    return '';
  }
}

// ── 1. Git status ──
header('1. Estado de Git');

const branch = runOutput('git branch --show-current');
console.log(`     Rama actual: \x1b[36m${branch}\x1b[0m`);

const dirty = runOutput('git status --porcelain');
if (dirty) {
  warn(`Hay ${dirty.split('\n').length} archivo(s) sin commitear`);
} else {
  ok('Working tree limpio');
}

// ── 2. Dependencias ──
header('2. Dependencias');

if (existsSync(join(ROOT, 'node_modules'))) {
  ok('node_modules (raiz) existe');
} else {
  fail('Faltan node_modules en la raiz - correr npm install');
  errors++;
}

if (existsSync(join(ROOT, 'frontend', 'node_modules'))) {
  ok('node_modules (frontend) existe');
} else {
  fail('Faltan node_modules en frontend - correr npm install');
  errors++;
}

// ── 3. Compilacion shared ──
header('3. Compilacion @gruasbacar/shared');

if (run(`node "${TSC}" --noEmit -p shared/tsconfig.json`)) {
  ok('shared compila sin errores');
} else {
  fail('shared tiene errores de TypeScript');
  errors++;
}

// ── 4. Compilacion functions ──
header('4. Compilacion functions');

if (run(`node "${TSC}" --noEmit -p functions/tsconfig.json`)) {
  ok('functions compila sin errores');
} else {
  fail('functions tiene errores de TypeScript');
  errors++;
}

// ── 5. Compilacion frontend ──
header('5. Compilacion frontend');

if (run(`node "${TSC}" --noEmit -p frontend/tsconfig.json`)) {
  ok('frontend compila sin errores (TS)');
} else {
  fail('frontend tiene errores de TypeScript');
  errors++;
}

// ── 6. Build frontend ──
header('6. Build de produccion (frontend)');

if (run('npx vite build', join(ROOT, 'frontend'))) {
  ok('vite build exitoso');
  const distIndex = join(ROOT, 'frontend', 'dist', 'index.html');
  if (existsSync(distIndex)) {
    ok('frontend/dist/index.html generado');
  } else {
    fail('frontend/dist/index.html no encontrado');
    errors++;
  }
} else {
  fail('vite build fallo');
  errors++;
}

// ── 7. Entorno ──
header('7. Configuracion de entorno');

const envFile = join(ROOT, 'frontend', '.env');
if (existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf-8');
  if (envContent.includes('VITE_FIREBASE_PROJECT_ID=gruasbacar')) {
    ok('Project ID correcto (gruasbacar)');
  } else {
    fail('Project ID incorrecto en frontend/.env');
    errors++;
  }
  if (envContent.includes('VITE_USE_EMULATORS=true')) {
    fail('VITE_USE_EMULATORS=true en .env - el build apuntaria a emuladores!');
    errors++;
  } else {
    ok('No apunta a emuladores');
  }
  if (envContent.includes('VITE_IS_MOCK=true')) {
    fail('VITE_IS_MOCK=true en .env - el build usaria datos mock!');
    errors++;
  } else {
    ok('No usa datos mock');
  }
} else {
  fail('frontend/.env no encontrado');
  errors++;
}

// ── 8. Firebase CLI ──
header('8. Firebase CLI');

const fbVersion = runOutput('firebase --version');
if (fbVersion) {
  ok(`Firebase CLI: ${fbVersion}`);
} else {
  fail('Firebase CLI no instalado (npm install -g firebase-tools)');
  errors++;
}

const fbProject = runOutput('firebase use');
if (fbProject.includes('gruasbacar')) {
  ok(`Proyecto activo: gruasbacar`);
} else {
  warn(`Proyecto activo: ${fbProject || '(ninguno)'} - se esperaba gruasbacar`);
}

// ── Resumen ──
header('─'.repeat(50));

if (errors === 0) {
  console.log('\n\x1b[32m\x1b[1m  Todo listo para deploy.\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\n\x1b[31m\x1b[1m  ${errors} problema(s) encontrado(s). Corregir antes de deployar.\x1b[0m\n`);
  process.exit(1);
}
