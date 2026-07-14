import { httpsCallable } from "firebase/functions";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Unsubscribe,
} from "firebase/firestore";
import {
  Notificacion,
  AsignarTurnoOperadorPayload,
  AsignacionDiaria,
  SolicitarReconfiguracionTurnoPayload,
} from "@gruasbacar/shared";
import { db, functions, isMock } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

const NOTIFICACIONES_LIMIT = 50;

export function escucharNotificaciones(
  uid: string,
  onData: (items: Notificacion[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  if (isMock || !db) {
    onData([]);
    return () => undefined;
  }

  const q = query(
    collection(db, "notificaciones"),
    where("destinatarioUid", "==", uid),
    orderBy("creadaEn", "desc"),
    limit(NOTIFICACIONES_LIMIT)
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as Notificacion
      );
      onData(items);
    },
    (err) => {
      console.error("Error escuchando notificaciones:", err);
      onError?.(err);
    }
  );
}

export async function marcarNotificacionLeida(notificacionId: string): Promise<void> {
  const fn = httpsCallable<{ notificacionId: string }, { ok: boolean }>(
    functions,
    "marcarNotificacionLeida"
  );
  try {
    await fn({ notificacionId });
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo marcar la notificación."));
  }
}

export async function marcarTodasNotificacionesLeidas(): Promise<number> {
  const fn = httpsCallable<void, { ok: boolean; count: number }>(
    functions,
    "marcarTodasNotificacionesLeidas"
  );
  try {
    const result = await fn();
    return result.data?.count ?? 0;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudieron marcar las notificaciones."));
  }
}

export async function asignarTurnoOperador(
  data: AsignarTurnoOperadorPayload
): Promise<AsignacionDiaria> {
  const fn = httpsCallable<AsignarTurnoOperadorPayload, AsignacionDiaria>(
    functions,
    "asignarTurnoOperador"
  );
  try {
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "No se pudo asignar el turno."));
  }
}

export async function solicitarReconfiguracionTurno(
  data?: SolicitarReconfiguracionTurnoPayload
): Promise<void> {
  const fn = httpsCallable<SolicitarReconfiguracionTurnoPayload, { ok: boolean }>(
    functions,
    "solicitarReconfiguracionTurno"
  );
  try {
    await fn(data ?? {});
  } catch (err) {
    throw new Error(
      getFirebaseErrorMessage(err, "No se pudo enviar la solicitud al administrador.")
    );
  }
}
