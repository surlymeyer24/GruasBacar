import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  RolUsuario,
  GuardarAsignacionDiariaPayload,
  AsignacionDiaria,
  AsignarTurnoOperadorPayload,
  SolicitarReconfiguracionTurnoPayload,
  esOperador,
  esSuperAdmin,
  normalizeRoles,
  normalizeTipoFlota,
  buildUsuarioUid,
  asignacionCoincideConUsuario,
  turnoSigueVigente,
  RUTA_NOTIF_TURNOS,
} from '@gruasbacar/shared';
import * as notificationService from './notification.service';

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

export async function crearUsuario(data: CrearUsuarioPayload, callerRoles?: RolUsuario[]): Promise<{ uid: string }> {
  const { email, password, nombre, roles, legajo } = data;

  if (!email || !password || !nombre || !roles || roles.length === 0) {
    throw new HttpsError('invalid-argument', 'Faltan campos requeridos.');
  }

  if (nombre.length > 100) {
    throw new HttpsError('invalid-argument', 'El nombre no puede superar los 100 caracteres.');
  }

  if (roles.includes('SUPERADMIN') && !esSuperAdmin(callerRoles ?? [])) {
    throw new HttpsError('permission-denied', 'Solo un Super Admin puede asignar el rol SUPERADMIN.');
  }

  if (!legajo?.trim()) {
    throw new HttpsError('invalid-argument', 'El legajo es obligatorio.');
  }

  if (legajo.trim().length > 50) {
    throw new HttpsError('invalid-argument', 'El legajo no puede superar los 50 caracteres.');
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
      creadoEn: FieldValue.serverTimestamp(),
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
  if (nombre.length > 100) {
    throw new HttpsError('invalid-argument', 'El nombre no puede superar los 100 caracteres.');
  }
  if (legajo.length > 50) {
    throw new HttpsError('invalid-argument', 'El legajo no puede superar los 50 caracteres.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  }

  return crearUsuario({ email, password, nombre, roles: ['ENGANCHADOR'], legajo });
}

export async function actualizarUsuario(data: ActualizarUsuarioPayload, callerRoles?: RolUsuario[]): Promise<void> {
  const { uid, nombre, roles, legajo } = data;

  if (roles?.includes('SUPERADMIN') && !esSuperAdmin(callerRoles ?? [])) {
    throw new HttpsError('permission-denied', 'Solo un Super Admin puede asignar el rol SUPERADMIN.');
  }

  const userDoc = await db().collection('usuarios').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  
  const userData = userDoc.data()!;

  const legajoEfectivo =
    legajo !== undefined ? legajo.trim() : (userData.legajo as string | undefined)?.trim();
  if (!legajoEfectivo) {
    throw new HttpsError('invalid-argument', 'El legajo es obligatorio.');
  }

  const updates: Record<string, unknown> = {};
  if (nombre) {
    if (nombre.length > 100) {
      throw new HttpsError('invalid-argument', 'El nombre no puede superar los 100 caracteres.');
    }
    updates.nombre = nombre;
  }
  if (roles) updates.roles = roles;
  if (legajo !== undefined) {
    if (legajo.trim().length > 50) {
      throw new HttpsError('invalid-argument', 'El legajo no puede superar los 50 caracteres.');
    }
    updates.legajo = legajo.trim();
  }

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

export async function listarOperadores(): Promise<{ nombre: string; legajo: string; roles: string[] }[]> {
  const snap = await db().collection('usuarios')
    .where('activo', '!=', false)
    .get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      const roles = normalizeRoles(data.roles as any[] | undefined, data.rol as string | undefined);
      if (!esOperador(roles)) return null;
      return {
        nombre: (data.nombre as string) ?? '',
        legajo: (data.legajo as string) ?? '',
        roles: roles as string[],
      };
    })
    .filter(Boolean) as { nombre: string; legajo: string; roles: string[] }[];
}

export async function guardarAsignacionDiaria(
  uid: string,
  data: GuardarAsignacionDiariaPayload
): Promise<AsignacionDiaria> {
  const gruaPatente = data.gruaPatente?.trim();
  const duplaId = data.duplaId?.trim();
  const duplaChofer = data.duplaChofer?.trim();
  const duplaEnganchador = (data.duplaEnganchador ?? data.duplaAyudante)?.trim();

  if (!gruaPatente || !duplaChofer || !duplaEnganchador) {
    throw new HttpsError('invalid-argument', 'Completá grúa, chofer y enganchador.');
  }

  if (gruaPatente.length > 20) {
    throw new HttpsError('invalid-argument', 'La patente de grúa no puede superar los 20 caracteres.');
  }
  if (duplaChofer.length > 100) {
    throw new HttpsError('invalid-argument', 'El nombre del chofer no puede superar los 100 caracteres.');
  }
  if (duplaEnganchador.length > 100) {
    throw new HttpsError('invalid-argument', 'El nombre del enganchador no puede superar los 100 caracteres.');
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
  const gruaTipo = normalizeTipoFlota(gruaData.tipo as string | undefined);
  const payloadTipo = normalizeTipoFlota(data.tipoFlota);

  if (payloadTipo !== gruaTipo) {
    throw new HttpsError('invalid-argument', 'El tipo seleccionado no coincide con la grúa elegida.');
  }

  let legajoChofer = (data as any).legajoChofer?.trim() as string | undefined;
  let legajoEnganchador = (data as any).legajoEnganchador?.trim() as string | undefined;

  if (duplaId) {
    const duplaDoc = await db().collection('duplas').doc(duplaId).get();
    if (!duplaDoc.exists || duplaDoc.data()?.activa === false) {
      throw new HttpsError('not-found', 'La dupla seleccionada no está habilitada.');
    }
    const duplaData = duplaDoc.data()!;
    if (!legajoChofer) legajoChofer = (duplaData.legajoChofer as string | undefined)?.trim();
    if (!legajoEnganchador) legajoEnganchador = (duplaData.legajoEnganchador as string | undefined)?.trim();
  }

  const asignacionDiaria: AsignacionDiaria = {
    fecha: fechaHoyArgentina(),
    gruaPatente,
    duplaId: duplaId || '',
    duplaChofer,
    duplaEnganchador,
    tipoFlota: gruaTipo,
    inicioEn: new Date().toISOString(),
    ...(legajoChofer ? { legajoChofer } : {}),
    ...(legajoEnganchador ? { legajoEnganchador } : {}),
  };

  await db().collection('usuarios').doc(uid).update({ asignacionDiaria });
  return asignacionDiaria;
}

const SOLICITUD_RECONFIG_MIN_MS = 30 * 60 * 1000;

export async function asignarTurnoOperador(
  data: AsignarTurnoOperadorPayload,
  adminCtx: { uid: string; nombre: string }
): Promise<AsignacionDiaria> {
  const operadorUid = data.operadorUid?.trim();
  if (!operadorUid) {
    throw new HttpsError('invalid-argument', 'Falta el operador.');
  }

  const asignacion = data.asignacionDiaria;
  if (!asignacion?.gruaPatente?.trim() || !asignacion.duplaChofer?.trim() || !asignacion.duplaEnganchador?.trim()) {
    throw new HttpsError('invalid-argument', 'Completá grúa, chofer y enganchador.');
  }

  const userDoc = await db().collection('usuarios').doc(operadorUid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Operador no encontrado.');
  }

  const userData = userDoc.data()!;
  if (userData.activo === false) {
    throw new HttpsError('failed-precondition', 'El operador está desactivado.');
  }

  const roles = userData.roles as RolUsuario[] | undefined;
  const legacyRol = userData.rol as RolUsuario | undefined;
  const legacyRolNorm = legacyRol?.trim().toUpperCase();
  const hasOperador =
    esOperador((roles as RolUsuario[] | undefined) ?? []) ||
    legacyRolNorm === 'ENGANCHADOR' ||
    legacyRolNorm === 'AYUDANTE' ||
    legacyRolNorm === 'CHOFER';

  if (!hasOperador) {
    throw new HttpsError('invalid-argument', 'El usuario seleccionado no es operador de campo.');
  }

  const gruaPatente = asignacion.gruaPatente.trim();
  const gruaSnap = await db()
    .collection('gruas')
    .where('patente', '==', gruaPatente)
    .where('activa', '==', true)
    .limit(1)
    .get();

  if (gruaSnap.empty) {
    throw new HttpsError('not-found', 'La grúa seleccionada no está habilitada.');
  }

  const gruaDescripcion = (gruaSnap.docs[0].data().descripcion as string | undefined)?.trim() || '';

  const duplaId = asignacion.duplaId?.trim();
  if (duplaId) {
    const duplaDoc = await db().collection('duplas').doc(duplaId).get();
    if (!duplaDoc.exists || duplaDoc.data()?.activa === false) {
      throw new HttpsError('not-found', 'La dupla seleccionada no está habilitada.');
    }
  }

  const prevAsignacion = userData.asignacionDiaria as AsignacionDiaria | undefined;
  const hoy = fechaHoyArgentina();
  const teniaTurnoHoy =
    prevAsignacion?.fecha === hoy && turnoSigueVigente(prevAsignacion);

  const asignacionDiaria: AsignacionDiaria = {
    ...asignacion,
    fecha: asignacion.fecha?.trim() || hoy,
    gruaPatente,
    ...(gruaDescripcion ? { gruaDescripcion } : {}),
    duplaChofer: asignacion.duplaChofer.trim(),
    duplaEnganchador: asignacion.duplaEnganchador.trim(),
    inicioEn: asignacion.inicioEn || new Date().toISOString(),
  };

  if (!asignacionDiaria.legajoChofer) delete asignacionDiaria.legajoChofer;
  if (!asignacionDiaria.legajoEnganchador) delete asignacionDiaria.legajoEnganchador;

  await db().collection('usuarios').doc(operadorUid).update({ asignacionDiaria });

  const tipo = teniaTurnoHoy ? 'TURNO_MODIFICADO' : 'TURNO_ASIGNADO';
  const titulo = tipo === 'TURNO_ASIGNADO' ? 'Turno asignado' : 'Turno actualizado';
  const cuerpo =
    `${adminCtx.nombre} diagramó tu turno: grúa ${gruaDescripcion ? `${gruaDescripcion} — ` : ''}${gruaPatente}, ` +
    `dupla ${asignacionDiaria.duplaChofer} / ${asignacionDiaria.duplaEnganchador}.`;

  await notificationService.crearNotificacion({
    destinatarioUid: operadorUid,
    tipo,
    titulo,
    cuerpo,
    origenUid: adminCtx.uid,
    datos: {
      gruaPatente,
      duplaChofer: asignacionDiaria.duplaChofer,
      duplaEnganchador: asignacionDiaria.duplaEnganchador,
      asignadoPorNombre: adminCtx.nombre,
    },
  });

  return asignacionDiaria;
}

export async function solicitarReconfiguracionTurno(
  uid: string,
  data: SolicitarReconfiguracionTurnoPayload,
  operador: { nombre: string; legajo?: string }
): Promise<{ ok: true }> {
  const userDoc = await db().collection('usuarios').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Usuario no encontrado.');
  }

  const userData = userDoc.data()!;
  const asignacion = userData.asignacionDiaria as AsignacionDiaria | undefined;
  const tieneVigente = asignacion && turnoSigueVigente(asignacion);

  if (tieneVigente && asignacionCoincideConUsuario(asignacion, { nombre: operador.nombre, legajo: operador.legajo })) {
    throw new HttpsError('failed-precondition', 'Tu turno ya coincide con tu usuario. Podés configurarlo vos mismo.');
  }

  const lastMs = userData.ultimaSolicitudReconfigTurnoMs as number | undefined;
  if (lastMs && Date.now() - lastMs < SOLICITUD_RECONFIG_MIN_MS) {
    throw new HttpsError(
      'resource-exhausted',
      'Ya enviaste una solicitud recientemente. Esperá unos minutos antes de volver a avisar.'
    );
  }

  const mensaje = data.mensaje?.trim().slice(0, 300);
  const legajoTxt = operador.legajo ? ` (leg. ${operador.legajo})` : '';
  const cuerpoBase = tieneVigente
    ? `${operador.nombre}${legajoTxt} necesita que reconfigures su turno. ` +
      `Dupla actual: ${asignacion.duplaChofer} / ${asignacion.duplaEnganchador}, grúa ${asignacion.gruaPatente}.`
    : `${operador.nombre}${legajoTxt} no tiene turno configurado y necesita asistencia.`;
  const cuerpo = mensaje ? `${cuerpoBase} Mensaje: "${mensaje}"` : cuerpoBase;

  const claveDedup = `reconfig_turno:${uid}:${Math.floor(Date.now() / SOLICITUD_RECONFIG_MIN_MS)}`;

  await notificationService.notificarAdmins({
    tipo: 'SOLICITUD_RECONFIG_TURNO',
    titulo: 'Solicitud de reconfiguración de turno',
    cuerpo,
    origenUid: uid,
    claveDedup,
    datos: {
      operadorUid: uid,
      operadorNombre: operador.nombre,
      ...(operador.legajo ? { operadorLegajo: operador.legajo } : {}),
      ...(tieneVigente ? {
        gruaPatente: asignacion.gruaPatente,
        duplaChofer: asignacion.duplaChofer,
        duplaEnganchador: asignacion.duplaEnganchador,
      } : {}),
      accionRuta: RUTA_NOTIF_TURNOS,
      ...(mensaje ? { mensaje } : {}),
    },
  });

  await db().collection('usuarios').doc(uid).update({
    ultimaSolicitudReconfigTurnoMs: Date.now(),
  });

  return { ok: true };
}
