import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getFirebaseErrorMessage } from '../utils/firebaseError';

export async function obtenerUrlsPreviewFotos(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  if (driveFileIds.length === 0) return {};
  const fn = httpsCallable<{ driveFileIds: string[] }, Record<string, string>>(
    functions,
    'obtenerUrlsPreviewFotos'
  );
  try {
    const res = await fn({ driveFileIds });
    return res.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, 'No se pudieron cargar las fotos.'));
  }
}

export async function obtenerFotosParaPdf(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  if (driveFileIds.length === 0) return {};
  const fn = httpsCallable<{ driveFileIds: string[] }, Record<string, string>>(
    functions,
    'obtenerFotosParaPdf'
  );
  try {
    const res = await fn({ driveFileIds });
    return res.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, 'No se pudieron cargar las fotos para el PDF.'));
  }
}
