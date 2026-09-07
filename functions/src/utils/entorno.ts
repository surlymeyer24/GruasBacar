/** Entorno de las Cloud Functions: emulador local vs Google Cloud. */

export function enEmulador(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/**
 * Drive de producción queda bloqueado en emulador salvo opt-in explícito
 * con una carpeta de prueba (`DRIVE_EN_EMULADOR=true`).
 */
export function driveHabilitadoEnEmulador(): boolean {
  return process.env.DRIVE_EN_EMULADOR === 'true';
}

/**
 * Si Functions corre en el emulador, exige hosts locales de Firestore/Auth/Storage.
 * Sin eso el Admin SDK habla con el proyecto real.
 */
export function assertAislamientoEmulador(): void {
  if (!enEmulador()) return;

  const faltan: string[] = [];
  if (!process.env.FIRESTORE_EMULATOR_HOST) faltan.push('FIRESTORE_EMULATOR_HOST');
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) faltan.push('FIREBASE_AUTH_EMULATOR_HOST');
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) faltan.push('FIREBASE_STORAGE_EMULATOR_HOST');

  if (faltan.length > 0) {
    throw new Error(
      `[aislamiento] Functions en emulador sin ${faltan.join(', ')}. ` +
        'Abortando para no hablar con producción. Levantá el suite completo: npm run emu'
    );
  }

  const drive = driveHabilitadoEnEmulador()
    ? 'Drive OPT-IN (usá una carpeta de prueba, no la de prod)'
    : 'Drive y FCM bloqueados';
  console.warn(
    `[aislamiento] Emulador aislado — Firestore ${process.env.FIRESTORE_EMULATOR_HOST} | ` +
      `Auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST} | ` +
      `Storage ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}. ${drive}.`
  );
}
