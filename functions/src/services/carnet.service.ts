import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { notificarAdmins } from './notification.service';
import { TipoNotificacion, diasParaVencimiento } from '@gruasbacar/shared';

const db = admin.firestore;

interface CrearCarnetInput {
  nombre: string;
  legajo: string;
  fechaVencimiento: string;
}

interface ActualizarCarnetInput {
  carnetId: string;
  fechaVencimiento?: string;
  activo?: boolean;
}

async function generarNumeroCarnet(): Promise<number> {
  const counterRef = db().collection('contadores').doc('carnets');
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const ultimo = (snap.data()?.ultimo as number | undefined) ?? 0;
    const next = ultimo + 1;
    tx.set(counterRef, { ultimo: next }, { merge: true });
    return next;
  });
}

export async function crearCarnet(data: CrearCarnetInput): Promise<{ id: string }> {
  const nombre = data.nombre?.trim();
  const legajo = data.legajo?.trim();
  const fechaVencimiento = data.fechaVencimiento?.trim();

  if (!nombre) throw new HttpsError('invalid-argument', 'El nombre es obligatorio');
  if (!legajo) throw new HttpsError('invalid-argument', 'El legajo es obligatorio');
  if (!fechaVencimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento)) {
    throw new HttpsError('invalid-argument', 'La fecha de vencimiento es obligatoria (YYYY-MM-DD)');
  }

  const numero = await generarNumeroCarnet();
  const id = `CARNET-${String(numero).padStart(6, '0')}`;

  await db().collection('carnets').doc(id).set({
    id,
    numero,
    nombre,
    legajo,
    fechaVencimiento,
    activo: true,
  });

  return { id };
}

export async function actualizarCarnet(data: ActualizarCarnetInput): Promise<void> {
  const { carnetId } = data;
  if (!carnetId) throw new HttpsError('invalid-argument', 'carnetId es obligatorio');

  const ref = db().collection('carnets').doc(carnetId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Carnet no encontrado');

  const updates: Record<string, unknown> = {};
  if (data.fechaVencimiento !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fechaVencimiento)) {
      throw new HttpsError('invalid-argument', 'Formato de fecha inválido');
    }
    updates.fechaVencimiento = data.fechaVencimiento;
  }
  if (data.activo !== undefined) updates.activo = data.activo;

  if (Object.keys(updates).length === 0) return;
  await ref.update(updates);
}

export async function listarCarnets(): Promise<admin.firestore.DocumentData[]> {
  const snap = await db().collection('carnets').orderBy('nombre').get();
  return snap.docs.map((d) => d.data());
}

export async function desactivarCarnet(carnetId: string): Promise<void> {
  if (!carnetId) throw new HttpsError('invalid-argument', 'carnetId es obligatorio');
  const ref = db().collection('carnets').doc(carnetId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Carnet no encontrado');
  await ref.update({ activo: false });
}

const UMBRALES: { dias: number; tipo: TipoNotificacion }[] = [
  { dias: 30, tipo: 'CARNET_POR_VENCER_30D' },
  { dias: 15, tipo: 'CARNET_POR_VENCER_15D' },
  { dias: 7, tipo: 'CARNET_POR_VENCER_7D' },
];

export async function verificarVencimientosCarnets(): Promise<void> {
  const snap = await db().collection('carnets').where('activo', '==', true).get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const dias = diasParaVencimiento(data.fechaVencimiento as string);

    for (const umbral of UMBRALES) {
      if (dias === umbral.dias) {
        await notificarAdmins({
          tipo: umbral.tipo,
          titulo: `Carnet por vencer — ${data.nombre}`,
          cuerpo: `El carnet #${String(data.numero).padStart(6, '0')} de ${data.nombre} (legajo ${data.legajo}) vence en ${dias} días (${data.fechaVencimiento}).`,
          claveDedup: `carnet_venc:${doc.id}:${umbral.dias}d`,
          datos: {
            carnetId: doc.id,
            operadorNombre: data.nombre as string,
            diasRestantes: String(dias),
          },
        });
        break;
      }
    }
  }
}
