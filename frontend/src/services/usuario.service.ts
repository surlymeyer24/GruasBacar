import { httpsCallable } from "firebase/functions";
import { RolUsuario, Usuario, AsignacionDiaria, GuardarAsignacionDiariaPayload } from "@gruasbacar/shared";
import { functions } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

export interface CrearUsuarioPayload {
  email: string;
  password: string;
  nombre: string;
  roles: RolUsuario[];
  legajo: string;
}

export interface ActualizarUsuarioPayload {
  uid: string;
  nombre?: string;
  roles?: RolUsuario[];
  legajo?: string;
}

export interface OperadorResumen {
  nombre: string;
  legajo: string;
  roles: string[];
}

export async function listarOperadores(): Promise<OperadorResumen[]> {
  const fn = httpsCallable<void, OperadorResumen[]>(functions, "listarOperadores");
  try {
    const result = await fn();
    return result.data ?? [];
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo cargar la lista de operadores."));
  }
}

export async function obtenerOperadoresActivos(): Promise<OperadorResumen[]> {
  const fn = httpsCallable<void, { operadores?: OperadorResumen[] }>(
    functions,
    "obtenerDatosIniciales"
  );
  try {
    const result = await fn();
    return result.data?.operadores ?? [];
  } catch {
    return [];
  }
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const fn = httpsCallable<void, Usuario[]>(functions, "listarUsuarios");
  try {
    const result = await fn();
    return result.data ?? [];
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo cargar la lista de usuarios."));
  }
}

export async function crearUsuario(data: CrearUsuarioPayload): Promise<{ uid: string }> {
  const fn = httpsCallable<CrearUsuarioPayload, { uid: string }>(functions, "crearUsuario");
  try {
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo crear el usuario. Revisá los datos e intentá de nuevo."));
  }
}

export async function actualizarUsuario(data: ActualizarUsuarioPayload): Promise<void> {
  const fn = httpsCallable<ActualizarUsuarioPayload, void>(functions, "actualizarUsuario");
  try {
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo actualizar el usuario."));
  }
}

export async function desactivarUsuario(uid: string): Promise<void> {
  const fn = httpsCallable<{ uid: string }, void>(functions, "desactivarUsuario");
  try {
    await fn({ uid });
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo desactivar el usuario."));
  }
}

export async function guardarAsignacionDiaria(
  data: GuardarAsignacionDiariaPayload
): Promise<AsignacionDiaria> {
  const fn = httpsCallable<GuardarAsignacionDiariaPayload, AsignacionDiaria>(
    functions,
    "guardarAsignacionDiaria"
  );
  try {
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo guardar la configuración del día."));
  }
}
