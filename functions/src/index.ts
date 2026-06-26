import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onCall, CallableOptions, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as servicioService from './services/servicio.service';
import * as usuarioService from './services/usuario.service';
import * as mapsService from './services/maps.service';
import { verificarAuth, verificarAdmin, verificarGestionActas, verificarOperador } from './middleware/auth.middleware';

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

export const obtenerDatosIniciales = onCall(callable, async () => {
  return servicioService.obtenerDatosIniciales();
});

export const resolverLinkMaps = onCall(callable, async (request) => {
  await verificarAdmin(request.auth);
  if (!request.data?.url) {
    throw new HttpsError('invalid-argument', 'URL is required');
  }
  const result = await mapsService.resolveMapsLink(request.data.url);
  if (!result) {
    throw new HttpsError('not-found', 'Could not extract coordinates from link');
  }
  return result;
});

export const iniciarEnganche = onCall(callableWithDrive, async (request) => {
  const ctx = await verificarOperador(request.auth);
  return servicioService.iniciarEnganche(
    request.data,
    ctx.uid,
    googleDriveFolderId.value()
  );
});

export const registrarEventoEnganche = onCall(callableWithDrive, async (request) => {
  try {
    const ctx = await verificarOperador(request.auth);
    await servicioService.registrarEventoEnganche(
      request.data ?? {},
      ctx.uid,
      googleDriveFolderId.value()
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[callable registrarEventoEnganche]', err);
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error ? err.message : 'Error inesperado al registrar el enganche.'
    );
  }
});

export const subirFotoEvento = onCall(callableWithDrive, async (request) => {
  try {
    const ctx = await verificarOperador(request.auth);
    return servicioService.subirFotoEvento(
      request.data ?? {},
      ctx.uid,
      googleDriveFolderId.value()
    );
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[callable subirFotoEvento]', err);
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error ? err.message : 'Error inesperado al subir la foto.'
    );
  }
});

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

export const iniciarTraslado = onCall(callable, async (request) => {
  const ctx = await verificarOperador(request.auth);
  await servicioService.iniciarTraslado(request.data?.servicioId, ctx.uid);
  return { ok: true };
});

export const liberarServicioActivoSiHuerfano = onCall(callable, async (request) => {
  const ctx = await verificarOperador(request.auth);
  return servicioService.liberarServicioActivoSiHuerfano(ctx.uid);
});

export const registrarLlegadaCorralon = onCall(callable, async (request) => {
  const ctx = await verificarOperador(request.auth);
  const result = await servicioService.registrarLlegadaCorralon(request.data, ctx.uid);
  return { ok: true, yaRegistrada: result.yaRegistrada };
});

export const confirmarDesenganche = onCall(callableWithDrive, async (request) => {
  const ctx = await verificarOperador(request.auth);
  await servicioService.confirmarDesenganche(
    request.data,
    ctx.uid,
    googleDriveFolderId.value()
  );
  return { ok: true };
});

export const anularServicio = onCall(callable, async (request) => {
  const ctx = await verificarAuth(request.auth);
  const puedeGestionar =
    ctx.roles.includes('ADMIN') || ctx.roles.includes('SUPERVISOR');
  await servicioService.anularServicio(request.data, ctx, puedeGestionar);
  return { ok: true };
});

export const actualizarServicio = onCall(callable, async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  await servicioService.actualizarServicio(request.data, ctx);
  return { ok: true };
});

export const agregarComentarioFoto = onCall(callable, async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  const comentario = await servicioService.agregarComentarioFoto(
    request.data ?? {},
    ctx.uid,
    ctx.nombre
  );
  return { comentario };
});

export const crearActaManual = onCall(callableWithDrive, async (request) => {
  const ctx = await verificarGestionActas(request.auth);
  try {
    return await servicioService.crearActaManual(
      request.data ?? {},
      ctx,
      googleDriveFolderId.value()
    );
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[callable crearActaManual]', err);
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error ? err.message : 'No se pudo crear la acta manual.'
    );
  }
});

// Gestión de usuarios (solo admin)
export const crearUsuario = onCall(callable, async (request) => {
  await verificarAdmin(request.auth);
  return usuarioService.crearUsuario(request.data);
});

export const registrarCuenta = onCall(callable, async (request) => {
  return usuarioService.registrarCuenta(request.data);
});

export const actualizarUsuario = onCall(callable, async (request) => {
  await verificarAdmin(request.auth);
  await usuarioService.actualizarUsuario(request.data);
  return { ok: true };
});

export const desactivarUsuario = onCall(callable, async (request) => {
  await verificarAdmin(request.auth);
  await usuarioService.desactivarUsuario(request.data.uid);
  return { ok: true };
});

export const listarUsuarios = onCall(callable, async (request) => {
  await verificarAdmin(request.auth);
  return usuarioService.listarUsuarios();
});

export const guardarAsignacionDiaria = onCall(callable, async (request) => {
  const ctx = await verificarOperador(request.auth);
  return usuarioService.guardarAsignacionDiaria(ctx.uid, request.data ?? {});
});

/** Prueba acceso a Google Drive (solo admin). Crea un .txt de verificación en la carpeta configurada. */
export const verificarDrive = onCall(
  { ...callable, secrets: [googleDriveFolderId] },
  async (request) => {
    await verificarAdmin(request.auth);
    const drive = await import('./services/drive.service');
    return drive.verificarAccesoDrive(googleDriveFolderId.value());
  }
);

/** URLs de vista previa para fotos guardadas en Drive (historial / actas). */
export const obtenerUrlsPreviewFotos = onCall(
  { ...callable, secrets: [googleDriveFolderId] },
  async (request) => {
    await verificarAuth(request.auth);
    const driveFileIds = request.data?.driveFileIds;
    if (!Array.isArray(driveFileIds) || driveFileIds.some((id) => typeof id !== 'string')) {
      throw new HttpsError('invalid-argument', 'driveFileIds debe ser un array de strings.');
    }
    const drive = await import('./services/drive.service');
    return drive.obtenerUrlsPreviewFotos(driveFileIds.slice(0, 50));
  }
);

/** Imágenes en base64 para exportar actas a PDF. */
export const obtenerFotosParaPdf = onCall(
  { ...callable, secrets: [googleDriveFolderId], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    await verificarAuth(request.auth);
    const driveFileIds = request.data?.driveFileIds;
    if (!Array.isArray(driveFileIds) || driveFileIds.some((id) => typeof id !== 'string')) {
      throw new HttpsError('invalid-argument', 'driveFileIds debe ser un array de strings.');
    }
    const drive = await import('./services/drive.service');
    return drive.obtenerFotosParaPdf(driveFileIds);
  }
);
