/** Convierte Timestamp de Firestore, ISO string, Date o { seconds } a Date. */
export function parseFirestoreLikeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      const d = (value as { toDate: () => Date }).toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if ('seconds' in value && typeof (value as { seconds: number }).seconds === 'number') {
      return new Date((value as { seconds: number }).seconds * 1000);
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** Formatea una duración en milisegundos a texto legible (es-AR). */
export function formatDuracion(ms: number): string {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.floor(totalSeg / 3600);
  const minutos = Math.floor((totalSeg % 3600) / 60);
  const segundos = totalSeg % 60;

  if (horas > 0) {
    return minutos > 0 ? `${horas} h ${minutos} min` : `${horas} h`;
  }
  if (minutos > 0) {
    return `${minutos} min`;
  }
  return `${segundos} seg`;
}

export interface ResumenDuracionActa {
  inicio: Date;
  fin: Date | null;
  duracionMs: number | null;
  etiqueta: string;
  enCurso: boolean;
}

type ServicioDuracion = {
  creadoEn?: unknown;
  fechaCreacion?: unknown;
  estado?: string;
  anuladoEn?: unknown;
  finalizadoEn?: unknown;
};

type EventoDuracion = { tipo: string; timestamp?: unknown };

function finDesdeEventos(eventos: EventoDuracion[] | undefined): Date | null {
  if (!eventos?.length) return null;
  const desenganche = [...eventos].reverse().find((e) => e.tipo === 'DESENGANCHE');
  return parseFirestoreLikeDate(desenganche?.timestamp);
}

/** Calcula inicio, fin y duración del acta (enganche → cierre o anulación). */
export function resumenDuracionActa(
  servicio: ServicioDuracion,
  eventos?: EventoDuracion[]
): ResumenDuracionActa | null {
  const inicio =
    parseFirestoreLikeDate(servicio.creadoEn) ??
    parseFirestoreLikeDate(servicio.fechaCreacion);
  if (!inicio) return null;

  const finalizado =
    servicio.estado === 'DESENGANCHADO' || servicio.estado === 'ANULADO';

  let fin: Date | null = null;

  if (servicio.estado === 'DESENGANCHADO') {
    fin =
      parseFirestoreLikeDate(servicio.finalizadoEn) ?? finDesdeEventos(eventos);
  } else if (servicio.estado === 'ANULADO') {
    fin = parseFirestoreLikeDate(servicio.anuladoEn);
  }

  const enCurso = !finalizado;

  let duracionMs: number | null = null;
  let etiqueta: string;

  if (fin) {
    duracionMs = Math.max(0, fin.getTime() - inicio.getTime());
    etiqueta = formatDuracion(duracionMs);
  } else if (finalizado) {
    etiqueta = '—';
  } else {
    duracionMs = Math.max(0, Date.now() - inicio.getTime());
    etiqueta = `${formatDuracion(duracionMs)} (en curso)`;
  }

  return { inicio, fin, duracionMs, etiqueta, enCurso };
}
