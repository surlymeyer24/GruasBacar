import { esEntornoTest } from "../firebase";

/** Acta marcada desde el site de prueba. */
export function esActaDePrueba(s: { esTest?: boolean } | null | undefined): boolean {
  return s?.esTest === true;
}

/**
 * En producción oculta actas de prueba.
 * En el site test muestra todas (las de test llevan badge en UI).
 */
export function filtrarActasPorEntorno<T extends { esTest?: boolean }>(servicios: T[]): T[] {
  if (esEntornoTest) return servicios;
  return servicios.filter((s) => !esActaDePrueba(s));
}

/** ¿El servicio activo del usuario corresponde a este entorno? */
export function servicioActivoVisibleEnEntorno(resumen: {
  esTest?: boolean;
} | null | undefined): boolean {
  if (!resumen) return false;
  return esEntornoTest ? esActaDePrueba(resumen) : !esActaDePrueba(resumen);
}
