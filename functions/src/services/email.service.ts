import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = () => admin.firestore();

const MAIL_COLLECTION = 'mail';

export interface EmailDestinatario {
  email: string;
  nombre?: string;
}

export interface EnviarEmailInput {
  to: string[];
  subject: string;
  html: string;
  claveDedup?: string;
}

export async function enviarEmail(input: EnviarEmailInput): Promise<string | null> {
  const { to, subject, html, claveDedup } = input;
  if (to.length === 0) return null;

  if (claveDedup) {
    const existente = await db()
      .collection(MAIL_COLLECTION)
      .where('claveDedup', '==', claveDedup)
      .limit(1)
      .get();
    if (!existente.empty) return null;
  }

  const ref = db().collection(MAIL_COLLECTION).doc();
  await ref.set({
    to,
    message: { subject, html },
    claveDedup: claveDedup ?? null,
    creadoEn: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function obtenerEmailsAdminsActivos(): Promise<EmailDestinatario[]> {
  const snap = await db().collection('usuarios').get();
  const destinatarios: EmailDestinatario[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.activo === false) continue;
    const roles: string[] = Array.isArray(data.roles)
      ? data.roles
      : data.rol ? [data.rol] : [];
    const esAdmin = roles.some((r) => r === 'ADMIN' || r === 'SUPERADMIN');
    if (!esAdmin) continue;
    const email = (data.email as string | undefined)?.trim();
    if (!email) continue;
    destinatarios.push({ email, nombre: data.nombre as string | undefined });
  }

  return destinatarios;
}

function urgenciaColor(dias: number): string {
  if (dias <= 1) return '#dc2626';
  if (dias <= 7) return '#ea580c';
  if (dias <= 15) return '#d97706';
  return '#ca8a04';
}

function urgenciaLabel(dias: number): string {
  if (dias <= 1) return 'URGENTE';
  if (dias <= 7) return 'Atención';
  return 'Aviso';
}

export function construirEmailVencimiento(opts: {
  tipoDoc: 'Carnet' | 'ITV';
  identificador: string;
  descripcion: string;
  fechaVencimiento: string;
  diasRestantes: number;
  detalle?: string;
}): { subject: string; html: string } {
  const { tipoDoc, identificador, descripcion, fechaVencimiento, diasRestantes, detalle } = opts;
  const color = urgenciaColor(diasRestantes);
  const label = urgenciaLabel(diasRestantes);
  const diasTxt = diasRestantes === 1 ? '1 día' : `${diasRestantes} días`;

  const subject = `[${label}] ${tipoDoc} por vencer — ${descripcion} (${diasTxt})`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="background: ${color}; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">${label}: ${tipoDoc} por vencer</h2>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280; width: 140px;">Documento</td>
        <td style="padding: 8px 0; font-weight: 600;">${tipoDoc} ${identificador}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">${tipoDoc === 'Carnet' ? 'Titular' : 'Vehículo'}</td>
        <td style="padding: 8px 0; font-weight: 600;">${descripcion}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Vencimiento</td>
        <td style="padding: 8px 0; font-weight: 600;">${fechaVencimiento}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Días restantes</td>
        <td style="padding: 8px 0;">
          <span style="background: ${color}; color: #fff; padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 13px;">
            ${diasTxt}
          </span>
        </td>
      </tr>
      ${detalle ? `<tr><td style="padding: 8px 0; color: #6b7280;">Detalle</td><td style="padding: 8px 0;">${detalle}</td></tr>` : ''}
    </table>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
      Notificación automática — Grúas Bacar
    </p>
  </div>
</div>`.trim();

  return { subject, html };
}
