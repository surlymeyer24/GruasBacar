import type { AsignacionDiaria } from './types';

export type TipoNotificacion =
  | 'TURNO_ASIGNADO'
  | 'TURNO_MODIFICADO'
  | 'SOLICITUD_RECONFIG_TURNO'
  | 'FOTO_SUBIDA_ERROR'
  | 'CARNET_POR_VENCER_30D'
  | 'CARNET_POR_VENCER_15D'
  | 'CARNET_POR_VENCER_7D'
  | 'ITV_POR_VENCER_7D'
  | 'ITV_POR_VENCER_1D';

export interface Notificacion {
  id: string;
  destinatarioUid: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  datos?: Record<string, string>;
  leida: boolean;
  creadaEn: unknown;
  origenUid?: string;
  claveDedup?: string;
}

export interface AsignarTurnoOperadorPayload {
  operadorUid: string;
  asignacionDiaria: AsignacionDiaria;
}

export interface SolicitarReconfiguracionTurnoPayload {
  mensaje?: string;
}

/** Rutas de acción rápida (HashRouter). */
export const RUTA_NOTIF_TURNOS = '/turnos';
export const RUTA_NOTIF_HISTORIAL = '/historial';

export function rutaHistorialServicio(servicioId: string): string {
  return `${RUTA_NOTIF_HISTORIAL}?servicio=${encodeURIComponent(servicioId)}`;
}
