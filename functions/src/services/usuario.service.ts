import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  RolUsuario,
  GuardarAsignacionDiariaPayload,
  AsignacionDiaria,
  esOperador,
  normalizeTipoFlota,
  buildUsuarioUid,
} from '@gruasbacar/shared';

const db = admin.firestore;

function fechaHoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function mapAuthCreateError(err: unknown): HttpsError {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/email-already-exists') {
    return new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
  }
  if (code === 'auth/invalid-email') {
    return new HttpsError('invalid-argument', 'El correo electrónico no es válido.');
  }
  if (code === 'auth/weak-password') {
    return new HttpsError('invalid-argument', 'La contraseña es demasiado débil.');
  }
  if (code === 'auth/uid-already-exists') {
    return new HttpsError('already-exists', 'Ya existe un usuario con ese identificador.');
  }
  logger.error('Error al crear usuario en Auth', err);
  return new HttpsError('internal', 'No se pudo crear la cuenta. Intentá de nuevo.');
}

async function assertUidDisponible(uid: string): Promise<void> {
  const doc = await db().collection('usuarios').doc(uid).get();
  if (doc.exists) {
    throw new HttpsError('already-exists', 'Ya existe un usuario con ese identificador.');
  }

  try {
    await admin.auth().getUser(uid);
    throw new HttpsError('already-exists', 'Ya existe un usuario con ese identificador.');
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') return;
    throw err;
  }
}

async function assertLegajoUnico(legajo: string | null | undefined, excludeUid?: string): Promise<void> {
  const key = legajo?.trim().toLowerCase();
  if (!key) return;

  const snap = await db().collection('usuarios').select('legajo').get();
  for (const doc of snap.docs) {
    if (excludeUid && doc.id === excludeUid) continue;
    const existing = (doc.data().legajo as string | undefined)?.trim().toLowerCase();
    if (existing && existing === key) {
      throw new HttpsError('already-exists', 'Ya existe un usuario con ese legajo.');
    }
  }
}

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

export interface RegistrarCuentaPayload {
  email: string;
  password: string;
  nombre: string;
  legajo: string;
}

export async function crearUsuario(data: CrearUsuarioPayload): Promise<{ uid: string }> {
  const { email, password, nombre, roles, legajo } = data;

  if (!email || !password || !nombre || !roles || roles.length === 0) {
    throw new HttpsError('invalid-argument', 'Faltan campos requeridos.');
  }

  if (!legajo?.trim()) {
    throw new HttpsError('invalid-argument', 'El legajo es obligatorio.');
  }

  await assertLegajoUnico(legajo);

  let uid: string;
  try {
    uid = buildUsuarioUid({ nombre, roles, legajo });
  } catch {
    throw new HttpsError('invalid-argument', 'No se pudo generar el identificador del usuario.');
  }

  await assertUidDisponible(uid);

  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().createUser({
      uid,
      email,
      password,
      displayName: nombre,
      emailVerified: true,
    });
  } catch (err) {
    throw mapAuthCreateError(err);
  }

  try {
    await db().collection('usuarios').doc(userRecord.uid).set({
      uid: userRecord.uid,
      nombre,
      email,
      roles,
      legajo: legajo.trim(),
      servicioActivoId: null,
      servicioActivoResumen: null,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
    logger.error('Error al guardar perfil de usuario', { uid: userRecord.uid, err });
    throw new HttpsError('internal', 'No se pudo guardar el perfil del usuario.');
  }

  return { uid: userRecord.uid };
}

/** Alta pública de enganchadores (registro desde la pantalla de login). */
export async function registrarCuenta(data: RegistrarCuentaPayload): Promise<{ uid: string }> {
  const email = data.email?.trim().toLowerCase();
  const password = data.password?.trim();
  const nombre = data.nombre?.trim();
  const legajo = data.legajo?.trim();

  if (!email || !password || !nombre || !legajo) {
    throw new HttpsError('invalid-argument', 'Completá email, contraseña, nombre y legajo.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  }

  return crearUsuario({ email, password, nombre, roles: ['ENGANCHADOR'], legajo });
}

export async function actualizarUsuario(data: ActualizarUsuarioPayload): Promise<void> {
  const { uid, nombre, roles, legajo } = data;

  const userDoc = await db().collection('usuarios').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  
  const userData = userDoc.data()!;

  const legajoEfectivo =
    legajo !== undefined ? legajo.trim() : (userData.legajo as string | undefined)?.trim();
  if (!legajoEfectivo) {
    throw new HttpsError('invalid-argument', 'El legajo es obligatorio.');
  }

  const updates: Record<string, unknown> = {};
  if (nombre) updates.nombre = nombre;
  if (roles) updates.roles = roles;
  if (legajo !== undefined) updates.legajo = legajo.trim();

  if (legajo !== undefined) {
    await assertLegajoUnico(legajo, uid);
  }

  if (Object.keys(updates).length === 0) return;

  if (nombre) {
    await admin.auth().updateUser(uid, { displayName: nombre });
  }

  await db().collection('usuarios').doc(uid).update(updates);
}

export async function desactivarUsuario(uid: string): Promise<void> {
  const userDoc = await db().collection('usuarios').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');

  const data = userDoc.data()!;
  if (data.servicioActivoId) {
    throw new HttpsError('failed-precondition', 'El usuario tiene un servicio activo. Cerralo antes de desactivarlo.');
  }

  await Promise.all([
    admin.auth().updateUser(uid, { disabled: true }),
    db().collection('usuarios').doc(uid).update({ activo: false }),
  ]);
}

export async function listarUsuarios(): Promise<unknown[]> {
  const snap = await db().collection('usuarios').get();
  return snap.docs.map((d) => d.data());
}

export async function guardarAsignacionDiaria(
  uid: string,
  data: GuardarAsignacionDiariaPayload
): Promise<AsignacionDiaria> {
  const gruaPatente = data.gruaPatente?.trim();
  const duplaId = data.duplaId?.trim();
  const duplaChofer = data.duplaChofer?.trim();
  const duplaEnganchador = (data.duplaEnganchador ?? data.duplaAyudante)?.trim();
  const inspector = data.inspector?.trim();

  if (!gruaPatente || !duplaId || !duplaChofer || !duplaEnganchador || !inspector) {
    throw new HttpsError('invalid-argument', 'Completá grúa, dupla e inspector.');
  }

  const userDoc = await db().collection('usuarios').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Usuario no encontrado.');
  }

  const userData = userDoc.data()!;
  const roles = userData.roles as RolUsuario[] | undefined;
  const legacyRol = userData.rol as RolUsuario | undefined;
  
  const legacyRolNorm = legacyRol?.trim().toUpperCase();
  const hasOperador =
    esOperador((roles as RolUsuario[] | undefined) ?? []) ||
    legacyRolNorm === 'ENGANCHADOR' ||
    legacyRolNorm === 'AYUDANTE' ||
    legacyRolNorm === 'CHOFER';

  if (!hasOperador) {
    throw new HttpsError('permission-denied', 'Solo los enganchadores pueden configurar el turno del día.');
  }

  const gruaSnap = await db()
    .collection('gruas')
    .where('patente', '==', gruaPatente)
    .where('activa', '==', true)
    .limit(1)
    .get();

  if (gruaSnap.empty) {
    throw new HttpsError('not-found', 'La grúa seleccionada no está habilitada.');
  }

  const gruaData = gruaSnap.docs[0].data();
  const duplaDoc = await db().collection('duplas').doc(duplaId).get();
  if (!duplaDoc.exists || duplaDoc.data()?.activa === false) {
    throw new HttpsError('not-found', 'La dupla seleccionada no está habilitada.');
  }

  const duplaData = duplaDoc.data()!;
  const gruaTipo = normalizeTipoFlota(gruaData.tipo as string | undefined);
  const duplaTipo = normalizeTipoFlota(duplaData.tipo as string | undefined);
  const payloadTipo = normalizeTipoFlota(data.tipoFlota);

  if (gruaTipo !== duplaTipo) {
    throw new HttpsError('invalid-argument', 'La grúa y la dupla deben ser del mismo tipo (tránsito o transporte).');
  }
  if (payloadTipo !== gruaTipo) {
    throw new HttpsError('invalid-argument', 'El tipo seleccionado no coincide con la grúa o dupla elegida.');
  }

  const asignacionDiaria: AsignacionDiaria = {
    fecha: fechaHoyArgentina(),
    gruaPatente,
    duplaId,
    duplaChofer,
    duplaEnganchador,
    inspector,
    tipoFlota: gruaTipo,
    inicioEn: new Date().toISOString(),
  };

  await db().collection('usuarios').doc(uid).update({ asignacionDiaria });
  return asignacionDiaria;
}
