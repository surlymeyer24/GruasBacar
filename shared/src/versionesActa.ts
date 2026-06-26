import type {
  ActualizarServicioPayload,
  DuplasServicio,
  EstadoServicio,
  RolUsuario,
  TipoFlota,
} from './types';
import {
  enganchadorDeDuplaServicio,
  labelTipoFlota,
  normalizeGruaId,
  normalizeTipoFlota,
} from './types';

export type TipoVersionActa = 'EDICION' | 'ANULACION' | 'CREACION_MANUAL';

export interface CambioCampoActa {
  campo: string;
  etiqueta: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
}

export interface VersionActa {
  id?: string;
  version: number;
  tipo: TipoVersionActa;
  editadoEn: unknown;
  editadoPorUid: string;
  editadoPorNombre: string;
  editadoPorRol: 'ADMIN' | 'SUPERVISOR' | 'OPERADOR';
  motivo?: string | null;
  cambios: CambioCampoActa[];
}

const ESTADO_LABEL: Record<EstadoServicio, string> = {
  ENGANCHADO: 'Enganchado',
  EN_TRASLADO: 'En traslado',
  DESENGANCHADO: 'Entregado',
  ANULADO: 'Anulado',
};

function displayValue(val: unknown, campo?: string): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (campo === 'tipoFlota') return labelTipoFlota(val as TipoFlota);
  if (campo === 'estado') {
    return ESTADO_LABEL[val as EstadoServicio] ?? String(val);
  }
  if (campo === 'grua') {
    try {
      return normalizeGruaId(String(val));
    } catch {
      return String(val).trim() || null;
    }
  }
  return String(val).trim() || null;
}

function norm(val: unknown, campo?: string): string {
  if (val === undefined || val === null) return '';
  if (campo === 'tipoFlota') return normalizeTipoFlota(val as string);
  if (campo === 'grua') {
    try {
      return normalizeGruaId(String(val));
    } catch {
      return String(val).trim().toUpperCase();
    }
  }
  if (typeof val === 'string') return val.trim();
  return String(val);
}

function pushCambio(
  cambios: CambioCampoActa[],
  campo: string,
  etiqueta: string,
  anterior: unknown,
  nuevo: unknown,
  campoNorm?: string
): void {
  const key = campoNorm ?? campo;
  if (norm(anterior, key) === norm(nuevo, key)) return;
  cambios.push({
    campo,
    etiqueta,
    valorAnterior: displayValue(anterior, key),
    valorNuevo: displayValue(nuevo, key),
  });
}

/** Compara el servicio actual con el payload de edición y devuelve los campos modificados. */
export function diffEdicionServicio(
  actual: Record<string, unknown>,
  data: ActualizarServicioPayload
): CambioCampoActa[] {
  const cambios: CambioCampoActa[] = [];
  const duplaActual = (actual.dupla ?? {}) as DuplasServicio;

  pushCambio(cambios, 'patente', 'Patente', actual.patente, data.patente);
  pushCambio(cambios, 'numeroInfraccion', 'Nº infracción', actual.numeroInfraccion, data.numeroInfraccion);
  pushCambio(cambios, 'grua', 'Grúa', actual.grua, data.grua, 'grua');

  if (data.corralon !== undefined) {
    pushCambio(cambios, 'corralon', 'Corralón', actual.corralon, data.corralon ?? null);
  }
  if (data.tipoFlota !== undefined) {
    pushCambio(cambios, 'tipoFlota', 'Tipo flota', actual.tipoFlota, data.tipoFlota, 'tipoFlota');
  }
  if (data.encargadoDeposito !== undefined) {
    pushCambio(
      cambios,
      'encargadoDeposito',
      'Encargado depósito',
      actual.encargadoDeposito,
      data.encargadoDeposito ?? null
    );
  }

  pushCambio(cambios, 'dupla.chofer', 'Chofer', duplaActual.chofer, data.dupla.chofer);
  pushCambio(
    cambios,
    'dupla.enganchador',
    'Enganchador',
    enganchadorDeDuplaServicio(duplaActual),
    enganchadorDeDuplaServicio(data.dupla)
  );
  pushCambio(cambios, 'dupla.inspector', 'Inspector', duplaActual.inspector, data.dupla.inspector);

  return cambios;
}

export function cambiosAnulacion(
  estadoAnterior: EstadoServicio,
  motivo?: string | null
): CambioCampoActa[] {
  const cambios: CambioCampoActa[] = [
    {
      campo: 'estado',
      etiqueta: 'Estado',
      valorAnterior: displayValue(estadoAnterior, 'estado'),
      valorNuevo: displayValue('ANULADO', 'estado'),
    },
  ];
  if (motivo?.trim()) {
    cambios.push({
      campo: 'motivoAnulacion',
      etiqueta: 'Motivo',
      valorAnterior: null,
      valorNuevo: motivo.trim(),
    });
  }
  return cambios;
}

export function rolEditorVersion(roles: RolUsuario[]): VersionActa['editadoPorRol'] {
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('SUPERVISOR')) return 'SUPERVISOR';
  return 'OPERADOR';
}

export function labelTipoVersion(tipo: TipoVersionActa): string {
  if (tipo === 'ANULACION') return 'Anulación';
  if (tipo === 'CREACION_MANUAL') return 'Alta manual';
  return 'Edición';
}
