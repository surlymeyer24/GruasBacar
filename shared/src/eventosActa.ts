import type { Evento, Servicio } from './types';

/** Evento de llegada al corralón (legacy), si existe en el acta. */
export function eventoLlegadaCorralon(eventos: Evento[]): Evento | undefined {
  return eventos.find((e) => e.tipo === 'LLEGADA_CORRALON');
}

/**
 * Eventos para mostrar en detalle/PDF: sin LLEGADA_CORRALON;
 * la ubicación y corralón de llegada se fusionan en DESENGANCHE.
 */
export function eventosParaVistaActa(
  eventos: Evento[],
  servicio?: Pick<Servicio, 'corralon' | 'encargadoDeposito'>
): Evento[] {
  const llegada = eventoLlegadaCorralon(eventos);

  return eventos
    .filter((e) => e.tipo !== 'LLEGADA_CORRALON')
    .map((e) => {
      if (e.tipo !== 'DESENGANCHE') return e;
      return {
        ...e,
        geo: e.geo ?? llegada?.geo,
        corralon: e.corralon ?? llegada?.corralon ?? servicio?.corralon,
        encargadoDeposito:
          e.encargadoDeposito ?? llegada?.encargadoDeposito ?? servicio?.encargadoDeposito,
      };
    });
}
