/**
 * Instala dependencias solo si faltan (p. ej. clone nuevo o node_modules borrado).
 * Evita tener que acordarse de `npm install` antes de cada build.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const typescriptPkg = join(rootDir, 'node_modules', 'typescript', 'package.json');

if (existsSync(typescriptPkg)) {
  process.exit(0);
}

console.log('[ensure-deps] Dependencias no encontradas; ejecutando npm install...');
execSync('npm install --no-audit --no-fund', {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

if (!existsSync(typescriptPkg)) {
  console.error('[ensure-deps] Falló: typescript sigue sin estar instalado.');
  process.exit(1);
}
