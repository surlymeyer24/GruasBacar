import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  AdjuntoPoliza,
  GruaPoliza,
  TipoNotificacion,
  diasParaVencimiento,
} from '@gruasbacar/shared';
import { construirEmailVencimiento } from './email.service';
import { notificarAdmins } from './notification.service';

const db = () => admin.firestore();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CrearPolizaInput {
  numeroPoliza?: string;
  aseguradora: string;
  titular?: string;
  cobertura?: string;
  vigenciaDesde: string;
  fechaVencimiento: string;
  gruas: GruaPoliza[];
  adjunto?: AdjuntoPoliza;
  polizaAnteriorId?: string;
}

function textoRequerido(value: unknown, label: string, maxLength: number): string {
  const texto = typeof value === 'string' ? value.trim() : '';
  if (!texto) throw new HttpsError('invalid-argument', `${label} es obligatorio`);
  if (texto.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} supera los ${maxLength} caracteres`);
  }
  return texto;
}

function textoOpcional(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  const texto = textoRequerido(value, label, maxLength);
  return texto;
}

function fechaValida(value: unknown, label: string): string {
  const fecha = typeof value === 'string' ? value.trim() : '';
  if (!DATE_RE.test(fecha) || Number.isNaN(new Date(`${fecha}T00:00:00`).getTime())) {
    throw new HttpsError('invalid-argument', `${label} debe tener formato YYYY-MM-DD`);
  }
  return fecha;
}

function normalizarGruas(value: unknown): GruaPoliza[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError('invalid-argument', 'Seleccioná al menos una grúa');
  }
  if (value.length > 25) {
    throw new HttpsError('invalid-argument', 'No se pueden asociar más de 25 grúas');
  }

  const byId = new Map<string, GruaPoliza>();
  for (const item of value) {
    const raw = item as Partial<GruaPoliza>;
    const id = textoRequerido(raw.id, 'El id de la grúa', 100);
    const patente = textoRequerido(raw.patente, 'La patente de la grúa', 20).toUpperCase();
    const descripcion = textoOpcional(raw.descripcion, 'La descripción de la grúa', 120);
    byId.set(id, { id, patente, ...(descripcion ? { descripcion } : {}) });
  }
  return [...byId.values()];
}

async function validarGruasFlota(gruas: GruaPoliza[]): Promise<GruaPoliza[]> {
  const refs = gruas.map((grua) => db().collection('gruas').doc(grua.id));
  const snaps = await db().getAll(...refs);
  return snaps.map((snap) => {
    if (!snap.exists || snap.data()?.activa === false) {
      throw new HttpsError('failed-precondition', `La grúa ${snap.id} no existe o está inactiva`);
    }
    const data = snap.data()!;
    const patente = textoRequerido(data.patente, 'La patente de la grúa', 20).toUpperCase();
    const descripcion = textoOpcional(data.descripcion, 'La descripción de la grúa', 120);
    return {
      id: snap.id,
      patente,
      ...(descripcion ? { descripcion } : {}),
    };
  });
}

async function validarAdjunto(value: unknown, uid: string): Promise<AdjuntoPoliza> {
  const raw = (value ?? {}) as Partial<AdjuntoPoliza>;
  const storagePath = textoRequerido(raw.storagePath, 'El archivo adjunto', 500);
  const nombre = textoRequerido(raw.nombre, 'El nombre del archivo', 180);
  const expectedPrefix = `polizas/${uid}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new HttpsError('permission-denied', 'La ruta del archivo adjunto no es válida');
  }

  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('failed-precondition', 'El archivo adjunto no terminó de subirse');

  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType ?? '';
  const size = Number(metadata.size ?? 0);
  if (!CONTENT_TYPES.has(contentType) || size <= 0 || size > MAX_FILE_SIZE) {
    throw new HttpsError('invalid-argument', 'El adjunto debe ser una imagen o PDF de hasta 10 MB');
  }
  if (metadata.metadata?.uid !== uid) {
    throw new HttpsError('permission-denied', 'El archivo adjunto no pertenece al usuario actual');
  }

  return { storagePath, nombre, contentType, size };
}

export async function crearPoliza(
  input: CrearPolizaInput,
  actor: { uid: string; nombre?: string }
): Promise<{ id: string }> {
  const numeroPoliza = textoOpcional(input?.numeroPoliza, 'El número de póliza', 80);
  const aseguradora = textoRequerido(input?.aseguradora, 'La aseguradora', 120);
  const titular = textoOpcional(input?.titular, 'El titular', 160);
  const cobertura = textoOpcional(input?.cobertura, 'La cobertura', 160);
  const vigenciaDesde = fechaValida(input?.vigenciaDesde, 'La fecha de inicio de vigencia');
  const fechaVencimiento = fechaValida(input?.fechaVencimiento, 'La fecha de vencimiento');
  if (fechaVencimiento < vigenciaDesde) {
    throw new HttpsError('invalid-argument', 'El vencimiento no puede ser anterior al inicio de vigencia');
  }
  const gruas = await validarGruasFlota(normalizarGruas(input?.gruas));
  const adjunto = input?.adjunto ? await validarAdjunto(input.adjunto, actor.uid) : null;
  const polizaAnteriorId = input?.polizaAnteriorId?.trim() || null;

  const result = await db().runTransaction(async (tx) => {
    const counterRef = db().collection('contadores').doc('polizas');
    const counterSnap = await tx.get(counterRef);
    const numeroRegistro = ((counterSnap.data()?.ultimo as number | undefined) ?? 0) + 1;
    const id = `POLIZA-${String(numeroRegistro).padStart(6, '0')}`;
    const ref = db().collection('polizas').doc(id);

    let anteriorRef: admin.firestore.DocumentReference | null = null;
    if (polizaAnteriorId) {
      anteriorRef = db().collection('polizas').doc(polizaAnteriorId);
      const anteriorSnap = await tx.get(anteriorRef);
      if (!anteriorSnap.exists) {
        throw new HttpsError('not-found', 'La póliza anterior no existe');
      }
      if (anteriorSnap.data()?.activo === false) {
        throw new HttpsError('failed-precondition', 'La póliza anterior ya no está activa');
      }
    }

    tx.set(counterRef, { ultimo: numeroRegistro }, { merge: true });
    tx.set(ref, {
      id,
      numeroRegistro,
      ...(numeroPoliza ? { numeroPoliza } : {}),
      aseguradora,
      titular,
      cobertura,
      vigenciaDesde,
      fechaVencimiento,
      gruas,
      ...(adjunto ? { adjunto } : {}),
      activo: true,
      reemplazaA: polizaAnteriorId,
      reemplazadaPor: null,
      creadoPorUid: actor.uid,
      creadoPorNombre: actor.nombre?.trim() || null,
      creadoEn: FieldValue.serverTimestamp(),
    });
    if (anteriorRef) {
      tx.update(anteriorRef, {
        activo: false,
        reemplazadaPor: id,
        reemplazadaEn: FieldValue.serverTimestamp(),
        reemplazadaPorUid: actor.uid,
      });
    }
    return { id };
  });

  return result;
}

export async function listarPolizas(): Promise<admin.firestore.DocumentData[]> {
  const snap = await db().collection('polizas').orderBy('fechaVencimiento', 'desc').get();
  return snap.docs.map((doc) => doc.data());
}

export async function desactivarPoliza(
  polizaId: string,
  actorUid: string
): Promise<void> {
  const id = polizaId?.trim();
  if (!id) throw new HttpsError('invalid-argument', 'polizaId es obligatorio');
  const ref = db().collection('polizas').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Póliza no encontrada');
  if (snap.data()?.activo === false) return;
  await ref.update({
    activo: false,
    desactivadaEn: FieldValue.serverTimestamp(),
    desactivadaPorUid: actorUid,
  });
}

const UMBRALES: { dias: number; tipo: TipoNotificacion }[] = [
  { dias: 30, tipo: 'POLIZA_POR_VENCER_30D' },
  { dias: 15, tipo: 'POLIZA_POR_VENCER_15D' },
  { dias: 7, tipo: 'POLIZA_POR_VENCER_7D' },
];

export async function verificarVencimientosPolizas(): Promise<void> {
  const snap = await db().collection('polizas').where('activo', '==', true).get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const fechaVencimiento = data.fechaVencimiento as string;
    const dias = diasParaVencimiento(fechaVencimiento);
    const umbral = UMBRALES.find((item) => item.dias === dias);
    if (!umbral) continue;

    const gruas = (data.gruas as GruaPoliza[] | undefined) ?? [];
    const patentes = gruas.map((grua) => grua.patente).join(', ');
    const numeroPoliza = (data.numeroPoliza as string | undefined)?.trim() || doc.id;
    const aseguradora = data.aseguradora as string;
    const detalle = `Grúas cubiertas: ${patentes || 'sin detalle'}.`;

    await notificarAdmins({
      tipo: umbral.tipo,
      titulo: `Póliza por vencer — ${numeroPoliza}`,
      cuerpo: `La póliza ${numeroPoliza} de ${aseguradora} vence en ${dias} días (${fechaVencimiento}). ${detalle}`,
      claveDedup: `poliza_venc:${doc.id}:${umbral.dias}d`,
      datos: {
        polizaId: doc.id,
        numeroPoliza,
        diasRestantes: String(dias),
        accionRuta: '/documentacion?tab=polizas',
      },
      email: construirEmailVencimiento({
        tipoDoc: 'Póliza de seguro',
        identificador: numeroPoliza,
        descripcion: `${aseguradora} — ${patentes || 'sin grúas detalladas'}`,
        fechaVencimiento,
        diasRestantes: dias,
        detalle,
      }),
    });
  }
}
