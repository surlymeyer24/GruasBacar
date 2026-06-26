/**
 * Predeploy multiplataforma (Windows + Unix).
 * Firebase ejecuta esto desde la raíz del proyecto (firebase.json).
 */
import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const functionsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = join(functionsDir, '..');
const sharedDir = join(rootDir, 'shared');
const vendorDir = join(functionsDir, 'vendor', 'shared');

const opts = { stdio: 'inherit', shell: true };

function findTscBin() {
  const candidates = [
    join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(sharedDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(functionsDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  return candidates.find((p) => existsSync(p));
}

function ensureTypeScript() {
  let tscBin = findTscBin();
  if (tscBin) return tscBin;

  console.log('[predeploy] typescript no encontrado; instalando dependencias en la raíz...');
  execSync('npm install --no-audit --no-fund', { ...opts, cwd: rootDir });

  tscBin = findTscBin();
  if (!tscBin) {
    throw new Error(
      'No se encontró typescript después de npm install. Ejecutá "npm install" en la raíz del proyecto.'
    );
  }
  return tscBin;
}

function compileTs(packageDir, label) {
  const tscBin = ensureTypeScript();
  console.log(`[predeploy] Compilando ${label}...`);
  execSync(`node "${tscBin}"`, { ...opts, cwd: packageDir });
}

compileTs(sharedDir, 'shared');

console.log('[predeploy] Empaquetando @gruasbacar/shared en functions/vendor...');
rmSync(join(functionsDir, 'vendor'), { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });
cpSync(join(sharedDir, 'dist'), join(vendorDir, 'dist'), { recursive: true });
cpSync(join(sharedDir, 'package.json'), join(vendorDir, 'package.json'));

compileTs(functionsDir, 'functions');

console.log('[predeploy] Instalando dependencias de producción en functions/...');
execSync('npm install --omit=dev --no-audit --no-fund', { ...opts, cwd: functionsDir });

console.log('[predeploy] Listo (lib/ + vendor/shared empaquetados para deploy).');
