import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
/** Solo true con VITE_IS_MOCK=true (desarrollo offline). Por defecto usa Firebase real. */
export const isMock = import.meta.env.VITE_IS_MOCK === 'true';
/** Site de prueba (`test-gruasbacar`): las actas nuevas se marcan `esTest` y no aparecen en prod. */
export const esEntornoTest = import.meta.env.VITE_ES_TEST === 'true';

if (import.meta.env.DEV) {
  console.info(
    `[firebase] Auth/perfil: ${isMock ? 'simulación (localStorage)' : 'Firebase real'} | ` +
      `proyecto: ${import.meta.env.VITE_FIREBASE_PROJECT_ID || '(sin configurar)'}` +
      (esEntornoTest ? ' | ENTORNO TEST' : '')
  );
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// TODO: remover después de migración Drive
import { httpsCallable } from 'firebase/functions';
(window as unknown as Record<string, unknown>).__migrarDrive = async (dryRun = true) => {
  const fn = httpsCallable(functions, 'migrarCarpetasDrive', { timeout: 540_000 });
  console.log(`[migración] Ejecutando ${dryRun ? 'DRY RUN' : 'MIGRACIÓN REAL'}... puede tardar varios minutos.`);
  const res = await fn({ dryRun });
  console.table((res.data as Record<string, unknown>));
  console.table((res.data as { details: unknown[] }).details);
  return res.data;
};

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (useEmulators && !globalThis.__GRUASBACAR_EMULATORS__) {
  const emuHost = window.location.hostname;
  connectAuthEmulator(auth, `http://${emuHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emuHost, 8081);
  connectStorageEmulator(storage, emuHost, 9199);
  connectFunctionsEmulator(functions, emuHost, 5001);
  globalThis.__GRUASBACAR_EMULATORS__ = true;
  console.info(`[firebase] Emuladores locales activos en ${emuHost} (Auth, Firestore, Storage, Functions)`);
}

declare global {
  // eslint-disable-next-line no-var
  var __GRUASBACAR_EMULATORS__: boolean | undefined;
}
