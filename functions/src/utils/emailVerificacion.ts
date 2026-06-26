import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

interface IdentityToolkitError {
  error?: { message?: string };
}

async function identityToolkitRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'FIREBASE_WEB_API_KEY no está configurada en Functions. No se puede enviar el email de verificación.'
    );
  }

  const res = await fetch(`${IDENTITY_TOOLKIT}/${path}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T & IdentityToolkitError;
  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new HttpsError('internal', `No se pudo enviar el email de verificación: ${msg}`);
  }
  return data;
}

/** Envía el email de verificación de Firebase Auth usando las plantillas del proyecto. */
export async function enviarEmailVerificacion(uid: string): Promise<void> {
  const continueUrl = process.env.APP_CONTINUE_URL?.trim();
  const customToken = await admin.auth().createCustomToken(uid);

  const signIn = await identityToolkitRequest<{ idToken: string }>(
    'accounts:signInWithCustomToken',
    { token: customToken, returnSecureToken: true }
  );

  const payload: Record<string, unknown> = {
    requestType: 'VERIFY_EMAIL',
    idToken: signIn.idToken,
  };
  if (continueUrl) {
    payload.continueUrl = continueUrl;
  }

  await identityToolkitRequest('accounts:sendOobCode', payload);
  logger.info('Email de verificación enviado', { uid });
}
