import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface RegistrarCuentaPayload {
  email: string;
  password: string;
  nombre: string;
  legajo: string;
}

export async function registrarCuenta(data: RegistrarCuentaPayload): Promise<void> {
  const fn = httpsCallable<RegistrarCuentaPayload, { uid: string }>(
    functions,
    'registrarCuenta'
  );
  await fn(data);
}
