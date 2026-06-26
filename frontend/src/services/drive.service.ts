import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export async function obtenerUrlsPreviewFotos(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  if (driveFileIds.length === 0) return {};
  const fn = httpsCallable<{ driveFileIds: string[] }, Record<string, string>>(
    functions,
    'obtenerUrlsPreviewFotos'
  );
  const res = await fn({ driveFileIds });
  return res.data;
}

export async function obtenerFotosParaPdf(
  driveFileIds: string[]
): Promise<Record<string, string>> {
  if (driveFileIds.length === 0) return {};
  const fn = httpsCallable<{ driveFileIds: string[] }, Record<string, string>>(
    functions,
    'obtenerFotosParaPdf'
  );
  const res = await fn({ driveFileIds });
  return res.data;
}
