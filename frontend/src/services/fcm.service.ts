import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { MessagePayload } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { app, functions, isMock } from '../firebase';

const FCM_TOKEN_KEY = 'gruasbacar_fcm_token';

let messagingInstance: ReturnType<typeof getMessaging> | null = null;

function getMsg() {
  if (!messagingInstance) messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function registrarFcmToken(): Promise<string | null> {
  if (isMock) return null;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const swReg = await navigator.serviceWorker.register(
    '/firebase-messaging-sw.js',
    { scope: '/firebase-cloud-messaging-push-scope' },
  );

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('[FCM] VITE_FIREBASE_VAPID_KEY no configurada');
    return null;
  }

  const token = await getToken(getMsg(), {
    vapidKey,
    serviceWorkerRegistration: swReg,
  });

  if (!token) return null;

  const fn = httpsCallable<{ token: string }, { ok: boolean }>(functions, 'registrarFcmToken');
  await fn({ token });

  sessionStorage.setItem(FCM_TOKEN_KEY, token);
  return token;
}

export async function eliminarFcmToken(): Promise<void> {
  if (isMock) return;
  const token = sessionStorage.getItem(FCM_TOKEN_KEY);
  if (!token) return;

  const fn = httpsCallable<{ token: string }, { ok: boolean }>(functions, 'eliminarFcmToken');
  await fn({ token }).catch(console.warn);
  sessionStorage.removeItem(FCM_TOKEN_KEY);
}

export function escucharMensajesForeground(
  callback: (payload: MessagePayload) => void,
): () => void {
  if (isMock) return () => {};
  return onMessage(getMsg(), callback);
}
