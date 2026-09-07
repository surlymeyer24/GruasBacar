import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  FueraDeServicioGrua,
  MotivoFueraDeServicio,
  normalizeTipoFlota,
  patenteDesdeGruaId,
} from '@gruasbacar/shared';

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
        `La grúa ${patente} tiene un servicio activo. Cerralo antes de desactivarla.`
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
