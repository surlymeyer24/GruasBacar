import { FirebaseError } from 'firebase/app';

const GENERIC_INTERNAL =
  'Error interno del servidor. Si persiste, avisá al administrador.';

/** Mensaje legible desde errores de Callable / Auth / Firestore. */
export function getFirebaseErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof FirebaseError) {
    const msg = err.message?.trim() ?? '';
    const code = err.code ?? '';

    if (msg && msg !== 'internal' && !msg.startsWith('Firebase:')) {
      return msg;
    }

    if (code === 'functions/internal') {
      return GENERIC_INTERNAL;
    }
    if (code === 'functions/failed-precondition') {
      return msg && msg !== 'internal'
        ? msg
        : 'No se cumplen los requisitos para esta operación.';
    }
    if (code === 'functions/invalid-argument') {
      return msg || 'Datos inválidos. Revisá las fotos e intentá de nuevo.';
    }
    if (code === 'functions/permission-denied') {
      return msg || 'No tenés permiso para realizar esta acción.';
    }
    if (code === 'functions/not-found') {
      return msg || 'No se encontró el recurso solicitado.';
    }
    if (code === 'functions/already-exists') {
      return msg || 'El recurso ya existe.';
    }
    if (code === 'functions/unauthenticated') {
      return 'Debés iniciar sesión para continuar.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Ya existe una cuenta con ese correo.';
    }
    if (code === 'auth/invalid-email') {
      return 'El correo electrónico no es válido.';
    }
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Correo o contraseña incorrectos.';
    }
    if (code === 'auth/user-not-found') {
      return 'No existe una cuenta con ese correo electrónico.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
    }
  }

  if (err instanceof Error && err.message) {
    const msg = err.message.trim();
    if (msg && msg !== 'internal') return msg;
  }

  return fallback;
}
