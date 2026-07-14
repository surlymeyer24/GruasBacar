import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onCall, CallableOptions, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as servicioService from './services/servicio.service';
import * as carnetService from './services/carnet.service';
import * as itvService from './services/itv.service';
import * as usuarioService from './services/usuario.service';
import * as mapsService from './services/maps.service';
import { verificarAuth, verificarAdmin, verificarGestionActas, verificarOperador } from './middleware/auth.middleware';
import { withHttpsErrorHandling } from './utils/callableHandler';

const googleDriveFolderId = defineSecret('GOOGLE_DRIVE_FOLDER_ID');

admin.initializeApp();

setGlobalOptions({
  region: 'us-central1',
  invoker: 'public',
});

/** Callable v2: invoker público + CORS abierto (auth real en verificar*). */
const callable: CallableOptions = {
  cors: true,
  invoker: 'public',
};

const callableWithDrive: CallableOptions = {
  ...callable,
  secrets: [googleDriveFolderId],
  timeoutSeconds: 300,
  memory: '512MiB',
};

export const obtenerDatosIniciales = onCall(callable, withHttpsErrorHandling('obtenerDatosIniciales', async (request) => {
  await verificarAuth(request.auth);
  return servicioService.obtenerDatosIniciales();
}));

export const resolverLinkMaps = onCall(callable, withHttpsErrorHandling('resolverLinkMaps', async (request) => {
  await verificarAdmin(request.auth);
  if (!request.data?.url) {
    throw new HttpsError('invalid-argument', 'URL is required');
  }
  const result = await mapsService.resolveMapsLink(request.data.url);
  if (!result) {
    throw new HttpsError('not-found', 'Could not extract coordinates from link');
  }
  return result;
}));

export const iniciarEnganche = onCall(callableWithDrive, withHttpsErrorHandling('iniciarEnganche', async (request) => {
  const ctx = await verificarOperador(request.auth);
  return servicioService.iniciarEnganche(
    request.data,
    ctx.uid,
    googleDriveFolderId.value()
  );
}));

export const registrarEventoEnganche = onCall(callableWithDrive, withHttpsErrorHandling('registrarEventoEnganche', async (request) => {
  const ctx = await verificarOperador(request.auth);
  await servicioService.registrarEventoEnganche(
    request.data ?? {},
    ctx.uid,
    googleDriveFolderId.value()
  );
  return { ok: true };
}));

export const subirFotoEvento = onCall(callableWithDrive, withHttpsErrorHandling('subirFotoEvento', async (request) => {
  const ctx = await verificarOperador(request.auth);
  return servicioService.subirFotoEvento(
    request.data ?? {},
    ctx.uid,
    googleDriveFolderId.value()
  );
}));

/** Trigger: foto subida a Storage → Drive → fotosStaging → borra Storage.
 *  Debe estar en la misma región que el bucket (us-east1). */
export const procesarFotoStorage = onObjectFinalized(
  {
    region: 'us-east1',
    secrets: [googleDriveFolderId],
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath?.startsWith('servicios/')) return;

    const fotoStorage = await import('./services/fotoStorage.service');
    await fotoStorage.procesarFotoDesdeStorage(
      event.data.bucket,
      filePath,
      googleDriveFolderId.value(),
      event.data.metadata
    );
  }
);

export const iniciarTraslado = onCall(callable, withHttpsErrorHandling('iniciarTraslado', async (request) => {
  const ctx = await verificarOperador(request.auth);
  await servicioService.iniciarTraslado(request.data?.servicioId, ctx.uid);
  return { ok: true };
}));

export const liberarServicioActivoSiHuerfano = onCall(callable, withHttpsErrorHandling('liberarServicioActivoSiHuerfano', async (request) => {
  const ctx = await verificarOperador(request.auth);
  return servicioService.liberarServicioActivoSiHuerfano(ctx.uid);
}));

export const registrarLlegadaCorralon = onCall(callable, withHttpsErrorHandling('registrarLlegadaCorralon', async (request) => {
  const ctx = await verificarOperador(request.auth);
  const result = await servicioService.registrarLlegadaCorralon(request.data, ctx.uid);
  return { ok: true, yaRegistrada: result.yaRegistrada };
}));

export const confirmarDesenganche = onCall(callableWithDrive, withHttpsErrorHandling('confirmarDesenganche', async (request) => {
  const ctx = await verificarOperador(request.auth);
  await servicioService.confirmarDesenganche(
    request.data,
    ctx.uid,
    googleDriveFolderId.value()
  );
  return { ok: true };
}));

export const anularServicio = onCall(callable, withHttpsErrorHandling('anularServicio', async (request) => {
  const ctx = await verificarAuth(request.auth);
  const puedeGestionar =
    ctx.roles.includes('SUPERADMIN') || ctx.roles.includes('ADMIN') || ctx.roles.includes('SUPERVISOR');
  await servicioService.anularServicio(request.data, ctx, puedeGestionar);
  return { ok: true };
}));

export const actualizarServicio = onCall(callable, withHttpsErrorHandling('actualizarServicio', async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  await servicioService.actualizarServicio(request.data, ctx);
  return { ok: true };
}));

export const agregarComentarioFoto = onCall(callable, withHttpsErrorHandling('agregarComentarioFoto', async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  const comentario = await servicioService.agregarComentarioFoto(
    request.data ?? {},
    ctx.uid,
    ctx.nombre
  );
  return { comentario };
}));

export const crearActaManual = onCall(callableWithDrive, withHttpsErrorHandling('crearActaManual', async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  return servicioService.crearActaManual(
    request.data ?? {},
    ctx,
    googleDriveFolderId.value()
  );
}));

// Gestión de usuarios (solo admin)
export const crearUsuario = onCall(callable, withHttpsErrorHandling('crearUsuario', async (request) => {
  const ctx = await verificarAdmin(request.auth);
  return usuarioService.crearUsuario(request.data, ctx.roles);
}));

export const registrarCuenta = onCall(callable, withHttpsErrorHandling('registrarCuenta', async (request) => {
  await verificarAdmin(request.auth);
  return usuarioService.registrarCuenta(request.data);
}));

export const actualizarUsuario = onCall(callable, withHttpsErrorHandling('actualizarUsuario', async (request) => {
  const ctx = await verificarAdmin(request.auth);
  await usuarioService.actualizarUsuario(request.data, ctx.roles);
  return { ok: true };
}));

export const desactivarUsuario = onCall(callable, withHttpsErrorHandling('desactivarUsuario', async (request) => {
  await verificarAdmin(request.auth);
  await usuarioService.desactivarUsuario(request.data.uid);
  return { ok: true };
}));

export const listarUsuarios = onCall(callable, withHttpsErrorHandling('listarUsuarios', async (request) => {
  await verificarGestionActas(request.auth);
  return usuarioService.listarUsuarios();
}));

export const listarOperadores = onCall(callable, withHttpsErrorHandling('listarOperadores', async (request) => {
  await verificarOperador(request.auth);
  return usuarioService.listarOperadores();
}));

export const guardarAsignacionDiaria = onCall(callable, withHttpsErrorHandling('guardarAsignacionDiaria', async (request) => {
  const ctx = await verificarOperador(request.auth);
  return usuarioService.guardarAsignacionDiaria(ctx.uid, request.data ?? {});
}));

export const asignarTurnoOperador = onCall(callable, withHttpsErrorHandling('asignarTurnoOperador', async (request) => {
  const ctx = await verificarAdmin(request.auth);
  return usuarioService.asignarTurnoOperador(request.data ?? {}, ctx);
}));

export const solicitarReconfiguracionTurno = onCall(callable, withHttpsErrorHandling('solicitarReconfiguracionTurno', async (request) => {
  const ctx = await verificarOperador(request.auth);
  const userDoc = await admin.firestore().collection('usuarios').doc(ctx.uid).get();
  const legajo = userDoc.data()?.legajo as string | undefined;
  return usuarioService.solicitarReconfiguracionTurno(ctx.uid, request.data ?? {}, {
    nombre: ctx.nombre,
    legajo,
  });
}));

export const marcarNotificacionLeida = onCall(callable, withHttpsErrorHandling('marcarNotificacionLeida', async (request) => {
  const ctx = await verificarAuth(request.auth);
  const notificacionId = request.data?.notificacionId as string | undefined;
  if (!notificacionId?.trim()) {
    throw new HttpsError('invalid-argument', 'Falta el id de la notificación.');
  }
  try {
    const notificationService = await import('./services/notification.service');
    await notificationService.marcarNotificacionLeida(ctx.uid, notificacionId.trim());
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'NOT_FOUND') throw new HttpsError('not-found', 'Notificación no encontrada.');
    if (msg === 'PERMISSION_DENIED') throw new HttpsError('permission-denied', 'No podés modificar esta notificación.');
    throw err;
  }
  return { ok: true };
}));

export const marcarTodasNotificacionesLeidas = onCall(callable, withHttpsErrorHandling('marcarTodasNotificacionesLeidas', async (request) => {
  const ctx = await verificarAuth(request.auth);
  const notificationService = await import('./services/notification.service');
  const count = await notificationService.marcarTodasNotificacionesLeidas(ctx.uid);
  return { ok: true, count };
}));

/** Prueba acceso a Google Drive (solo admin). Crea un .txt de verificación en la carpeta configurada. */
export const verificarDrive = onCall(
  { ...callable, secrets: [googleDriveFolderId] },
  withHttpsErrorHandling('verificarDrive', async (request) => {
    await verificarAdmin(request.auth);
    const drive = await import('./services/drive.service');
    return drive.verificarAccesoDrive(googleDriveFolderId.value());
  })
);

/** URLs de vista previa para fotos guardadas en Drive (historial / actas). */
export const obtenerUrlsPreviewFotos = onCall(
  { ...callable, secrets: [googleDriveFolderId] },
  withHttpsErrorHandling('obtenerUrlsPreviewFotos', async (request) => {
    await verificarAuth(request.auth);
    const driveFileIds = request.data?.driveFileIds;
    if (!Array.isArray(driveFileIds) || driveFileIds.some((id) => typeof id !== 'string')) {
      throw new HttpsError('invalid-argument', 'driveFileIds debe ser un array de strings.');
    }
    const drive = await import('./services/drive.service');
    return drive.obtenerUrlsPreviewFotos(driveFileIds.slice(0, 50));
  })
);

/** Imágenes en base64 para exportar actas a PDF. */
export const obtenerFotosParaPdf = onCall(
  { ...callable, secrets: [googleDriveFolderId], timeoutSeconds: 120, memory: '512MiB' },
  withHttpsErrorHandling('obtenerFotosParaPdf', async (request) => {
    await verificarAuth(request.auth);
    const driveFileIds = request.data?.driveFileIds;
    if (!Array.isArray(driveFileIds) || driveFileIds.some((id) => typeof id !== 'string')) {
      throw new HttpsError('invalid-argument', 'driveFileIds debe ser un array de strings.');
    }
    const drive = await import('./services/drive.service');
    return drive.obtenerFotosParaPdf(driveFileIds);
  })
);

// ── FCM tokens ──────────────────────────────────────────────

export const registrarFcmToken = onCall(callable, withHttpsErrorHandling('registrarFcmToken', async (request) => {
  const ctx = await verificarAuth(request.auth);
  const token = request.data?.token as string | undefined;
  if (!token?.trim()) {
    throw new HttpsError('invalid-argument', 'Token FCM requerido.');
  }
  const fcmTokenService = await import('./services/fcmToken.service');
  await fcmTokenService.registrarFcmToken(ctx.uid, token.trim());
  return { ok: true };
}));

export const eliminarFcmToken = onCall(callable, withHttpsErrorHandling('eliminarFcmToken', async (request) => {
  const ctx = await verificarAuth(request.auth);
  const token = request.data?.token as string | undefined;
  if (!token?.trim()) {
    throw new HttpsError('invalid-argument', 'Token FCM requerido.');
  }
  const fcmTokenService = await import('./services/fcmToken.service');
  await fcmTokenService.eliminarFcmToken(ctx.uid, token.trim());
  return { ok: true };
}));

// ── Carnets de conducir ──────────────────────────────────────

export const crearCarnet = onCall(callable, withHttpsErrorHandling('crearCarnet', async (request) => {
  await verificarAdmin(request.auth);
  return carnetService.crearCarnet(request.data);
}));

export const actualizarCarnet = onCall(callable, withHttpsErrorHandling('actualizarCarnet', async (request) => {
  await verificarAdmin(request.auth);
  await carnetService.actualizarCarnet(request.data);
  return { ok: true };
}));

export const listarCarnets = onCall(callable, withHttpsErrorHandling('listarCarnets', async (request) => {
  await verificarAdmin(request.auth);
  return carnetService.listarCarnets();
}));

export const desactivarCarnet = onCall(callable, withHttpsErrorHandling('desactivarCarnet', async (request) => {
  await verificarAdmin(request.auth);
  await carnetService.desactivarCarnet(request.data?.carnetId);
  return { ok: true };
}));

export const verificarCarnetsVencimiento = onSchedule(
  { schedule: 'every day 10:00', timeZone: 'America/Argentina/Buenos_Aires', region: 'us-central1' },
  async () => {
    await carnetService.verificarVencimientosCarnets();
  }
);

// ── ITV (Inspección Técnica Vehicular) ──────────────────────

export const crearITV = onCall(callable, withHttpsErrorHandling('crearITV', async (request) => {
  await verificarAdmin(request.auth);
  return itvService.crearITV(request.data);
}));

export const actualizarITV = onCall(callable, withHttpsErrorHandling('actualizarITV', async (request) => {
  await verificarAdmin(request.auth);
  await itvService.actualizarITV(request.data);
  return { ok: true };
}));

export const listarITV = onCall(callable, withHttpsErrorHandling('listarITV', async (request) => {
  await verificarAdmin(request.auth);
  return itvService.listarITV();
}));

export const desactivarITV = onCall(callable, withHttpsErrorHandling('desactivarITV', async (request) => {
  await verificarAdmin(request.auth);
  await itvService.desactivarITV(request.data?.itvId);
  return { ok: true };
}));

export const verificarITVVencimiento = onSchedule(
  { schedule: 'every day 10:00', timeZone: 'America/Argentina/Buenos_Aires', region: 'us-central1' },
  async () => {
    await itvService.verificarVencimientosITV();
  }
);

/** Migración one-shot: mueve fotos a la carpeta correcta según fecha del servicio (solo admin, dry-run por defecto). */
export const migrarCarpetasDrive = onCall(
  { ...callable, secrets: [googleDriveFolderId], timeoutSeconds: 540, memory: '1GiB' },
  withHttpsErrorHandling('migrarCarpetasDrive', async (request) => {
    await verificarAdmin(request.auth);
    const migration = await import('./services/driveMigration.service');
    const dryRun = request.data?.dryRun !== false;
    return migration.migrarCarpetasDrive(googleDriveFolderId.value(), dryRun);
  })
);

/** Notifica a admins cuando una foto falla al procesarse (Storage → Drive). */
export const onFotoStagingError = onDocumentUpdated(
  'servicios/{servicioId}/fotosStaging/{stagingId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || after.status !== 'error') return;
    if (before?.status === 'error') return;

    const notificationService = await import('./services/notification.service');
    await notificationService.notificarErrorSubidaFoto({
      servicioId: event.params.servicioId,
      carpeta: after.carpeta as string | undefined,
      etiqueta: after.etiqueta as string | undefined,
      uploadGen: after.uploadGen as string | undefined,
      error: after.error as string | undefined,
    });
  }
);
