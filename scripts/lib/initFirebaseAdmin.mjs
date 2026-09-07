/**
 * Dos mundos, dos helpers. Un script no elige emulador vs producción.
 *
 *   initEmulatorAdmin() — solo 127.0.0.1, sin service account
 *   initProdAdmin()     — solo el proyecto real, exige --prod
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const KEY_PATH = join(repoRoot, 'functions/src/auth/ServiceAccountKey.json');
const PROJECT_ID = 'gruasbacar';

const EMULATOR_ENV = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

export function clearEmulatorEnv() {
  for (const key of Object.keys(EMULATOR_ENV)) {
    delete process.env[key];
  }
}

export function applyEmulatorEnv() {
  for (const [key, value] of Object.entries(EMULATOR_ENV)) {
    process.env[key] = value;
  }
}

function emulatorEnvSet() {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST
  );
}

/** Auth/Firestore/Storage locales. Rechaza --prod. No carga credenciales. */
export function initEmulatorAdmin(argv = process.argv) {
  if (argv.includes('--prod')) {
    console.error(
      'Este script solo habla con el emulador local (127.0.0.1). No acepta --prod.\n' +
        'Para copiar datos de producción al emulador: npm run seed'
    );
    process.exit(1);
  }

  applyEmulatorEnv();
  admin.initializeApp({ projectId: PROJECT_ID });
  console.log('Destino: emuladores locales (127.0.0.1) — no hay escritura a producción.\n');

  return {
    admin,
    db: admin.firestore(),
    auth: admin.auth(),
  };
}

function assertProdIntent(argv, scriptName) {
  const label = scriptName ?? 'Este script';

  if (argv.includes('--emulator')) {
    console.error(
      `${label} solo habla con producción. No acepta --emulator.\n` +
        'Datos locales: npm run emu && npm run seed (copia prod → emulador).'
    );
    process.exit(1);
  }

  if (!argv.includes('--prod')) {
    console.error(
      `${label} lee o escribe el proyecto real (gruasbacar).\n` +
        'Pasá --prod para confirmar. El emulador se siembra con npm run seed.'
    );
    process.exit(1);
  }

  if (emulatorEnvSet()) {
    console.error(
      'Hay FIRESTORE_EMULATOR_HOST / AUTH / STORAGE en el entorno.\n' +
        'Abortando: un script de producción no debe correr con variables de emulador.'
    );
    process.exit(1);
  }
}

/** Scripts que usan CLI de Firebase u otra init, pero son de producción. */
export function requireProdFlag(argv, scriptName) {
  assertProdIntent(argv, scriptName);
}

/** Proyecto Firebase real. Rechaza --emulator y variables de emulador. */
export function initProdAdmin(argv = process.argv, options = {}) {
  assertProdIntent(argv, options.scriptName);

  if (options.requireConfirmProd && !argv.includes('--confirmar-prod')) {
    console.error(
      'Esta operación es destructiva sobre PRODUCCIÓN.\n' +
        'Si es intencional, agregá --prod --confirmar-prod'
    );
    process.exit(1);
  }

  clearEmulatorEnv();

  if (!existsSync(KEY_PATH)) {
    console.error('No se encontró functions/src/auth/ServiceAccountKey.json');
    process.exit(1);
  }

  console.warn('\n⚠️  CONECTADO A PRODUCCIÓN (gruasbacar)\n');
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  return {
    admin,
    db: admin.firestore(),
    auth: admin.auth(),
  };
}
