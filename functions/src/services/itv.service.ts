import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { notificarAdmins } from './notification.service';
import { TipoNotificacion, diasParaVencimiento } from '@gruasbacar/shared';

const db = admin.firestore;

interface CrearITVInput {
  gruaId: string;
  gruaPatente: string;
  fechaVencimiento: string;
  fechaTurnoRenovacion?: string;
}

interface ActualizarITVInput {
  itvId: string;
  fechaVencimiento?: string;
  fechaTurnoRenovacion?: string | null;
  renovado?: boolean;
  activo?: boolean;
}

async function generarNumeroITV(): Promise<number> {
  const counterRef = db().collection('contadores').doc('itv');
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const ultimo = (snap.data()?.ultimo as number | undefined) ?? 0;
    const next = ultimo + 1;
    tx.set(counterRef, { ultimo: next }, { merge: true });
    return next;
  });
}

export async function crearITV(data: CrearITVInput): Promise<{ id: string }> {
  const gruaId = data.gruaId?.trim();
  const gruaPatente = data.gruaPatente?.trim();
  const fechaVencimiento = data.fechaVencimiento?.trim();

  if (!gruaId) throw new HttpsError('invalid-argument', 'La grúa es obligatoria');
  if (!gruaPatente) throw new HttpsError('invalid-argument', 'La patente de la grúa es obligatoria');
  if (!fechaVencimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento)) {
    throw new HttpsError('invalid-argument', 'La fecha de vencimiento es obligatoria (YYYY-MM-DD)');
  }

  if (data.fechaTurnoRenovacion?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(data.fechaTurnoRenovacion.trim())) {
    throw new HttpsError('invalid-argument', 'Formato de fecha de turno inválido (YYYY-MM-DD)');
  }

  const numero = await generarNumeroITV();
  const id = `ITV-${String(numero).padStart(6, '0')}`;

  await db().collection('itv').doc(id).set({
    id,
    numero,
    gruaId,
    gruaPatente,
    fechaVencimiento,
    fechaTurnoRenovacion: data.fechaTurnoRenovacion?.trim() || null,
    renovado: false,
    activo: true,
  });

  return { id };
}

export async function actualizarITV(data: ActualizarITVInput): Promise<void> {
  const { itvId } = data;
  if (!itvId) throw new HttpsError('invalid-argument', 'itvId es obligatorio');

  const ref = db().collection('itv').doc(itvId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Registro ITV no encontrado');

  const updates: Record<string, unknown> = {};
  if (data.fechaVencimiento !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaVencimiento)) {
      throw new HttpsError('invalid-argument', 'Formato de fecha de vencimiento inválido');
    }
    updates.fechaVencimiento = data.fechaVencimiento;
  }
  if (data.fechaTurnoRenovacion !== undefined) {
    if (data.fechaTurnoRenovacion === null || data.fechaTurnoRenovacion === '') {
      updates.fechaTurnoRenovacion = null;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaTurnoRenovacion)) {
        throw new HttpsError('invalid-argument', 'Formato de fecha de turno inválido');
      }
      updates.fechaTurnoRenovacion = data.fechaTurnoRenovacion;
    }
  }
  if (data.renovado !== undefined) updates.renovado = data.renovado;
  if (data.activo !== undefined) updates.activo = data.activo;

  if (Object.keys(updates).length === 0) return;
  await ref.update(updates);
}

export async function listarITV(): Promise<admin.firestore.DocumentData[]> {
  const snap = await db().collection('itv').orderBy('gruaPatente').get();
  return snap.docs.map((d) => d.data());
}

export async function desactivarITV(itvId: string): Promise<void> {
  if (!itvId) throw new HttpsError('invalid-argument', 'itvId es obligatorio');
  const ref = db().collection('itv').doc(itvId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Registro ITV no encontrado');
  await ref.update({ activo: false });
}

const UMBRALES: { dias: number; tipo: TipoNotificacion }[] = [
  { dias: 7, tipo: 'ITV_POR_VENCER_7D' },
  { dias: 1, tipo: 'ITV_POR_VENCER_1D' },
];

export async function verificarVencimientosITV(): Promise<void> {
  const snap = await db().collection('itv').where('activo', '==', true).get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const dias = diasParaVencimiento(data.fechaVencimiento as string);

    for (const umbral of UMBRALES) {
      if (dias === umbral.dias) {
        await notificarAdmins({
          tipo: umbral.tipo,
          titulo: `ITV por vencer — ${data.gruaPatente}`,
          cuerpo: `La ITV de la grúa ${data.gruaPatente} vence en ${dias} días (${data.fechaVencimiento}).${data.renovado ? ' Ya fue renovada.' : data.fechaTurnoRenovacion ? ` Turno de renovación: ${data.fechaTurnoRenovacion}.` : ' Sin turno de renovación agendado.'}`,
          claveDedup: `itv_venc:${doc.id}:${umbral.dias}d`,
          datos: {
            itvId: doc.id,
            gruaPatente: data.gruaPatente as string,
            diasRestantes: String(dias),
          },
        });
        break;
      }
    }
  }
}
