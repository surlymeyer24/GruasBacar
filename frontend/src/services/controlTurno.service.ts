import { httpsCallable } from "firebase/functions";
import {
  GestionarGruaFueraDeServicioPayload,
  ReactivarGruaPayload,
} from "@gruasbacar/shared";
import { functions } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

export { asignarTurnoOperador } from "./notificacion.service";

export async function gestionarGruaFueraDeServicio(
  data: GestionarGruaFueraDeServicioPayload,
): Promise<void> {
  const fn = httpsCallable<GestionarGruaFueraDeServicioPayload, { ok: boolean }>(
    functions,
    "gestionarGruaFueraDeServicio",
  );
  try {
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo sacar la grúa de servicio."));
  }
}

export async function reactivarGruaEnServicio(
  data: ReactivarGruaPayload,
): Promise<void> {
  const fn = httpsCallable<ReactivarGruaPayload, { ok: boolean }>(
    functions,
    "reactivarGruaEnServicio",
  );
  try {
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo reactivar la grúa."));
  }
}
