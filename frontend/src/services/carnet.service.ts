import { httpsCallable } from "firebase/functions";
import { CarnetDeConducir } from "@gruasbacar/shared";
import { functions, isMock } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

interface CrearCarnetPayload {
  nombre: string;
  legajo: string;
  fechaVencimiento: string;
}

interface ActualizarCarnetPayload {
  carnetId: string;
  fechaVencimiento?: string;
  activo?: boolean;
}

export async function listarCarnets(): Promise<CarnetDeConducir[]> {
  if (isMock) return [];
  try {
    const fn = httpsCallable<void, CarnetDeConducir[]>(functions, "listarCarnets");
    const result = await fn();
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de carnets."));
  }
}

export async function crearCarnet(data: CrearCarnetPayload): Promise<{ id: string }> {
  if (isMock) return { id: "CARNET-000001" };
  try {
    const fn = httpsCallable<CrearCarnetPayload, { id: string }>(functions, "crearCarnet");
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de carnets."));
  }
}

export async function actualizarCarnet(data: ActualizarCarnetPayload): Promise<void> {
  if (isMock) return;
  try {
    const fn = httpsCallable<ActualizarCarnetPayload, { ok: boolean }>(functions, "actualizarCarnet");
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de carnets."));
  }
}

export async function desactivarCarnet(carnetId: string): Promise<void> {
  if (isMock) return;
  try {
    const fn = httpsCallable<{ carnetId: string }, { ok: boolean }>(functions, "desactivarCarnet");
    await fn({ carnetId });
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error en la operación de carnets."));
  }
}
