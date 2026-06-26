import { Timestamp } from 'firebase/firestore';

/** Convierte Timestamp de Firestore, ISO string o Date a Date. */
export function parseFirestoreDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();

  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof (value as Timestamp).toDate === 'function') {
      const d = (value as Timestamp).toDate();
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

export function fechaServicio(servicio: {
  creadoEn?: unknown;
  fechaCreacion?: unknown;
}): Date | null {
  return parseFirestoreDate(servicio.creadoEn) ?? parseFirestoreDate(servicio.fechaCreacion);
}

/** Fecha del servicio en Argentina (YYYY-MM-DD) para filtros. */
export function fechaDiaServicio(servicio: {
  creadoEn?: unknown;
  fechaCreacion?: unknown;
}): string | null {
  const d = fechaServicio(servicio);
  if (!d) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatHora(value: unknown, fallback = '—'): string {
  const d = parseFirestoreDate(value);
  if (!d) return fallback;
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function formatFechaCorta(value: unknown, fallback = '—'): string {
  const d = parseFirestoreDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function formatFechaHora(value: unknown, fallback = '—'): string {
  const d = parseFirestoreDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Fecha completa en español, ej: "jueves, 18 de junio de 2026". */
export function formatFechaLarga(date: Date): string {
  const formatted = date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** Hora actual con segundos, ej: "14:32:05". */
export function formatHoraEnVivo(date: Date): string {
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Fecha de hoy en Argentina (YYYY-MM-DD). */
export function fechaHoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
