import { httpsCallable } from "firebase/functions";
import { RolUsuario, Usuario, AsignacionDiaria, GuardarAsignacionDiariaPayload } from "@gruasbacar/shared";
import { functions } from "../firebase";

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

export async function listarUsuarios(): Promise<Usuario[]> {
  const fn = httpsCallable<void, Usuario[]>(functions, "listarUsuarios");
  const result = await fn();
  return result.data ?? [];
}

export async function crearUsuario(data: CrearUsuarioPayload): Promise<{ uid: string }> {
  const fn = httpsCallable<CrearUsuarioPayload, { uid: string }>(functions, "crearUsuario");
  const result = await fn(data);
  return result.data;
}

export async function actualizarUsuario(data: ActualizarUsuarioPayload): Promise<void> {
  const fn = httpsCallable<ActualizarUsuarioPayload, void>(functions, "actualizarUsuario");
  await fn(data);
}

export async function desactivarUsuario(uid: string): Promise<void> {
  const fn = httpsCallable<{ uid: string }, void>(functions, "desactivarUsuario");
  await fn({ uid });
}

export async function guardarAsignacionDiaria(
  data: GuardarAsignacionDiariaPayload
): Promise<AsignacionDiaria> {
  const fn = httpsCallable<GuardarAsignacionDiariaPayload, AsignacionDiaria>(
    functions,
    "guardarAsignacionDiaria"
  );
  const result = await fn(data);
  return result.data;
}
