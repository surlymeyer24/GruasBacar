export type EstadoServicio = 'ENGANCHADO' | 'EN_TRASLADO' | 'DESENGANCHADO' | 'ANULADO';
export type TipoEvento = 'ENGANCHE' | 'TRASLADO' | 'LLEGADA_CORRALON' | 'DESENGANCHE';
export type RolUsuario = 'ADMIN' | 'SUPERVISOR' | 'ENGANCHADOR' | 'CHOFER';

/** Tipo operativo de grúa y dupla (tránsito municipal vs transporte). */
export type TipoFlota = 'TRANSITO' | 'TRANSPORTE';

export const TIPO_FLOTA_OPTIONS: { value: TipoFlota; label: string }[] = [
  { value: 'TRANSITO', label: 'Tránsito' },
  { value: 'TRANSPORTE', label: 'Transporte' },
];

export function normalizeTipoFlota(tipo: string | undefined): TipoFlota {
  return tipo === 'TRANSPORTE' ? 'TRANSPORTE' : 'TRANSITO';
}

export function labelTipoFlota(tipo: TipoFlota | string | undefined): string {
  return normalizeTipoFlota(tipo) === 'TRANSPORTE' ? 'Transporte' : 'Tránsito';
}

export const TIPO_FLOTA_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todos los tipos' },
  ...TIPO_FLOTA_OPTIONS,
];

export function matchesTipoFlotaFilter(tipo: string | undefined, filter: string): boolean {
  if (filter === 'ALL') return true;
  return normalizeTipoFlota(tipo) === filter;
}

/** Normaliza roles legacy (p. ej. CHOFER, AYUDANTE) al modelo actual. */
export function normalizeRol(rol: string | undefined): RolUsuario {
  const key = rol?.trim().toUpperCase();
  if (key === 'ADMIN') return 'ADMIN';
  if (key === 'SUPERVISOR') return 'SUPERVISOR';
  if (key === 'CHOFER') return 'CHOFER';
  if (key === 'ENGANCHADOR' || key === 'AYUDANTE') return 'ENGANCHADOR';
  return 'ENGANCHADOR';
}

/** Etiqueta legible de rol para la UI (nunca muestra "Ayudante"). */
export function labelRolUsuario(rol: string | undefined): string {
  const normalized = normalizeRol(rol);
  if (normalized === 'ADMIN') return 'Administrador';
  if (normalized === 'SUPERVISOR') return 'Supervisor';
  if (normalized === 'CHOFER') return 'Chofer';
  return 'Enganchador';
}

/** Devuelve un array de roles asegurando que al menos exista ENGANCHADOR si está vacío. */
export function normalizeRoles(roles: any[] | undefined, legacyRol?: string): RolUsuario[] {
  if (roles && Array.isArray(roles) && roles.length > 0) {
    return roles.map(r => normalizeRol(r));
  }
  if (legacyRol) {
    return [normalizeRol(legacyRol)];
  }
  return ['ENGANCHADOR'];
}

/** Rol de campo: enganchador o chofer (equivalentes para operar servicios). */
export function esOperador(roles: RolUsuario[]): boolean {
  return roles.includes('ENGANCHADOR') || roles.includes('CHOFER');
}

/** Admin sin rol operativo de campo. */
export function esSoloAdmin(roles: RolUsuario[]): boolean {
  return roles.includes('ADMIN') && !esOperador(roles);
}

/** Supervisor de flota (consulta de actas). */
export function esSupervisor(roles: RolUsuario[]): boolean {
  return roles.includes('SUPERVISOR');
}

/** Solo supervisor: sin permisos de admin ni operador de campo. */
export function esSoloSupervisor(roles: RolUsuario[]): boolean {
  return esSupervisor(roles) && !esOperador(roles) && !roles.includes('ADMIN');
}

/** Historial completo de la flota (lectura). */
export function puedeVerHistorialCompleto(roles: RolUsuario[]): boolean {
  return roles.includes('ADMIN') || esSupervisor(roles);
}

/** Editar o anular actas (admin y supervisor). */
export function puedeGestionarActas(roles: RolUsuario[]): boolean {
  return roles.includes('ADMIN') || esSupervisor(roles);
}

/** Ruta de inicio según roles del usuario. */
export function rutaInicioPorRoles(roles: RolUsuario[]): string {
  if (esOperador(roles)) return '/';
  if (roles.includes('ADMIN')) return '/admin-dashboard';
  if (esSupervisor(roles)) return '/supervisor-dashboard';
  return '/login';
}

const RUTAS_OPERADOR = new Set(['/', '/enganche', '/traslado', '/desenganche']);
const RUTAS_SUPERVISOR = new Set(['/supervisor-dashboard', '/supervisor/nueva-acta', '/historial', '/reportes']);

/** Rutas exclusivas del flujo operativo de campo. */
export function esRutaOperador(pathname: string): boolean {
  return RUTAS_OPERADOR.has(pathname);
}

/** Rutas permitidas para supervisor (solo lectura). */
export function esRutaSupervisor(pathname: string): boolean {
  return RUTAS_SUPERVISOR.has(pathname);
}

/** Resumen denormalizado del servicio activo (evita lectura extra en login/home). */
export interface ServicioActivoResumen {
  id: string;
  estado: EstadoServicio;
  patente: string;
  numeroInfraccion: string;
}

/** Indica si el resumen apunta a un servicio aún en curso. */
export function servicioActivoVigente(
  resumen: ServicioActivoResumen | null | undefined
): boolean {
  if (!resumen) return false;
  return resumen.estado === 'ENGANCHADO' || resumen.estado === 'EN_TRASLADO';
}

/** Ruta del flujo operador según el estado del servicio activo. */
export function rutaFlujoOperadorPorEstado(estado: EstadoServicio): string {
  switch (estado) {
    case 'ENGANCHADO':
      return '/enganche';
    case 'EN_TRASLADO':
      return '/traslado';
    default:
      return '/desenganche';
  }
}

/** Destino seguro tras login (evita mandar admin puro a /enganche, etc.). */
export function destinoPostLogin(
  roles: RolUsuario[],
  from?: string,
  resumen?: ServicioActivoResumen | null
): string {
  const home = rutaInicioPorRoles(roles);
  const fromTrimmed = from?.trim();
  let dest = fromTrimmed || home;
  if (dest === '/login') return home;
  if (!esOperador(roles) && esRutaOperador(dest)) return home;
  if (esSoloSupervisor(roles) && !esRutaSupervisor(dest)) return home;

  const destinoOperadorImplicito =
    !fromTrimmed || dest === '/' || dest === home || esRutaOperador(dest);
  if (esOperador(roles) && servicioActivoVigente(resumen) && destinoOperadorImplicito) {
    return rutaFlujoOperadorPorEstado(resumen!.estado);
  }

  return dest;
}

/** Comprueba un rol; CHOFER y ENGANCHADOR se consideran equivalentes entre sí. */
export function tieneRol(roles: RolUsuario[], rol: RolUsuario): boolean {
  if (roles.includes(rol)) return true;
  if (rol === 'ENGANCHADOR' || rol === 'CHOFER') return esOperador(roles);
  return false;
}

/** Legajo obligatorio para todos los usuarios. */
export function requiereLegajo(_roles?: RolUsuario[]): boolean {
  return true;
}

/** Clave normalizada para comparar legajos (trim + minúsculas). */
export function legajoKey(legajo: string | undefined | null): string {
  return legajo?.trim().toLowerCase() ?? '';
}

/** Indica si el legajo ya está asignado a otro usuario en la lista. */
export function legajoYaUsado(
  legajo: string,
  usuarios: { uid: string; legajo?: string | null }[],
  excludeUid?: string
): boolean {
  const key = legajoKey(legajo);
  if (!key) return false;
  return usuarios.some((u) => {
    if (excludeUid && u.uid === excludeUid) return false;
    const existing = legajoKey(u.legajo);
    return !!existing && existing === key;
  });
}

/** Normaliza texto para usarlo como parte del UID de Firebase Auth. */
export function sanitizeUsuarioUidPart(value: string): string {
  const cleaned = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._@-]/g, '');
  return cleaned.slice(0, 100) || 'x';
}

/** Rol principal para el sufijo del UID (excluye ADMIN). */
export function rolPrincipalParaUid(roles: RolUsuario[]): RolUsuario {
  const normalized = normalizeRoles(roles);
  const sinAdmin = normalized.filter((r) => r !== 'ADMIN');
  return sinAdmin[0] ?? normalized[0] ?? 'ENGANCHADOR';
}

/**
 * UID determinístico para Firebase Auth / Firestore `usuarios/{uid}`.
 * - Admin: `admin` + nombre sanitizado
 * - Supervisor sin legajo: `supervisor` + nombre sanitizado
 * - Resto: legajo + rol principal
 */
export function buildUsuarioUid(params: {
  nombre: string;
  roles: RolUsuario[];
  legajo?: string | null;
}): string {
  const { nombre, roles, legajo } = params;
  const normalized = normalizeRoles(roles);
  const nombreSafe = sanitizeUsuarioUidPart(nombre);

  if (normalized.includes('ADMIN')) {
    return `admin${nombreSafe}`.slice(0, 128);
  }

  const legajoSafe = sanitizeUsuarioUidPart(legajo ?? '');
  if (legajoSafe && legajoSafe !== 'x') {
    const rol = rolPrincipalParaUid(normalized);
    return `${legajoSafe}${rol}`.slice(0, 128);
  }

  if (esSoloSupervisor(normalized)) {
    return `supervisor${nombreSafe}`.slice(0, 128);
  }

  throw new Error('Legajo requerido para generar el UID del usuario.');
}

/** Clave de unicidad del servicio: `{infraccion}-{legajo}-{patente}`. */
export function buildIdentificadorCompuesto(
  numeroInfraccion: string,
  legajo: string,
  patente: string
): string {
  return `${numeroInfraccion.trim()}-${legajo.trim()}-${patente.trim()}`;
}

/** ID determinístico de documento Firestore para grúas: `G-{patente}`. */
export function buildGruaId(patente: string): string {
  const normalized = patente.trim().toUpperCase().replace(/\s/g, '');
  return `G-${normalized}`;
}

/** Normaliza valor de grúa (patente o id) al formato `G-{patente}`. */
export function normalizeGruaId(grua: string): string {
  const trimmed = grua.trim().toUpperCase().replace(/\s/g, '');
  if (trimmed.startsWith('G-')) return trimmed;
  return buildGruaId(trimmed);
}

/** Extrae la patente desde un id `G-{patente}` o devuelve el valor tal cual. */
export function patenteDesdeGruaId(gruaId: string): string {
  const trimmed = gruaId.trim().toUpperCase().replace(/\s/g, '');
  return trimmed.startsWith('G-') ? trimmed.slice(2) : trimmed;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function esGeoValida(geo?: GeoPoint | null): geo is GeoPoint {
  if (!geo) return false;
  const { lat, lng } = geo;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export type EtiquetaFoto = "DELANTERA" | "LADO_DERECHO" | "LADO_IZQUIERDO" | "TRASERA" | "OBSERVACION";

/** Comentario de auditoría sobre una foto (supervisor / admin). */
export interface ComentarioFoto {
  id: string;
  texto: string;
  autorUid: string;
  autorNombre: string;
  creadoEn: string;
}

export interface Foto {
  url: string;
  driveFileId?: string;
  etiqueta: EtiquetaFoto;
  observacion?: string;
  comentarios?: ComentarioFoto[];
}

export interface Grua {
  id: string;
  patente: string;
  descripcion: string;
  activa: boolean;
  /** Default legacy: TRANSITO */
  tipo?: TipoFlota;
}

export interface Corralon {
  id: string;
  nombre: string;
  direccion: string;
  activo: boolean;
  lat?: number;
  lng?: number;
}

export interface Dupla {
  id: string;
  chofer: string;    // nombre
  enganchador: string;  // nombre
  /** @deprecated Campo legacy en Firestore */
  ayudante?: string;
  /** Default legacy: TRANSITO */
  tipo?: TipoFlota;
  /** Grúa habitual asignada a esta dupla (id de documento en colección gruas). */
  gruaId?: string;
}

/** Nombre del enganchador en catálogo de duplas (compat. campo legacy `ayudante`). */
export function enganchadorDeDupla(
  dupla: { enganchador?: string; ayudante?: string } | null | undefined
): string {
  return dupla?.enganchador?.trim() || dupla?.ayudante?.trim() || "";
}

/** Nombre del enganchador en asignación diaria (compat. `duplaAyudante`). */
export function duplaEnganchadorDeAsignacion(
  asignacion: { duplaEnganchador?: string; duplaAyudante?: string } | null | undefined
): string {
  return asignacion?.duplaEnganchador?.trim() || asignacion?.duplaAyudante?.trim() || "";
}

/** Nombre del enganchador en snapshot de servicio (compat. `ayudante`). */
export function enganchadorDeDuplaServicio(
  dupla: { enganchador?: string; ayudante?: string } | null | undefined
): string {
  return enganchadorDeDupla(dupla);
}

/** Asignación operativa confirmada al inicio del día (grúa, dupla e inspector). */
export interface AsignacionDiaria {
  fecha: string; // YYYY-MM-DD (zona Argentina)
  gruaPatente: string;
  duplaId: string;
  duplaChofer: string;
  duplaEnganchador: string;
  /** @deprecated Campo legacy en Firestore */
  duplaAyudante?: string;
  inspector: string;
  /** Tránsito o transporte según la grúa/dupla del turno. */
  tipoFlota?: TipoFlota;
  /** Inicio del turno (ISO 8601, servidor). Expira a las 8 h. */
  inicioEn?: string;
}

export const DURACION_TURNO_MS = 8 * 60 * 60 * 1000;

export function asignacionCompleta(asignacion: AsignacionDiaria): boolean {
  return !!(
    asignacion.gruaPatente?.trim() &&
    asignacion.duplaId?.trim() &&
    asignacion.inspector?.trim()
  );
}

/** Sin inicioEn (legacy): vigente el día calendario; con inicioEn: 8 h desde el inicio. */
export function turnoSigueVigente(asignacion: AsignacionDiaria, ahora = new Date()): boolean {
  if (!asignacion.inicioEn) return true;
  const inicio = new Date(asignacion.inicioEn);
  if (Number.isNaN(inicio.getTime())) return true;
  return ahora.getTime() - inicio.getTime() < DURACION_TURNO_MS;
}

export function finTurno(asignacion: AsignacionDiaria): Date | null {
  if (!asignacion.inicioEn) return null;
  const inicio = new Date(asignacion.inicioEn);
  if (Number.isNaN(inicio.getTime())) return null;
  return new Date(inicio.getTime() + DURACION_TURNO_MS);
}

export interface Usuario {
  uid: string;
  nombre: string;
  email?: string;
  rol?: RolUsuario; // Legacy: deprecated in favor of roles
  roles: RolUsuario[];
  /** Número de legajo del enganchador (obligatorio para rol ENGANCHADOR) */
  legajo?: string;
  servicioActivoId: string | null;
  /** Snapshot del servicio activo; mantenido por Cloud Functions. */
  servicioActivoResumen?: ServicioActivoResumen | null;
  activo?: boolean;
  asignacionDiaria?: AsignacionDiaria;
}

export interface DuplasServicio {
  chofer: string;
  enganchador: string;
  /** @deprecated Campo legacy en actas guardadas */
  ayudante?: string;
  inspector: string;
}

export interface Evento {
  id?: string;
  tipo: TipoEvento;
  timestamp: any; // Firestore Timestamp or string
  geo?: GeoPoint;
  fotos?: Foto[];
  observacionGeneral?: string;
  corralon?: string;
  encargadoDeposito?: string;
  /** Dirección en texto libre o URL de Maps cuando no hay geo resuelta. */
  ubicacionReferencia?: string;
}

export interface Servicio {
  id: string;
  patente: string;
  numeroInfraccion: string;
  identificadorCompuesto: string; // `{numeroInfraccion}-{legajo}-{patente}` — también ID del documento
  estado: EstadoServicio;
  grua: string;          // id de grúa `G-{patente}`
  corralon?: string;     // id o nombre del corralón (se carga al llegar)
  encargadoDeposito?: string; // nombre del encargado al registrar llegada
  creadoPor: string;     // uid del enganchador
  legajoChofer?: string; // legajo al momento del enganche
  /** Tránsito o transporte al momento del enganche. */
  tipoFlota?: TipoFlota;
  dupla: DuplasServicio;
  /** GPS capturado al iniciar el enganche (origen del traslado). */
  geoEnganche?: GeoPoint;
  creadoEn?: any;     // Firestore Timestamp
  fechaCreacion?: any; // Alias for labs compatibility
  /** Momento en que se confirmó el desenganche (cierre del acta). */
  finalizadoEn?: unknown;
  motivoAnulacion?: string | null;
  anuladoPor?: string;
  anuladoEn?: unknown;
  /** Acta cargada manualmente por admin/supervisor (respaldo operativo). */
  origenManual?: boolean;
  /** Cantidad de revisiones registradas (ediciones, anulaciones, etc.). */
  versionCount?: number;
  eventos?: Evento[];
}

/** Coordenadas del punto de enganche (evento ENGANCHE o geoEnganche del servicio). */
export function geoEngancheDeServicio(servicio: Servicio): GeoPoint | null {
  const eventoEnganche = servicio.eventos?.find((e) => e.tipo === "ENGANCHE");
  if (esGeoValida(eventoEnganche?.geo)) return eventoEnganche!.geo!;
  if (esGeoValida(servicio.geoEnganche)) return servicio.geoEnganche!;
  return null;
}

export interface GuardarAsignacionDiariaPayload {
  gruaPatente: string;
  duplaId: string;
  duplaChofer: string;
  duplaEnganchador: string;
  /** @deprecated Payload legacy */
  duplaAyudante?: string;
  inspector: string;
  tipoFlota?: TipoFlota;
}

// Payloads para Firebase Functions
export interface IniciarEnganchePayload {
  patente: string;
  numeroInfraccion: string;
  grua: string;
  dupla: DuplasServicio;
  geo: GeoPoint;
}

export interface RegistrarEventoEnganchePayload {
  servicioId: string;
  fotos: Omit<Foto, 'url' | 'driveFileId'>[];
  fotosBase64: string[];
  geo?: GeoPoint;
  observacionGeneral?: string;
}

export interface RegistrarLlegadaCorralónPayload {
  servicioId: string;
  corralon: string;
  encargadoDeposito: string;
  geo: GeoPoint;
}

export interface ConfirmarDesenganchePayload {
  servicioId: string;
  fotos: Omit<Foto, 'url' | 'driveFileId'>[];
  fotosBase64: string[];
  observacionGeneral?: string;
}

export interface AnularServicioPayload {
  servicioId: string;
  motivo?: string;
}

export interface ActualizarServicioPayload {
  servicioId: string;
  patente: string;
  numeroInfraccion: string;
  grua: string;
  corralon?: string | null;
  dupla: DuplasServicio;
  tipoFlota?: TipoFlota;
  encargadoDeposito?: string | null;
  /** Motivo opcional de la corrección (auditoría). */
  motivo?: string | null;
}

export interface AgregarComentarioFotoPayload {
  servicioId: string;
  eventoId: string;
  fotoIndex: number;
  texto: string;
}

/** Alta manual de acta completa (supervisor / admin). */
export interface CrearActaManualPayload {
  patente: string;
  numeroInfraccion: string;
  grua: string;
  dupla: DuplasServicio;
  legajoEnganchador: string;
  corralon?: string | null;
  encargadoDeposito?: string | null;
  tipoFlota?: TipoFlota;
  /** Texto libre o URL de Google Maps (enganche). */
  ubicacionEnganche?: string;
  /** Texto libre o URL de Google Maps (llegada al corralón). */
  ubicacionLlegada?: string;
  observacionGeneral?: string;
  fotosEnganche: Omit<Foto, 'url' | 'driveFileId'>[];
  fotosEngancheBase64: string[];
  fotosDesenganche?: Omit<Foto, 'url' | 'driveFileId'>[];
  fotosDesengancheBase64?: string[];
}
