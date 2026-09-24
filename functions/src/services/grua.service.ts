import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  FueraDeServicioGrua,
  GestionarGruaFueraDeServicioPayload,
  MotivoFueraDeServicio,
  ReactivarGruaPayload,
  esMotivoFueraDeServicio,
  normalizeTipoFlota,
  patenteDesdeGruaId,
} from '@gruasbacar/shared';
import { validarString, validarStringOpcional } from '../utils/validators';

const db = admin.firestore;

export async function assertGruaSinServicioActivo(patente: string): Promise<void> {
  const snap = await db()
    .collection('servicios')
    .where('estado', 'in', ['ENGANCHADO', 'EN_TRASLADO'])
    .get();

  for (const docSnap of snap.docs) {
    const grua = docSnap.data().grua as string | undefined;
    if (grua && patenteDesdeGruaId(grua) === patente) {
      throw new HttpsError(
        'failed-precondition',
        `La grúa ${patente} tiene un servicio activo. Reasigná el operador antes de sacarla de servicio.`
      );
    }
  }
}

async function findGruaDocByPatente(
  patente: string
): Promise<admin.firestore.QueryDocumentSnapshot | null> {
  const snap = await db()
    .collection('gruas')
    .where('patente', '==', patente)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

export async function desactivarGruaFueraDeServicio(
  patente: string,
  snapshot: FueraDeServicioGrua
): Promise<void> {
  await assertGruaSinServicioActivo(patente);
  const docSnap = await findGruaDocByPatente(patente);
  if (!docSnap) {
    throw new HttpsError('not-found', 'Grúa no encontrada.');
  }
  await docSnap.ref.update({
    activa: false,
    fueraDeServicio: snapshot,
  });
}

export async function validarGruaFueraDeServicio(
  patente: string,
  tipoFlotaOrigen: string | undefined,
  gruaAsignadaPatente: string
): Promise<void> {
  if (patente === gruaAsignadaPatente) {
    throw new HttpsError(
      'invalid-argument',
      'La grúa fuera de servicio no puede ser la misma que la asignada al operador.'
    );
  }

  const docSnap = await findGruaDocByPatente(patente);
  if (!docSnap) {
    throw new HttpsError('not-found', 'La grúa fuera de servicio no existe en el catálogo.');
  }

  const gruaTipo = normalizeTipoFlota(docSnap.data().tipo as string | undefined);
  const origen = normalizeTipoFlota(tipoFlotaOrigen);
  if (gruaTipo !== origen) {
    throw new HttpsError(
      'invalid-argument',
      'La grúa fuera de servicio debe ser del tipo de operación que dejó el operador.'
    );
  }
}

export function buildFueraDeServicioSnapshot(
  categoria: MotivoFueraDeServicio,
  adminCtx: { uid: string; nombre: string },
  opts?: { motivo?: string; turnoRef?: string }
): FueraDeServicioGrua {
  return {
    categoria,
    ...(opts?.motivo ? { motivo: opts.motivo } : {}),
    desde: new Date().toISOString(),
    desactivadaPorUid: adminCtx.uid,
    desactivadaPorNombre: adminCtx.nombre,
    ...(opts?.turnoRef ? { turnoRef: opts.turnoRef } : {}),
  };
}

export async function reactivarGrua(docId: string): Promise<void> {
  const ref = db().collection('gruas').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Grúa no encontrada.');
  }
  await ref.update({
    activa: true,
    fueraDeServicio: FieldValue.delete(),
  });
}

function fechaArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function gestionarGruaFueraDeServicioHandler(
  data: GestionarGruaFueraDeServicioPayload,
  adminCtx: { uid: string; nombre: string },
): Promise<void> {
  const patente = validarString(data.patente, 'patente', 20);
  const categoriaRaw = validarString(data.categoria, 'categoria', 20);
  if (!esMotivoFueraDeServicio(categoriaRaw)) {
    throw new HttpsError('invalid-argument', 'Categoría de fuera de servicio inválida.');
  }
  const categoria: MotivoFueraDeServicio = categoriaRaw;
  const motivo = validarStringOpcional(data.motivo, 'motivo', 300);
  if (categoria === 'OTRO' && !motivo) {
    throw new HttpsError('invalid-argument', 'Indicá el motivo cuando la categoría es "Otro".');
  }

  const snapshot = buildFueraDeServicioSnapshot(categoria, adminCtx, { motivo });
  await desactivarGruaFueraDeServicio(patente, snapshot);

  const docSnap = await db().collection('gruas').where('patente', '==', patente).limit(1).get();
  const gruaDoc = docSnap.empty ? undefined : docSnap.docs[0].data();
  const gruaDesc = gruaDoc?.descripcion as string | undefined;
  const gruaPref = (gruaDoc?.prefijo as string | undefined)?.trim();

  try {
    await db().collection('turnos').add({
      operadorUid: '',
      operadorNombre: '',
      fecha: fechaArgentina(),
      gruaPatente: patente,
      ...(gruaDesc ? { gruaDescripcion: gruaDesc } : {}),
      ...(gruaPref ? { gruaPrefijo: gruaPref } : {}),
      duplaId: '',
      duplaChofer: '',
      duplaEnganchador: '',
      tipoFlota: normalizeTipoFlota(docSnap.empty ? undefined : (docSnap.docs[0].data().tipo as string | undefined)),
      origenAsignacion: 'admin' as const,
      asignadoPorUid: adminCtx.uid,
      asignadoPorNombre: adminCtx.nombre,
      creadoEn: new Date().toISOString(),
      tipoEvento: 'FUERA_DE_SERVICIO' as const,
      gruaFueraDeServicioPatente: patente,
      categoriaFueraDeServicio: categoria,
      ...(motivo ? { motivoCambio: motivo } : {}),
      gruaDeshabilitada: true,
    });
  } catch (_) { /* fire-and-forget audit */ }
}

export async function reactivarGruaHandler(
  data: ReactivarGruaPayload,
  adminCtx: { uid: string; nombre: string },
): Promise<void> {
  const gruaDocId = validarString(data.gruaDocId, 'gruaDocId', 40);
  const motivo = validarStringOpcional(data.motivo, 'motivo', 300);

  const ref = db().collection('gruas').doc(gruaDocId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Grúa no encontrada.');
  }

  const gruaData = snap.data()!;
  const patente = gruaData.patente as string;
  const descripcion = gruaData.descripcion as string | undefined;
  const prefijo = (gruaData.prefijo as string | undefined)?.trim();

  await reactivarGrua(gruaDocId);

  try {
    await db().collection('turnos').add({
      operadorUid: '',
      operadorNombre: '',
      fecha: fechaArgentina(),
      gruaPatente: patente,
      ...(descripcion ? { gruaDescripcion: descripcion } : {}),
      ...(prefijo ? { gruaPrefijo: prefijo } : {}),
      duplaId: '',
      duplaChofer: '',
      duplaEnganchador: '',
      tipoFlota: normalizeTipoFlota(gruaData.tipo as string | undefined),
      origenAsignacion: 'admin' as const,
      asignadoPorUid: adminCtx.uid,
      asignadoPorNombre: adminCtx.nombre,
      creadoEn: new Date().toISOString(),
      tipoEvento: 'REACTIVACION' as const,
      gruaFueraDeServicioPatente: patente,
      ...(motivo ? { motivoCambio: motivo } : {}),
    });
  } catch (_) { /* fire-and-forget audit */ }
}
