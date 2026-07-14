import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getFirebaseErrorMessage } from '../utils/firebaseError';

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
  try {
    await fn(data);
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, 'No se pudo registrar la cuenta. Revisá los datos e intentá de nuevo.'));
  }
}
