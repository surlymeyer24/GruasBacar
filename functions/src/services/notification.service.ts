import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  TipoNotificacion,
  esAdmin,
  normalizeRoles,
} from '@gruasbacar/shared';
import { enviarEmail, obtenerEmailsAdminsActivos, construirEmailGenerico } from './email.service';
import { enEmulador } from '../utils/entorno';

const db = () => admin.firestore();

// Tipos que además de la notificación in-app envían push FCM al celular.
// Para agregar push a otro tipo, añadirlo acá.
const TIPOS_CON_PUSH = new Set<TipoNotificacion>([
  'TURNO_ASIGNADO',
  'TURNO_MODIFICADO',
  'SOLICITUD_RECONFIG_TURNO',
  'SOLICITUD_CAMBIO_GRUA',
  'FOTO_SUBIDA_ERROR',
  'CARNET_POR_VENCER_30D',
  'CARNET_POR_VENCER_15D',
  'CARNET_POR_VENCER_7D',
  'ITV_POR_VENCER_7D',
  'ITV_POR_VENCER_1D',
  'POLIZA_POR_VENCER_30D',
  'POLIZA_POR_VENCER_15D',
  'POLIZA_POR_VENCER_7D',
  'ENGANCHE_TIMEOUT_AVISO',
  'ENGANCHE_TIMEOUT_ANULADO',
]);

// Tipos que además envían email a los admins.
const TIPOS_CON_EMAIL = new Set<TipoNotificacion>([
  'CARNET_POR_VENCER_30D',
  'CARNET_POR_VENCER_15D',
  'CARNET_POR_VENCER_7D',
  'ITV_POR_VENCER_7D',
  'ITV_POR_VENCER_1D',
  'POLIZA_POR_VENCER_30D',
  'POLIZA_POR_VENCER_15D',
  'POLIZA_POR_VENCER_7D',
  'SOLICITUD_RECONFIG_TURNO',
  'SOLICITUD_CAMBIO_GRUA',
  'FOTO_SUBIDA_ERROR',
]);

export interface EmailContent {
  subject: string;
  html: string;
}

export interface CrearNotificacionInput {
  destinatarioUid: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  datos?: Record<string, string>;
  origenUid?: string;
  claveDedup?: string;
  email?: EmailContent;
}

export async function obtenerUidsAdminsActivos(): Promise<string[]> {
  const snap = await db().collection('usuarios').get();
  return snap.docs
    .filter((d) => {
      const data = d.data();
      if (data.activo === false) return false;
      const roles = normalizeRoles(data.roles as string[] | undefined, data.rol as string | undefined);
      return esAdmin(roles);
    })
    .map((d) => d.id);
}

export async function crearNotificacion(input: CrearNotificacionInput): Promise<string | null> {
  const {
    destinatarioUid,
    tipo,
    titulo,
    cuerpo,
    datos,
    origenUid,
    claveDedup,
  } = input;

  if (claveDedup) {
    const existente = await db()
      .collection('notificaciones')
      .where('destinatarioUid', '==', destinatarioUid)
      .where('claveDedup', '==', claveDedup)
      .limit(1)
      .get();
    if (!existente.empty) return null;
  }

  const ref = db().collection('notificaciones').doc();
  await ref.set({
    destinatarioUid,
    tipo,
    titulo,
    cuerpo,
    datos: datos ?? null,
    leida: false,
    creadaEn: FieldValue.serverTimestamp(),
    ...(origenUid ? { origenUid } : {}),
    ...(claveDedup ? { claveDedup } : {}),
  });

  if (TIPOS_CON_PUSH.has(tipo)) {
    if (enEmulador()) {
      console.warn(`[FCM] Omitido en emulador (no se notifica dispositivos reales) uid=${destinatarioUid} tipo=${tipo}`);
    } else {
      enviarPushFcm(destinatarioUid, titulo, cuerpo, datos).catch((err) => {
        console.error(`[FCM] Error enviando push a ${destinatarioUid}:`, err);
      });
    }
  }

  return ref.id;
}

export async function notificarAdmins(
  input: Omit<CrearNotificacionInput, 'destinatarioUid'>
): Promise<void> {
  const adminUids = await obtenerUidsAdminsActivos();
  if (adminUids.length === 0) {
    console.warn('[notificaciones] notificarAdmins: no hay usuarios ADMIN/SUPERADMIN activos');
  }
  await Promise.all(
    adminUids.map((uid) =>
      crearNotificacion({ ...input, destinatarioUid: uid })
    )
  );

  if (TIPOS_CON_EMAIL.has(input.tipo)) {
    const emailContent = input.email ?? {
      subject: `[BACAR] ${input.titulo}`,
      html: construirEmailGenerico(input.titulo, input.cuerpo),
    };
    const admins = await obtenerEmailsAdminsActivos();
    const emails = admins.map((a) => a.email);
    if (emails.length > 0) {
      enviarEmail({
        to: emails,
        subject: emailContent.subject,
        html: emailContent.html,
        claveDedup: input.claveDedup ? `email:${input.claveDedup}` : undefined,
      }).catch((err) => {
        console.error('[EMAIL] Error encolando email:', err);
      });
    }
  }
}

export async function marcarNotificacionLeida(
  uid: string,
  notificacionId: string
): Promise<void> {
  const ref = db().collection('notificaciones').doc(notificacionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error('NOT_FOUND');
  }
  if (snap.data()?.destinatarioUid !== uid) {
    throw new Error('PERMISSION_DENIED');
  }
  await ref.update({ leida: true });
}

export async function marcarTodasNotificacionesLeidas(uid: string): Promise<number> {
  const snap = await db()
    .collection('notificaciones')
    .where('destinatarioUid', '==', uid)
    .where('leida', '==', false)
    .get();

  if (snap.empty) return 0;

  const batch = db().batch();
  snap.docs.forEach((docSnap) => batch.update(docSnap.ref, { leida: true }));
  await batch.commit();
  return snap.size;
}

async function enviarPushFcm(
  uid: string,
  titulo: string,
  cuerpo: string,
  datos?: Record<string, string>,
): Promise<void> {
  const snap = await db().collection('usuarios').doc(uid).get();
  const tokens: string[] = (snap.data()?.fcmTokens as string[]) ?? [];
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    notification: { title: titulo, body: cuerpo },
    data: datos ?? {},
    tokens,
  });

  if (response.failureCount > 0) {
    const tokensToRemove: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          tokensToRemove.push(tokens[idx]);
        }
      }
    });
    if (tokensToRemove.length > 0) {
      await db()
        .collection('usuarios')
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...tokensToRemove) });
    }
  }
}

function resumirError(error: string | undefined): string {
  const txt = error?.trim() ?? '';
  if (!txt) return 'Error desconocido';
  return txt.length > 120 ? `${txt.slice(0, 117)}…` : txt;
}

export interface ErrorFotoSubidaInput {
  servicioId: string;
  carpeta?: string;
  etiqueta?: string;
  uploadGen?: string;
  error?: string;
}

export async function notificarErrorSubidaFoto(input: ErrorFotoSubidaInput): Promise<void> {
  const { servicioId, carpeta, etiqueta, uploadGen, error } = input;

  const servicioSnap = await db().collection('servicios').doc(servicioId).get();
  if (!servicioSnap.exists) return;

  const servicio = servicioSnap.data()!;
  const patente = (servicio.patente as string | undefined)?.trim() || servicioId;
  const numeroInfraccion = (servicio.numeroInfraccion as string | undefined)?.trim();
  const creadoPor = servicio.creadoPor as string | undefined;

  let operadorNombre = 'Operador';
  if (creadoPor) {
    const opSnap = await db().collection('usuarios').doc(creadoPor).get();
    if (opSnap.exists) {
      operadorNombre = (opSnap.data()?.nombre as string | undefined)?.trim() || operadorNombre;
    }
  }

  const carpetaLabel = carpeta === 'desenganche' ? 'desenganche' : 'enganche';
  const infraccionTxt = numeroInfraccion ? ` (N° ${numeroInfraccion})` : '';
  const errorResumido = resumirError(error);

  const claveDedup = `foto_error:${servicioId}:${carpeta ?? 'enganche'}:${uploadGen?.trim() || 'sin_gen'}`;

  await notificarAdmins({
    tipo: 'FOTO_SUBIDA_ERROR',
    titulo: `Error al subir fotos — ${patente}`,
    cuerpo:
      `${operadorNombre}: falló la subida de fotos (${carpetaLabel}) del acta ${patente}${infraccionTxt}. ${errorResumido}`,
    origenUid: creadoPor,
    claveDedup,
    datos: {
      servicioId,
      patente,
      ...(numeroInfraccion ? { numeroInfraccion } : {}),
      operadorNombre,
      ...(creadoPor ? { operadorUid: creadoPor } : {}),
      carpeta: carpeta ?? '',
      etiqueta: etiqueta ?? '',
      errorResumido,
      accionRuta: `/historial?servicio=${encodeURIComponent(servicioId)}`,
    },
  });
}
