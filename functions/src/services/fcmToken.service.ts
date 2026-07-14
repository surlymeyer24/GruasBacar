import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = () => admin.firestore();
const MAX_TOKENS_PER_USER = 10;

export async function registrarFcmToken(uid: string, token: string): Promise<void> {
  const ref = db().collection('usuarios').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');

  const current: string[] = (snap.data()?.fcmTokens as string[]) ?? [];
  if (current.includes(token)) return;

  const updated = [...current, token].slice(-MAX_TOKENS_PER_USER);
  await ref.update({ fcmTokens: updated });
}

export async function eliminarFcmToken(uid: string, token: string): Promise<void> {
  const ref = db().collection('usuarios').doc(uid);
  await ref.update({ fcmTokens: FieldValue.arrayRemove(token) });
}
