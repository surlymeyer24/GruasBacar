import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  EstadoServicio,
  GeoPoint,
  IniciarEnganchePayload,
  RegistrarEventoEnganchePayload,
  RegistrarLlegadaCorralónPayload,
  ConfirmarDesenganchePayload,
  AnularServicioPayload,
  ActualizarServicioPayload,
  AgregarComentarioFotoPayload,
  ComentarioFoto,
  CrearActaManualPayload,
  Foto,
  EtiquetaFoto,
  esOperador,
  normalizeRoles,
  normalizeTipoFlota,
  enganchadorDeDuplaServicio,
  esGeoValida,
  ServicioActivoResumen,
  normalizeGruaId,
  patenteDesdeGruaId,
  diffEdicionServicio,
  cambiosAnulacion,
  rolEditorVersion,
  RolUsuario,
} from '@gruasbacar/shared';
import {
  validarPatente,
  validarString,
  buildIdentificadorCompuesto,
  buildRutaFoto,
  validarLoteFotos,
  fotosOpcionalesEnDev,
  fotosParaFirestore,
} from '../utils/validators';

async function driveService() {
  return import('./drive.service');
}

const db = admin.firestore;

const LIMPIAR_SERVICIO_ACTIVO_USUARIO = {
  servicioActivoId: null,
  servicioActivoResumen: null,
} as const;

interface EditorContext {
  uid: string;
  nombre: string;
  roles: RolUsuario[];
}

function registrarVersionActa(
  tx: admin.firestore.Transaction,
  servicioRef: admin.firestore.DocumentReference,
  versionCountActual: number,
  editor: EditorContext,
  tipo: 'EDICION' | 'ANULACION' | 'CREACION_MANUAL',
  cambios: ReturnType<typeof diffEdicionServicio>,
  motivo?: string | null
): number {
  const nextVersion = versionCountActual + 1;
  const versionRef = servicioRef.collection('versiones').doc();

  tx.set(versionRef, {
    version: nextVersion,
    tipo,
    editadoEn: admin.firestore.FieldValue.serverTimestamp(),
    editadoPorUid: editor.uid,
    editadoPorNombre: editor.nombre?.trim() || 'Usuario',
    editadoPorRol: rolEditorVersion(editor.roles),
    motivo: motivo?.trim() || null,
    cambios,
  });

  tx.update(servicioRef, {
    versionCount: nextVersion,
    ultimaEdicionPor: editor.uid,
    ultimaEdicionEn: admin.firestore.FieldValue.serverTimestamp(),
  });

  return nextVersion;
}

function buildServicioActivoResumen(
  servicioId: string,
  data: Pick<ServicioActivoResumen, 'estado' | 'patente' | 'numeroInfraccion'>
): ServicioActivoResumen {
  return {
    id: servicioId,
    estado: data.estado,
    patente: data.patente,
    numeroInfraccion: data.numeroInfraccion,
  };
}

async function tipoFlotaDesdeGrua(gruaInput: string): Promise<ReturnType<typeof normalizeTipoFlota>> {
  const gruaId = normalizeGruaId(gruaInput);
  const gruaDoc = await db().collection('gruas').doc(gruaId).get();
  if (gruaDoc.exists) {
    return normalizeTipoFlota(gruaDoc.data()?.tipo as string | undefined);
  }
  const patente = patenteDesdeGruaId(gruaInput);
  const gruaSnap = await db().collection('gruas').where('patente', '==', patente).limit(1).get();
  if (!gruaSnap.empty) {
    return normalizeTipoFlota(gruaSnap.docs[0].data().tipo as string | undefined);
  }
  return 'TRANSITO';
}

export async function iniciarEnganche(
  data: IniciarEnganchePayload,
  uid: string,
  driveFolderId?: string
): Promise<{ servicioId: string }> {
  const patente = validarPatente(data.patente);
  const numeroInfraccion = validarString(data.numeroInfraccion, 'numeroInfraccion');
  validarString(data.grua, 'grua');
  validarString(data.dupla?.chofer, 'dupla.chofer');
  validarString(enganchadorDeDuplaServicio(data.dupla), 'dupla.enganchador');
  validarString(data.dupla?.inspector, 'dupla.inspector');

  const usuarioRef = db().collection('usuarios').doc(uid);
  const usuarioSnap = await usuarioRef.get();
  const usuarioData = usuarioSnap.data()!;

  if (usuarioData.servicioActivoId) {
    throw new HttpsError('failed-precondition', 'Ya tenés un servicio activo. Terminalo antes de iniciar otro.');
  }

  const legajoRaw = usuarioData.legajo as string | undefined;
  let legajoChofer: string;
  const rolesUsuario = normalizeRoles(usuarioData.roles as string[] | undefined, usuarioData.rol as string | undefined);
  const isOperador = esOperador(rolesUsuario);
  if (isOperador && !rolesUsuario.includes('ADMIN')) {
    legajoChofer = validarString(legajoRaw, 'legajo');
  } else {
    legajoChofer = legajoRaw?.trim() || `ADMIN_${uid.slice(0, 8)}`;
  }

  const identificadorCompuesto = buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente);
  const gruaId = normalizeGruaId(data.grua);

  let tipoFlota = normalizeTipoFlota(
    (usuarioData.asignacionDiaria as { tipoFlota?: string } | undefined)?.tipoFlota
  );
  tipoFlota = await tipoFlotaDesdeGrua(gruaId);

  const servicioRef = db().collection('servicios').doc(identificadorCompuesto);
  const existente = await servicioRef.get();

  if (existente.exists) {
    throw new HttpsError('already-exists', 'Ya existe un servicio con esa infracción, legajo y patente.');
  }

  const geoEnganche: GeoPoint = data.geo ?? { lat: 0, lng: 0 };

  await db().runTransaction(async (tx) => {
    tx.set(servicioRef, {
      patente,
      numeroInfraccion,
      identificadorCompuesto,
      estado: 'ENGANCHADO' as EstadoServicio,
      grua: gruaId,
      tipoFlota,
      creadoPor: uid,
      legajoChofer,
      dupla: data.dupla,
      geoEnganche,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(usuarioRef, {
      servicioActivoId: servicioRef.id,
      servicioActivoResumen: buildServicioActivoResumen(servicioRef.id, {
        estado: 'ENGANCHADO',
        patente,
        numeroInfraccion,
      }),
    });
  });

  const servicioId = servicioRef.id;

  if (driveFolderId?.trim()) {
    void import('./drive.service')
      .then((drive) =>
        drive.prepararCarpetasServicio(
          driveFolderId,
          legajoChofer,
          patente,
          numeroInfraccion,
          new Date()
        )
      )
      .catch((err) => {
        console.warn('[iniciarEnganche] Carpetas Drive no preparadas (se crearán al subir fotos):', err);
      });
  }

  return { servicioId };
}

async function legajoParaFotosDesdeServicio(
  servicio: FirebaseFirestore.DocumentData
): Promise<string> {
  const legajoServicio = servicio.legajoChofer as string | undefined;
  if (legajoServicio?.trim()) return legajoServicio.trim();

  const creadoPor = servicio.creadoPor as string | undefined;
  if (creadoPor) {
    const usuarioSnap = await db().collection('usuarios').doc(creadoPor).get();
    const legajoUsuario = usuarioSnap.data()?.legajo as string | undefined;
    if (legajoUsuario?.trim()) return legajoUsuario.trim();
  }

  throw new HttpsError(
    'failed-precondition',
    'El servicio no tiene legajo del enganchador. Cancelá el servicio y volvé a enganchar con un usuario que tenga legajo cargado.'
  );
}

type FotoMetaInput = Omit<Foto, 'url' | 'driveFileId'> & Partial<Pick<Foto, 'url' | 'driveFileId'>>;

function normalizarPayloadFotos(data: {
  fotos?: unknown;
  fotosBase64?: unknown;
}): { fotos: FotoMetaInput[]; fotosBase64: string[] } {
  return {
    fotos: Array.isArray(data.fotos) ? (data.fotos as FotoMetaInput[]) : [],
    fotosBase64: Array.isArray(data.fotosBase64) ? (data.fotosBase64 as string[]) : [],
  };
}

function fotosYaSubidas(fotos: FotoMetaInput[]): boolean {
  return fotos.length > 0 && fotos.every((f) => Boolean(f.url?.trim() && f.driveFileId?.trim()));
}

async function resolverFotosConUrl(
  servicio: FirebaseFirestore.DocumentData,
  carpeta: 'enganche' | 'desenganche',
  fotos: FotoMetaInput[],
  fotosBase64: string[],
  driveFolderId: string
): Promise<Foto[]> {
  if (fotosYaSubidas(fotos)) {
    return fotos.map((f) => ({
      url: f.url!.trim(),
      driveFileId: f.driveFileId!.trim(),
      etiqueta: f.etiqueta,
      observacion: f.observacion,
    }));
  }

  if (fotosBase64.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'No se recibieron imágenes. Volvé a cargar las fotos e intentá de nuevo.'
    );
  }

  const legajo = await legajoParaFotosDesdeServicio(servicio);
  const patente = servicio.patente as string;
  const numeroInfraccion = servicio.numeroInfraccion as string;

  try {
    const drive = await driveService();
    const uploads = await drive.subirFotosDrive(
      driveFolderId,
      fotosBase64.map((base64, i) => ({
        relativePath: buildRutaFoto(
          legajo,
          patente,
          numeroInfraccion,
          carpeta,
          fotos[i].etiqueta,
          i
        ),
        base64,
      }))
    );
    return uploads.map((uploaded, i) => ({
      url: uploaded.url,
      driveFileId: uploaded.driveFileId,
      etiqueta: fotos[i].etiqueta,
      observacion: fotos[i].observacion,
    }));
  } catch (err) {
    if (err instanceof HttpsError) {
      if (fotosOpcionalesEnDev()) {
        console.warn('[resolverFotosConUrl] Drive falló en dev, guardando evento sin fotos:', err.message);
        return [];
      }
      throw err;
    }
    console.error('[resolverFotosConUrl]', carpeta, err);
    if (fotosOpcionalesEnDev()) {
      console.warn('[resolverFotosConUrl] Drive falló en dev, guardando evento sin fotos');
      return [];
    }
    const driveMsg =
      err instanceof Error ? err.message : 'No se pudieron subir las fotos a Google Drive.';
    throw new HttpsError('failed-precondition', `Error en Google Drive: ${driveMsg}`);
  }
}

export async function subirFotoEvento(
  data: {
    servicioId: string;
    carpeta: 'enganche' | 'desenganche';
    etiqueta: string;
    index: number;
    fotoBase64: string;
  },
  uid: string,
  driveFolderId: string
): Promise<{ url: string; driveFileId: string }> {
  const servicioId = validarString(data.servicioId, 'servicioId');
  const carpeta = data.carpeta;
  if (carpeta !== 'enganche' && carpeta !== 'desenganche') {
    throw new HttpsError('invalid-argument', 'carpeta debe ser enganche o desenganche.');
  }
  const fotoBase64 = validarString(data.fotoBase64, 'fotoBase64');
  const index = typeof data.index === 'number' && data.index >= 0 ? data.index : 0;
  const etiqueta = validarString(data.etiqueta, 'etiqueta');

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  const servicio = servicioSnap.data()!;
  if (servicio.creadoPor !== uid) throw new HttpsError('permission-denied', 'No es tu servicio.');

  const legajo = await legajoParaFotosDesdeServicio(servicio);
  const patente = servicio.patente as string;
  const numeroInfraccion = servicio.numeroInfraccion as string;

  try {
    const drive = await driveService();
    const [uploaded] = await drive.subirFotosDrive(driveFolderId, [
      {
        relativePath: buildRutaFoto(
          legajo,
          patente,
          numeroInfraccion,
          carpeta,
          etiqueta as EtiquetaFoto,
          index
        ),
        base64: fotoBase64,
      },
    ]);
    return uploaded;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[subirFotoEvento]', servicioId, index, err);
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error ? err.message : 'No se pudo subir la foto a Google Drive.'
    );
  }
}

export async function registrarEventoEnganche(
  data: RegistrarEventoEnganchePayload,
  uid: string,
  driveFolderId: string
): Promise<void> {
  try {
    const servicioId = validarString(data.servicioId, 'servicioId');
    const fotos = Array.isArray(data.fotos) ? data.fotos : [];
    const fotosBase64 = Array.isArray(data.fotosBase64) ? data.fotosBase64 : [];
    const { geo, observacionGeneral } = data;

    validarLoteFotos(fotos, fotosBase64);

    const servicioRef = db().collection('servicios').doc(servicioId);
    const servicioSnap = await servicioRef.get();
    if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
    const servicio = servicioSnap.data()!;
    if (servicio.creadoPor !== uid) throw new HttpsError('permission-denied', 'No es tu servicio.');
    if (servicio.estado !== 'ENGANCHADO') {
      throw new HttpsError('failed-precondition', 'El servicio no está en estado ENGANCHADO.');
    }

    const eventoExistente = await servicioRef
      .collection('eventos')
      .where('tipo', '==', 'ENGANCHE')
      .limit(1)
      .get();
    if (!eventoExistente.empty) {
      throw new HttpsError('already-exists', 'El evento de enganche ya fue registrado.');
    }

    const geoEvento: GeoPoint =
      geo ?? (servicio.geoEnganche as GeoPoint | undefined) ?? { lat: 0, lng: 0 };

    const fotosConUrl = await resolverFotosConUrl(
      servicio,
      'enganche',
      fotos,
      fotosBase64,
      driveFolderId
    );

    const notaDrive =
      fotosConUrl.length === 0 && fotosOpcionalesEnDev()
        ? ' [DEV: fotos no subidas a Drive por error de configuración]'
        : '';
    const obsFinal = observacionGeneral?.trim()
      ? `${observacionGeneral.trim()}${notaDrive}`
      : notaDrive.trim() || null;

    await servicioRef.collection('eventos').add({
      tipo: 'ENGANCHE',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      geo: geoEvento,
      fotos: fotosParaFirestore(fotosConUrl),
      observacionGeneral: obsFinal,
    });

    const fotoStorage = await import('./fotoStorage.service');
    await fotoStorage.limpiarFotosStaging(servicioId, 'enganche');
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[registrarEventoEnganche]', err);
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error
        ? `Error al registrar enganche: ${err.message}`
        : 'Error inesperado al registrar el enganche.'
    );
  }
}

export async function iniciarTraslado(servicioIdRaw: unknown, uid: string): Promise<void> {
  const servicioId = validarString(servicioIdRaw, 'servicioId');
  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  const servicio = servicioSnap.data()!;
  if (servicio.creadoPor !== uid) throw new HttpsError('permission-denied', 'No es tu servicio.');

  const trasladoExistente = await servicioRef
    .collection('eventos')
    .where('tipo', '==', 'TRASLADO')
    .limit(1)
    .get();

  if (servicio.estado === 'EN_TRASLADO' || !trasladoExistente.empty) {
    return;
  }

  if (servicio.estado !== 'ENGANCHADO') {
    if (servicio.estado === 'DESENGANCHADO' || servicio.estado === 'ANULADO') {
      throw new HttpsError('failed-precondition', 'El servicio ya fue cerrado.');
    }
    throw new HttpsError('failed-precondition', 'El servicio no está en estado ENGANCHADO.');
  }

  const engancheSnap = await servicioRef
    .collection('eventos')
    .where('tipo', '==', 'ENGANCHE')
    .limit(1)
    .get();
  if (engancheSnap.empty) {
    throw new HttpsError(
      'failed-precondition',
      'Debés registrar las fotos del enganche antes de iniciar el traslado.'
    );
  }

  const choferUid = servicio.creadoPor as string;
  const usuarioRef = db().collection('usuarios').doc(choferUid);

  await db().runTransaction(async (tx) => {
    tx.update(servicioRef, { estado: 'EN_TRASLADO' as EstadoServicio });
    tx.set(servicioRef.collection('eventos').doc(), {
      tipo: 'TRASLADO',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(usuarioRef, {
      servicioActivoResumen: buildServicioActivoResumen(servicioId, {
        patente: servicio.patente as string,
        numeroInfraccion: servicio.numeroInfraccion as string,
        estado: 'EN_TRASLADO',
      }),
    });
  });
}

export async function registrarLlegadaCorralon(
  data: RegistrarLlegadaCorralónPayload,
  uid: string
): Promise<{ yaRegistrada: boolean }> {
  const { servicioId, corralon, encargadoDeposito, geo } = data;
  validarString(servicioId, 'servicioId');
  validarString(corralon, 'corralon');
  validarString(encargadoDeposito, 'encargadoDeposito');

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  const servicio = servicioSnap.data()!;
  if (servicio.creadoPor !== uid) throw new HttpsError('permission-denied', 'No es tu servicio.');

  const llegadaExistente = await servicioRef
    .collection('eventos')
    .where('tipo', '==', 'LLEGADA_CORRALON')
    .limit(1)
    .get();

  const corralonServicio = servicio.corralon as string | undefined;
  if (!llegadaExistente.empty || corralonServicio?.trim()) {
    return { yaRegistrada: true };
  }

  if (servicio.estado !== 'EN_TRASLADO') {
    if (servicio.estado === 'DESENGANCHADO' || servicio.estado === 'ANULADO') {
      throw new HttpsError('failed-precondition', 'El servicio ya fue cerrado.');
    }
    throw new HttpsError('failed-precondition', 'El servicio no está en traslado.');
  }

  await db().runTransaction(async (tx) => {
    tx.update(servicioRef, { corralon, encargadoDeposito: encargadoDeposito.trim() });
    tx.set(servicioRef.collection('eventos').doc(), {
      tipo: 'LLEGADA_CORRALON',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      geo,
      corralon,
      encargadoDeposito: encargadoDeposito.trim(),
    });
  });

  return { yaRegistrada: false };
}

export async function confirmarDesenganche(
  data: ConfirmarDesenganchePayload,
  uid: string,
  driveFolderId: string
): Promise<void> {
  const servicioId = validarString(data.servicioId, 'servicioId');
  const { fotos, fotosBase64 } = normalizarPayloadFotos(data);
  const { observacionGeneral } = data;

  validarLoteFotos(fotos, fotosBase64);

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  const servicio = servicioSnap.data()!;
  if (servicio.creadoPor !== uid) throw new HttpsError('permission-denied', 'No es tu servicio.');

  const desengancheExistente = await servicioRef
    .collection('eventos')
    .where('tipo', '==', 'DESENGANCHE')
    .limit(1)
    .get();

  if (servicio.estado === 'DESENGANCHADO' || !desengancheExistente.empty) {
    if (servicio.estado === 'DESENGANCHADO' && !desengancheExistente.empty) {
      const usuarioRef = db().collection('usuarios').doc(uid);
      await usuarioRef.update(LIMPIAR_SERVICIO_ACTIVO_USUARIO);
      return;
    }
    throw new HttpsError('already-exists', 'El desenganche ya fue registrado.');
  }

  if (servicio.estado !== 'EN_TRASLADO') {
    if (servicio.estado === 'ENGANCHADO') {
      throw new HttpsError('failed-precondition', 'Primero debés iniciar el traslado.');
    }
    throw new HttpsError('failed-precondition', 'El servicio no está en traslado.');
  }

  const llegadaSnap = await servicioRef
    .collection('eventos')
    .where('tipo', '==', 'LLEGADA_CORRALON')
    .limit(1)
    .get();

  const corralon = (servicio.corralon as string | undefined)?.trim();
  const encargadoDeposito = (servicio.encargadoDeposito as string | undefined)?.trim();
  const llegadaData = llegadaSnap.empty ? undefined : llegadaSnap.docs[0].data();
  const geoDesenganche = llegadaData?.geo as { lat: number; lng: number } | undefined;

  if (llegadaSnap.empty && !corralon) {
    throw new HttpsError(
      'failed-precondition',
      'Debés registrar la ubicación de desenganche antes de cerrar el acta.'
    );
  }

  const fotosConUrl = await resolverFotosConUrl(
    servicio,
    'desenganche',
    fotos,
    fotosBase64,
    driveFolderId
  );

  const usuarioRef = db().collection('usuarios').doc(uid);
  await db().runTransaction(async (tx) => {
    tx.update(servicioRef, {
      estado: 'DESENGANCHADO' as EstadoServicio,
      finalizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(servicioRef.collection('eventos').doc(), {
      tipo: 'DESENGANCHE',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      fotos: fotosParaFirestore(fotosConUrl),
      observacionGeneral: observacionGeneral?.trim() || null,
      ...(geoDesenganche ? { geo: geoDesenganche } : {}),
      ...(corralon ? { corralon } : {}),
      ...(encargadoDeposito ? { encargadoDeposito } : {}),
    });
    tx.update(usuarioRef, LIMPIAR_SERVICIO_ACTIVO_USUARIO);
  });

  const fotoStorage = await import('./fotoStorage.service');
  await fotoStorage.limpiarFotosStaging(servicioId, 'desenganche');
}

export async function anularServicio(
  data: AnularServicioPayload,
  editor: EditorContext,
  puedeGestionarActas: boolean
): Promise<void> {
  const { servicioId, motivo } = data;

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  const servicio = servicioSnap.data()!;

  if (!puedeGestionarActas && servicio.creadoPor !== editor.uid) {
    throw new HttpsError('permission-denied', 'No tenés permiso para anular este servicio.');
  }

  const estadosAnulables: EstadoServicio[] = puedeGestionarActas
    ? ['ENGANCHADO', 'EN_TRASLADO', 'DESENGANCHADO']
    : ['ENGANCHADO', 'EN_TRASLADO'];
  if (!estadosAnulables.includes(servicio.estado)) {
    throw new HttpsError('failed-precondition', 'Este servicio no se puede anular.');
  }

  const choferUid = servicio.creadoPor as string;
  const usuarioRef = db().collection('usuarios').doc(choferUid);
  const versionCount = (servicio.versionCount as number | undefined) ?? 0;
  const cambios = cambiosAnulacion(servicio.estado as EstadoServicio, motivo);

  await db().runTransaction(async (tx) => {
    tx.update(servicioRef, {
      estado: 'ANULADO' as EstadoServicio,
      motivoAnulacion: motivo ?? null,
      anuladoPor: editor.uid,
      anuladoEn: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(usuarioRef, LIMPIAR_SERVICIO_ACTIVO_USUARIO);
    registrarVersionActa(tx, servicioRef, versionCount, editor, 'ANULACION', cambios, motivo);
  });
}

export async function actualizarServicio(data: ActualizarServicioPayload, editor: EditorContext): Promise<void> {
  const { servicioId, corralon, dupla } = data;
  const patente = validarPatente(data.patente);
  const numeroInfraccion = validarString(data.numeroInfraccion, 'numeroInfraccion');
  const grua = normalizeGruaId(validarString(data.grua, 'grua'));
  validarString(dupla?.chofer, 'dupla.chofer');
  validarString(enganchadorDeDuplaServicio(dupla), 'dupla.enganchador');
  validarString(dupla?.inspector, 'dupla.inspector');

  const servicioRef = db().collection('servicios').doc(servicioId);
  const servicioSnap = await servicioRef.get();
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');

  const actual = servicioSnap.data()!;
  const legajoChofer =
    (actual.legajoChofer as string | undefined)?.trim() ||
    (await legajoParaFotosDesdeServicio(actual));
  const identificadorCompuesto = buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente);
  if (identificadorCompuesto !== actual.identificadorCompuesto) {
    const existenteRef = db().collection('servicios').doc(identificadorCompuesto);
    const existente = await existenteRef.get();
    if (existente.exists && existente.id !== servicioId) {
      throw new HttpsError('already-exists', 'Ya existe otra acta con esa infracción, legajo y patente.');
    }
  }

  const updates: Record<string, unknown> = {
    patente,
    numeroInfraccion,
    identificadorCompuesto,
    grua,
    dupla,
  };
  if (corralon !== undefined) {
    updates.corralon = corralon?.trim() || null;
  }
  if (data.tipoFlota !== undefined) {
    updates.tipoFlota = normalizeTipoFlota(data.tipoFlota);
  }
  if (data.encargadoDeposito !== undefined) {
    updates.encargadoDeposito = data.encargadoDeposito?.trim() || null;
  }

  const cambios = diffEdicionServicio(actual, data);
  if (cambios.length === 0) {
    return;
  }

  const versionCount = (actual.versionCount as number | undefined) ?? 0;

  await db().runTransaction(async (tx) => {
    tx.update(servicioRef, updates);
    registrarVersionActa(
      tx,
      servicioRef,
      versionCount,
      editor,
      'EDICION',
      cambios,
      data.motivo
    );
  });
}

const MAX_COMENTARIO_FOTO_CHARS = 500;

export async function agregarComentarioFoto(
  data: AgregarComentarioFotoPayload,
  uid: string,
  nombre: string
): Promise<ComentarioFoto> {
  const servicioId = validarString(data.servicioId, 'servicioId');
  const eventoId = validarString(data.eventoId, 'eventoId');
  const fotoIndex = data.fotoIndex;
  const texto = data.texto?.trim();

  if (!texto) {
    throw new HttpsError('invalid-argument', 'El comentario no puede estar vacío.');
  }
  if (texto.length > MAX_COMENTARIO_FOTO_CHARS) {
    throw new HttpsError(
      'invalid-argument',
      `El comentario no puede superar ${MAX_COMENTARIO_FOTO_CHARS} caracteres.`
    );
  }
  if (!Number.isInteger(fotoIndex) || fotoIndex < 0) {
    throw new HttpsError('invalid-argument', 'Índice de foto inválido.');
  }

  const servicioRef = db().collection('servicios').doc(servicioId);
  const eventoRef = servicioRef.collection('eventos').doc(eventoId);

  const [servicioSnap, eventoSnap] = await Promise.all([servicioRef.get(), eventoRef.get()]);
  if (!servicioSnap.exists) throw new HttpsError('not-found', 'Servicio no encontrado.');
  if (!eventoSnap.exists) throw new HttpsError('not-found', 'Evento no encontrado.');

  const evento = eventoSnap.data()!;
  const fotos = Array.isArray(evento.fotos) ? [...(evento.fotos as Foto[])] : [];
  if (fotoIndex >= fotos.length) {
    throw new HttpsError('invalid-argument', 'Foto no encontrada.');
  }

  const comentario: ComentarioFoto = {
    id: db().collection('_').doc().id,
    texto,
    autorUid: uid,
    autorNombre: nombre?.trim() || 'Usuario',
    creadoEn: new Date().toISOString(),
  };

  const foto = { ...fotos[fotoIndex] };
  const previos = Array.isArray(foto.comentarios) ? foto.comentarios : [];
  fotos[fotoIndex] = { ...foto, comentarios: [...previos, comentario] };

  await eventoRef.update({ fotos });

  return comentario;
}

function esUrlMaps(texto: string): boolean {
  return /google\.com\/maps|maps\.app\.goo\.gl|g\.page/i.test(texto);
}

async function parseUbicacionInput(
  raw: string | undefined
): Promise<{ geo?: GeoPoint; referencia?: string }> {
  const trimmed = raw?.trim();
  if (!trimmed) return {};

  if (esUrlMaps(trimmed)) {
    const maps = await import('./maps.service');
    const geo = await maps.resolveMapsLink(trimmed);
    if (geo && esGeoValida(geo)) {
      return { geo, referencia: trimmed };
    }
    return { referencia: trimmed };
  }

  const maps = await import('./maps.service');
  const geo = await maps.geocodeAddress(trimmed);
  if (geo && esGeoValida(geo)) {
    return { geo, referencia: trimmed };
  }

  return { referencia: trimmed };
}

function camposUbicacionEvento(ubicacion: { geo?: GeoPoint; referencia?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (ubicacion.geo && esGeoValida(ubicacion.geo)) {
    out.geo = ubicacion.geo;
  }
  if (ubicacion.referencia?.trim()) {
    out.ubicacionReferencia = ubicacion.referencia.trim();
  }
  return out;
}

/** Acta completa cargada por supervisor/admin (respaldo cuando falla el flujo de campo). */
export async function crearActaManual(
  data: CrearActaManualPayload,
  editor: EditorContext,
  driveFolderId: string
): Promise<{ servicioId: string }> {
  const patente = validarPatente(data.patente);
  const numeroInfraccion = validarString(data.numeroInfraccion, 'numeroInfraccion');
  const gruaId = normalizeGruaId(validarString(data.grua, 'grua'));
  validarString(data.dupla?.chofer, 'dupla.chofer');
  validarString(enganchadorDeDuplaServicio(data.dupla), 'dupla.enganchador');
  validarString(data.dupla?.inspector, 'dupla.inspector');

  const fotosEnganche = Array.isArray(data.fotosEnganche) ? data.fotosEnganche : [];
  const fotosEngancheBase64 = Array.isArray(data.fotosEngancheBase64) ? data.fotosEngancheBase64 : [];
  const fotosDesenganche = Array.isArray(data.fotosDesenganche) ? data.fotosDesenganche : [];
  const fotosDesengancheBase64 = Array.isArray(data.fotosDesengancheBase64) ? data.fotosDesengancheBase64 : [];

  validarLoteFotos(fotosEnganche, fotosEngancheBase64);
  const tieneDesenganche = fotosDesengancheBase64.length > 0;
  if (tieneDesenganche) {
    validarLoteFotos(fotosDesenganche, fotosDesengancheBase64);
  }

  const legajoChofer = validarString(data.legajoEnganchador, 'legajoEnganchador');
  const identificadorCompuesto = buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente);
  const servicioRef = db().collection('servicios').doc(identificadorCompuesto);
  const existente = await servicioRef.get();
  if (existente.exists) {
    throw new HttpsError('already-exists', 'Ya existe un servicio con esa infracción, legajo y patente.');
  }

  const corralon = data.corralon?.trim() || '';
  const encargadoDeposito = data.encargadoDeposito?.trim() || '';

  const tipoFlota = await tipoFlotaDesdeGrua(gruaId);

  const [ubicEnganche, ubicLlegada] = await Promise.all([
    parseUbicacionInput(data.ubicacionEnganche),
    parseUbicacionInput(data.ubicacionLlegada),
  ]);

  const servicioStub = {
    patente,
    numeroInfraccion,
    legajoChofer,
    creadoPor: editor.uid,
  };

  const fotosEngancheConUrl = await resolverFotosConUrl(
    servicioStub,
    'enganche',
    fotosEnganche,
    fotosEngancheBase64,
    driveFolderId
  );

  let fotosDesengancheConUrl: Foto[] = [];
  if (tieneDesenganche) {
    fotosDesengancheConUrl = await resolverFotosConUrl(
      servicioStub,
      'desenganche',
      fotosDesenganche,
      fotosDesengancheBase64,
      driveFolderId
    );
  }

  const geoEnganche: GeoPoint =
    ubicEnganche.geo && esGeoValida(ubicEnganche.geo)
      ? ubicEnganche.geo
      : { lat: 0, lng: 0 };

  const obsGeneral = data.observacionGeneral?.trim()
    ? `${data.observacionGeneral.trim()} [Acta cargada manualmente]`
    : 'Acta cargada manualmente por supervisor';

  const eventosRef = servicioRef.collection('eventos');
  const ts = admin.firestore.FieldValue.serverTimestamp();

  await db().runTransaction(async (tx) => {
    tx.set(servicioRef, {
      patente,
      numeroInfraccion,
      identificadorCompuesto,
      estado: 'DESENGANCHADO' as EstadoServicio,
      grua: gruaId,
      tipoFlota,
      corralon: corralon || null,
      encargadoDeposito: encargadoDeposito || null,
      creadoPor: editor.uid,
      legajoChofer,
      dupla: data.dupla,
      geoEnganche,
      origenManual: true,
      creadoEn: ts,
      finalizadoEn: ts,
      versionCount: 0,
    });

    tx.set(eventosRef.doc(), {
      tipo: 'ENGANCHE',
      timestamp: ts,
      ...camposUbicacionEvento(ubicEnganche),
      fotos: fotosParaFirestore(fotosEngancheConUrl),
      observacionGeneral: obsGeneral,
    });

    tx.set(eventosRef.doc(), {
      tipo: 'TRASLADO',
      timestamp: ts,
    });

    if (corralon) {
      tx.set(eventosRef.doc(), {
        tipo: 'LLEGADA_CORRALON',
        timestamp: ts,
        corralon,
        encargadoDeposito: encargadoDeposito || null,
        ...camposUbicacionEvento(ubicLlegada),
      });
    }

    if (tieneDesenganche) {
      tx.set(eventosRef.doc(), {
        tipo: 'DESENGANCHE',
        timestamp: ts,
        fotos: fotosParaFirestore(fotosDesengancheConUrl),
        observacionGeneral: obsGeneral,
      });
    }

    registrarVersionActa(
      tx,
      servicioRef,
      0,
      editor,
      'CREACION_MANUAL',
      [
        {
          campo: 'origen',
          etiqueta: 'Origen',
          valorAnterior: null,
          valorNuevo: 'Carga manual',
        },
      ],
      data.observacionGeneral
    );
  });

  return { servicioId: servicioRef.id };
}

export async function obtenerDatosIniciales(): Promise<{
  gruas: unknown[];
  corralones: unknown[];
  duplas: unknown[];
}> {
  const [gruasSnap, corralónesSnap, duplasSnap] = await Promise.all([
    db().collection('gruas').where('activa', '==', true).get(),
    db().collection('corralones').where('activo', '==', true).get(),
    db().collection('duplas').get(),
  ]);

  return {
    gruas: gruasSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    corralones: corralónesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    duplas: duplasSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/** Desvincula servicioActivoId del operador (servicio huérfano o liberación manual desde inicio). */
export async function liberarServicioActivoSiHuerfano(uid: string): Promise<{ liberado: boolean }> {
  const usuarioRef = db().collection('usuarios').doc(uid);
  const usuarioSnap = await usuarioRef.get();
  if (!usuarioSnap.exists) {
    throw new HttpsError('not-found', 'Usuario no encontrado.');
  }

  const servicioActivoId = usuarioSnap.data()?.servicioActivoId as string | null | undefined;
  if (!servicioActivoId) {
    return { liberado: true };
  }

  // Solo desvincula el puntero en el usuario; no modifica el servicio en sí.
  await usuarioRef.update(LIMPIAR_SERVICIO_ACTIVO_USUARIO);
  return { liberado: true };
}
