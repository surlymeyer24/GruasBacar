import { httpsCallable } from "firebase/functions";
import { ConfigNotificacionesEmail } from "@gruasbacar/shared";
import { functions, isMock } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

const DEFAULTS: ConfigNotificacionesEmail = {
  adminUids: [],
  emailsExtra: [],
};

export async function obtenerConfigNotificaciones(): Promise<ConfigNotificacionesEmail> {
  if (isMock) return DEFAULTS;
  try {
    const fn = httpsCallable<void, ConfigNotificacionesEmail>(functions, "obtenerConfigNotificaciones");
    const result = await fn();
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error al obtener la configuración de notificaciones."));
  }
}

export async function guardarConfigNotificaciones(
  config: ConfigNotificacionesEmail
): Promise<ConfigNotificacionesEmail> {
  if (isMock) return config;
  try {
    const fn = httpsCallable<ConfigNotificacionesEmail, ConfigNotificacionesEmail & { ok: boolean }>(
      functions,
      "guardarConfigNotificaciones"
    );
    const result = await fn(config);
    return {
      adminUids: result.data.adminUids,
      emailsExtra: result.data.emailsExtra,
    };
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error al guardar la configuración de notificaciones."));
  }
}
