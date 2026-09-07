import { httpsCallable } from "firebase/functions";
import { RegistroITV } from "@gruasbacar/shared";
import { functions, isMock } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

interface CrearITVPayload {
  gruaId: string;
  gruaPatente: string;
  fechaVencimiento: string;
  fechaTurnoRenovacion?: string;
}

interface ActualizarITVPayload {
  itvId: string;
  fechaVencimiento?: string;
  fechaTurnoRenovacion?: string | null;
  renovado?: boolean;
  activo?: boolean;
}

export async function listarITV(): Promise<RegistroITV[]> {
  if (isMock) return [];
  try {
    const fn = httpsCallable<void, RegistroITV[]>(functions, "listarITV");
    const result = await fn();
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de ITV."));
  }
}

export async function crearITV(data: CrearITVPayload): Promise<{ id: string }> {
  if (isMock) return { id: "ITV-000001" };
  try {
    const fn = httpsCallable<CrearITVPayload, { id: string }>(functions, "crearITV");
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de ITV."));
  }
}

export async function actualizarITV(data: ActualizarITVPayload): Promise<void> {
  if (isMock) return;
  try {
    const fn = httpsCallable<ActualizarITVPayload, { ok: boolean }>(functions, "actualizarITV");
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de ITV."));
  }
}

export async function desactivarITV(itvId: string): Promise<void> {
  if (isMock) return;
  try {
    const fn = httpsCallable<{ itvId: string }, { ok: boolean }>(functions, "desactivarITV");
    await fn({ itvId });
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de ITV."));
  }
}
