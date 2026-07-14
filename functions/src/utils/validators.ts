import { HttpsError } from 'firebase-functions/v2/https';
import { buildIdentificadorCompuesto, normalizarPatenteInput, PATENTE_SIN_NUMERO } from '@gruasbacar/shared';

export { buildIdentificadorCompuesto };

export function validarPatente(patente: string): string {
  const cleaned = normalizarPatenteInput(patente);
  if (cleaned === PATENTE_SIN_NUMERO) return cleaned;
  // Formato argentino: AAA123 (viejo) o AA123AA (nuevo Mercosur)
  const viejoFormato = /^[A-Z]{3}\d{3}$/;
  const nuevoFormato = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
  if (!viejoFormato.test(cleaned) && !nuevoFormato.test(cleaned)) {
    throw new HttpsError('invalid-argument', `Patente inválida: ${patente}`);
  }
  return cleaned;
}

export function validarRequerido(valor: unknown, campo: string): void {
  if (valor === undefined || valor === null || valor === '') {
    throw new HttpsError('invalid-argument', `El campo "${campo}" es requerido.`);
  }
}

export function validarString(valor: unknown, campo: string, maxLength?: number): string {
  validarRequerido(valor, campo);
  if (typeof valor !== 'string') {
    throw new HttpsError('invalid-argument', `El campo "${campo}" debe ser texto.`);
  }
  const trimmed = valor.trim();
  if (maxLength && trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `El campo "${campo}" no puede superar los ${maxLength} caracteres.`);
  }
  return trimmed;
}

export function validarStringOpcional(valor: unknown, campo: string, maxLength: number): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (typeof valor !== 'string') {
    throw new HttpsError('invalid-argument', `El campo "${campo}" debe ser texto.`);
  }
  const trimmed = valor.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `El campo "${campo}" no puede superar los ${maxLength} caracteres.`);
  }
  return trimmed;
}

export function slugifyEtiqueta(etiqueta: string): string {
  return etiqueta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function sanitizePathPart(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'sin_dato';
}

/** Nombre de archivo en Drive con prefijo tipo evento, patente, legajo y posición. */
export function buildNombreFoto(
  etiqueta: string,
  index: number,
  carpeta?: 'enganche' | 'desenganche',
  patente?: string,
  legajo?: string,
): string {
  const slug = slugifyEtiqueta(etiqueta) || `foto_${index + 1}`;
  const posicion = index > 0 ? `${slug}_${index + 1}` : slug;

  if (carpeta && patente) {
    const prefijo = carpeta === 'enganche' ? 'En' : 'Ds';
    const patSafe = sanitizePathPart(patente);
    const legSafe = legajo ? sanitizePathPart(legajo) : '';
    const partes = [prefijo, patSafe, legSafe, posicion].filter(Boolean);
    return `${partes.join('_')}.jpg`;
  }

  return `${posicion}.jpg`;
}

export function fotosOpcionalesEnDev(): boolean {
  return process.env.FOTOS_OPCIONALES_DEV === 'true';
}

/** Firestore no acepta `undefined`; omitimos campos opcionales vacíos. */
export function fotoParaFirestore(f: {
  url: string;
  driveFileId?: string | null;
  etiqueta: string;
  observacion?: string | null;
  comentarios?: unknown[] | null;
}): {
  url: string;
  driveFileId?: string;
  etiqueta: string;
  observacion?: string;
  comentarios?: unknown[];
} {
  const out: {
    url: string;
    driveFileId?: string;
    etiqueta: string;
    observacion?: string;
    comentarios?: unknown[];
  } = {
    url: f.url,
    etiqueta: f.etiqueta,
  };
  const driveId = f.driveFileId?.trim();
  if (driveId) out.driveFileId = driveId;
  const obs = f.observacion?.trim();
  if (obs) out.observacion = obs;
  if (Array.isArray(f.comentarios) && f.comentarios.length > 0) {
    out.comentarios = f.comentarios;
  }
  return out;
}

export function fotosParaFirestore(
  fotos: Array<{
    url: string;
    driveFileId?: string | null;
    etiqueta: string;
    observacion?: string | null;
    comentarios?: unknown[] | null;
  }>
): Array<{ url: string; driveFileId?: string; etiqueta: string; observacion?: string; comentarios?: unknown[] }> {
  return fotos.map(fotoParaFirestore);
}

export function validarLoteFotos(fotos: unknown, fotosBase64?: unknown, maxExtras: number = 1): void {
  const metaList = Array.isArray(fotos) ? fotos : [];
  const base64List = Array.isArray(fotosBase64) ? fotosBase64 : [];
  const count = base64List.length > 0 ? base64List.length : metaList.length;
  const minRequeridas = 4;
  const maxTotal = minRequeridas + maxExtras;

  if (fotosOpcionalesEnDev()) {
    if (count > maxTotal || (base64List.length > 0 && metaList.length !== count)) {
      throw new HttpsError('invalid-argument', 'Los metadatos de las fotos no coinciden.');
    }
    return;
  }

  if (!count || count < minRequeridas || count > maxTotal) {
    throw new HttpsError(
      'invalid-argument',
      `Se requieren ${minRequeridas} fotos obligatorias (hasta ${maxExtras} adicional${maxExtras === 1 ? '' : 'es'} opcional${maxExtras === 1 ? '' : 'es'}).`
    );
  }

  if (base64List.length > 0) {
    if (metaList.length !== count) {
      throw new HttpsError('invalid-argument', 'Los metadatos de las fotos no coinciden.');
    }
    return;
  }

  for (let i = 0; i < metaList.length; i++) {
    const f = metaList[i] as { url?: string; driveFileId?: string; etiqueta?: string };
    if (!f?.etiqueta?.trim()) {
      throw new HttpsError('invalid-argument', `Foto ${i + 1}: falta la etiqueta.`);
    }
    if (!f.url?.trim() || !f.driveFileId?.trim()) {
      throw new HttpsError('invalid-argument', `Foto ${i + 1}: no se subió correctamente a Drive.`);
    }
  }
}

export function buildCarpetaPatenteInfraccion(patente: string, numeroInfraccion?: string): string {
  const inf = numeroInfraccion?.trim();
  return inf ? sanitizePathPart(`${patente}_${inf}`) : sanitizePathPart(patente);
}

type FechaServicioInput = Date | string | { toDate: () => Date } | null | undefined;

function toArgentinaDateString(d: Date): string {
  const offsetMs = -3 * 60 * 60 * 1000;
  const arg = new Date(d.getTime() + offsetMs);
  return arg.toISOString().slice(0, 10);
}

export function fechaCarpetaDrive(fecha?: FechaServicioInput): string {
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return toArgentinaDateString(fecha);
  }
  if (fecha && typeof fecha === 'object' && 'toDate' in fecha && typeof fecha.toDate === 'function') {
    return toArgentinaDateString(fecha.toDate());
  }
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    return fecha.slice(0, 10);
  }
  return toArgentinaDateString(new Date());
}

export function buildRutaFoto(
  legajo: string,
  patente: string,
  numeroInfraccion: string | undefined,
  carpeta: 'enganche' | 'desenganche',
  etiqueta: string,
  index: number,
  fechaServicio?: FechaServicioInput
): string {
  const fechaStr = fechaCarpetaDrive(fechaServicio);
  const legajoSafe = sanitizePathPart(legajo);
  const servicioSafe = buildCarpetaPatenteInfraccion(patente, numeroInfraccion);
  const fileName = buildNombreFoto(etiqueta, index, carpeta, patente, legajo);
  return `Gruas/${fechaStr}/${legajoSafe}/${servicioSafe}/${carpeta}/${fileName}`;
}
