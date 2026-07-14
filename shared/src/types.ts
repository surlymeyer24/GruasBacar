export type EstadoServicio = 'ENGANCHADO' | 'EN_TRASLADO' | 'DESENGANCHADO' | 'ANULADO';
export type TipoEvento = 'ENGANCHE' | 'TRASLADO' | 'LLEGADA_CORRALON' | 'DESENGANCHE';
export type RolUsuario = 'SUPERADMIN' | 'ADMIN' | 'SUPERVISOR' | 'VISOR' | 'ENGANCHADOR' | 'CHOFER';

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
  if (key === 'SUPERADMIN') return 'SUPERADMIN';
  if (key === 'ADMIN') return 'ADMIN';
  if (key === 'SUPERVISOR') return 'SUPERVISOR';
  if (key === 'VISOR') return 'VISOR';
  if (key === 'CHOFER') return 'CHOFER';
  if (key === 'ENGANCHADOR' || key === 'AYUDANTE') return 'ENGANCHADOR';
  return 'ENGANCHADOR';
}

/** Etiqueta legible de rol para la UI (nunca muestra "Ayudante"). */
export function labelRolUsuario(rol: string | undefined): string {
  const normalized = normalizeRol(rol);
  if (normalized === 'SUPERADMIN') return 'Super Admin';
  if (normalized === 'ADMIN') return 'Administrador';
  if (normalized === 'SUPERVISOR') return 'Supervisor';
  if (normalized === 'VISOR') return 'Visor';
  if (normalized === 'CHOFER') return 'Chofer';
  return 'Enganchador';
}

/** Extrae el primer nombre de un nombre completo (ej: "Juan Pérez García" -> "Juan"). */
export function primerNombre(nombreCompleto: string | undefined | null): string {
  if (!nombreCompleto) return '';
  return nombreCompleto.trim().split(/\s+/)[0] ?? '';
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

/** SUPERADMIN o ADMIN (SUPERADMIN hereda todos los permisos de ADMIN). */
export function esAdmin(roles: RolUsuario[]): boolean {
  return roles.includes('SUPERADMIN') || roles.includes('ADMIN');
}

/** Solo SUPERADMIN: gestión de admins, config del sistema, auditoría, eliminación permanente. */
export function esSuperAdmin(roles: RolUsuario[]): boolean {
  return roles.includes('SUPERADMIN');
}

/** Admin sin rol operativo de campo. */
export function esSoloAdmin(roles: RolUsuario[]): boolean {
  return esAdmin(roles) && !esOperador(roles);
}

/** Supervisor de flota (consulta de actas). */
export function esSupervisor(roles: RolUsuario[]): boolean {
  return roles.includes('SUPERVISOR');
}

/** Solo supervisor: sin permisos de admin ni operador de campo. */
export function esSoloSupervisor(roles: RolUsuario[]): boolean {
  return esSupervisor(roles) && !esOperador(roles) && !esAdmin(roles);
}

/** Visor: rol de solo lectura (dashboard, historial, reportes — sin crear/editar/anular actas). */
export function esVisor(roles: RolUsuario[]): boolean {
  return roles.includes('VISOR');
}

/** Solo visor: sin permisos de admin, supervisor ni operador de campo. */
export function esSoloVisor(roles: RolUsuario[]): boolean {
  return esVisor(roles) && !esOperador(roles) && !esAdmin(roles) && !esSupervisor(roles);
}

/** Historial completo de la flota (lectura). */
export function puedeVerHistorialCompleto(roles: RolUsuario[]): boolean {
  return esAdmin(roles) || esSupervisor(roles) || esVisor(roles);
}

/** Editar o anular actas (admin y supervisor). */
export function puedeGestionarActas(roles: RolUsuario[]): boolean {
  return esAdmin(roles) || esSupervisor(roles);
}

/** Ruta de inicio según roles del usuario. */
export function rutaInicioPorRoles(roles: RolUsuario[]): string {
  if (esOperador(roles)) return '/';
  if (esAdmin(roles)) return '/admin-dashboard';
  if (esSupervisor(roles)) return '/supervisor-dashboard';
  if (esVisor(roles)) return '/supervisor-dashboard';
  return '/login';
}

const RUTAS_OPERADOR = new Set(['/', '/enganche', '/traslado', '/desenganche']);
const RUTAS_SUPERVISOR = new Set(['/supervisor-dashboard', '/supervisor/nueva-acta', '/historial', '/reportes']);
const RUTAS_VISOR = new Set(['/supervisor-dashboard', '/historial', '/reportes']);

/** Rutas exclusivas del flujo operativo de campo. */
export function esRutaOperador(pathname: string): boolean {
  return RUTAS_OPERADOR.has(pathname);
}

/** Rutas permitidas para supervisor (solo lectura). */
export function esRutaSupervisor(pathname: string): boolean {
  return RUTAS_SUPERVISOR.has(pathname);
}

/** Rutas permitidas para visor (solo lectura, sin crear actas). */
export function esRutaVisor(pathname: string): boolean {
  return RUTAS_VISOR.has(pathname);
}

/** Resumen denormalizado del servicio activo (evita lectura extra en login/home). */
export interface ServicioActivoResumen {
  id: string;
  estado: EstadoServicio;
  patente: string;
  numeroInfraccion?: string;
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
  if (esSoloVisor(roles) && !esRutaVisor(dest)) return home;
  if (esSoloSupervisor(roles) && !esRutaSupervisor(dest)) return home;

  const destinoOperadorImplicito =
    !fromTrimmed || dest === '/' || dest === home || esRutaOperador(dest);
  if (esOperador(roles) && servicioActivoVigente(resumen) && destinoOperadorImplicito) {
    return rutaFlujoOperadorPorEstado(resumen!.estado);
  }

  return dest;
}

/** Comprueba un rol. SUPERADMIN tiene acceso total; CHOFER y ENGANCHADOR son equivalentes; VISOR hereda lectura de SUPERVISOR. */
export function tieneRol(roles: RolUsuario[], rol: RolUsuario): boolean {
  if (roles.includes(rol)) return true;
  if (esSuperAdmin(roles)) return true;
  if (rol === 'ADMIN') return esAdmin(roles);
  if (rol === 'ENGANCHADOR' || rol === 'CHOFER') return esOperador(roles);
  if (rol === 'SUPERVISOR') return esSupervisor(roles) || esVisor(roles);
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

/** Rol principal para el sufijo del UID (excluye ADMIN y SUPERADMIN). */
export function rolPrincipalParaUid(roles: RolUsuario[]): RolUsuario {
  const normalized = normalizeRoles(roles);
  const sinAdmin = normalized.filter((r) => r !== 'ADMIN' && r !== 'SUPERADMIN');
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

  if (normalized.includes('SUPERADMIN')) {
    return `superadmin${nombreSafe}`.slice(0, 128);
  }

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

  if (esSoloVisor(normalized)) {
    return `visor${nombreSafe}`.slice(0, 128);
  }

  throw new Error('Legajo requerido para generar el UID del usuario.');
}

/** Parte de un ID de documento Firestore: sin `/` (reservado para rutas de colección). */
function sanitizeIdentificadorPart(value: string): string {
  return value.trim().replace(/\//g, '');
}

/** Clave de unicidad del servicio: `{infraccion}-{legajo}-{patente}`. */
export function buildIdentificadorCompuesto(
  numeroInfraccion: string | undefined,
  legajo: string,
  patente: string
): string {
  const infraccion = sanitizeIdentificadorPart(numeroInfraccion ?? '');
  const legajoSafe = sanitizeIdentificadorPart(legajo);
  const patenteSafe = sanitizeIdentificadorPart(patente);
  return infraccion
    ? `${infraccion}-${legajoSafe}-${patenteSafe}`
    : `${legajoSafe}-${patenteSafe}`;
}

/** ID determinístico de documento Firestore para grúas: `G-{patente}`. */
export function buildGruaId(patente: string): string {
  const normalized = patente.trim().toUpperCase().replace(/\s/g, '');
  return `G-${normalized}`;
}

/** Valor canónico para vehículos sin patente visible/legible. */
export const PATENTE_SIN_NUMERO = 'S/N';

/** Normaliza el valor de patente ingresado (mayúsculas, sin espacios/guiones). "SN" y "SIN" se colapsan a "S/N". */
export function normalizarPatenteInput(patente: string | undefined | null): string {
  const clean = (patente ?? '').replace(/[\s-]/g, '').toUpperCase();
  return clean === 'SN' || clean === 'SIN' ? PATENTE_SIN_NUMERO : clean;
}

export function esPatenteSinNumero(patente: string | undefined | null): boolean {
  return normalizarPatenteInput(patente) === PATENTE_SIN_NUMERO;
}

/** Devuelve la patente para mostrar al usuario. S/N se muestra como "sin". */
export function displayPatente(patente: string | undefined | null): string {
  const normalized = normalizarPatenteInput(patente);
  return normalized === PATENTE_SIN_NUMERO ? 'sin' : normalized;
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

export type TipoDestino = 'CORRALON' | 'SECCIONAL';

export interface Corralon {
  id: string;
  nombre: string;
  direccion: string;
  activo: boolean;
  lat?: number;
  lng?: number;
  tipo?: TipoDestino;
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
  /** Legajo del Usuario que ocupa el rol de chofer en esta dupla (vínculo estable, no depende del nombre). */
  legajoChofer?: string;
  /** Legajo del Usuario que ocupa el rol de enganchador en esta dupla. */
  legajoEnganchador?: string;
  /** Posición en el diagrama de rotación mensual (1 = primera; la última es la de transporte). */
  orden?: number;
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

/** Clave normalizada para comparar nombres de personas (trim + minúsculas). */
export function nombreKey(nombre: string | undefined | null): string {
  return nombre?.trim().toLowerCase() ?? '';
}

/** Clave normalizada sin espacios, para tolerar variantes (ej. inicial de apellido, orden distinto). */
function nombreKeyCompacta(nombre: string | undefined | null): string {
  return nombreKey(nombre).replace(/\s+/g, '');
}

/** Compara dos nombres de forma flexible: coincidencia exacta o que uno contenga al otro. */
export function nombresCoinciden(a: string | undefined | null, b: string | undefined | null): boolean {
  const ak = nombreKeyCompacta(a);
  const bk = nombreKeyCompacta(b);
  if (!ak || !bk) return false;
  return ak === bk || ak.includes(bk) || bk.includes(ak);
}

/**
 * Dupla del catálogo que corresponde al usuario registrado.
 * Prioriza el legajo (vínculo estable); si la dupla no tiene legajo cargado (catálogo viejo),
 * recurre a comparar nombres de forma flexible.
 */
export function duplaDeUsuario(
  duplas: Dupla[],
  usuario: { nombre?: string; legajo?: string } | null | undefined
): Dupla | undefined {
  const legajoUsuario = legajoKey(usuario?.legajo);
  if (legajoUsuario) {
    const porLegajo = duplas.find(
      (d) => legajoKey(d.legajoChofer) === legajoUsuario || legajoKey(d.legajoEnganchador) === legajoUsuario
    );
    if (porLegajo) return porLegajo;
  }

  const nombreUsuario = usuario?.nombre;
  if (!nombreKey(nombreUsuario)) return undefined;
  return duplas.find(
    (d) => nombresCoinciden(d.chofer, nombreUsuario) || nombresCoinciden(enganchadorDeDupla(d), nombreUsuario)
  );
}

/**
 * Indica si la dupla de una asignación diaria corresponde al usuario registrado.
 * Prioriza el legajo; si la asignación no tiene legajo (turnos guardados antes de este cambio),
 * recurre a comparar nombres de forma flexible.
 */
export function asignacionCoincideConUsuario(
  asignacion: {
    duplaChofer?: string;
    duplaEnganchador?: string;
    duplaAyudante?: string;
    legajoChofer?: string;
    legajoEnganchador?: string;
  } | null | undefined,
  usuario: { nombre?: string; legajo?: string } | null | undefined
): boolean {
  if (!asignacion) return false;

  const legajoUsuario = legajoKey(usuario?.legajo);
  if (legajoUsuario && (asignacion.legajoChofer || asignacion.legajoEnganchador)) {
    return (
      legajoKey(asignacion.legajoChofer) === legajoUsuario ||
      legajoKey(asignacion.legajoEnganchador) === legajoUsuario
    );
  }

  const nombreUsuario = usuario?.nombre;
  if (!nombreKey(nombreUsuario)) return false;
  return (
    nombresCoinciden(asignacion.duplaChofer, nombreUsuario) ||
    nombresCoinciden(duplaEnganchadorDeAsignacion(asignacion), nombreUsuario)
  );
}

/** Asignación operativa confirmada al inicio del día (grúa y dupla). */
export interface AsignacionDiaria {
  fecha: string; // YYYY-MM-DD (zona Argentina)
  gruaPatente: string;
  gruaDescripcion?: string;
  duplaId: string;
  duplaChofer: string;
  duplaEnganchador: string;
  /** @deprecated Campo legacy en Firestore */
  duplaAyudante?: string;
  /** Legajo del chofer de la dupla asignada (tomado del catálogo al momento de guardar). */
  legajoChofer?: string;
  /** Legajo del enganchador de la dupla asignada. */
  legajoEnganchador?: string;
  /** Tránsito o transporte según la grúa/dupla del turno. */
  tipoFlota?: TipoFlota;
  /** Inicio del turno (ISO 8601, servidor). Expira a las 8 h. */
  inicioEn?: string;
}

export const DURACION_TURNO_MS = 8 * 60 * 60 * 1000;

export function asignacionCompleta(asignacion: AsignacionDiaria): boolean {
  return !!(
    asignacion.gruaPatente?.trim() &&
    asignacion.duplaChofer?.trim() &&
    asignacion.duplaEnganchador?.trim()
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
  /** @deprecated Usar `roles`. Será eliminado tras migración 08. */
  rol?: RolUsuario;
  roles: RolUsuario[];
  /** Número de legajo del enganchador (obligatorio para rol ENGANCHADOR) */
  legajo?: string;
  servicioActivoId: string | null;
  /** Snapshot del servicio activo; mantenido por Cloud Functions. */
  servicioActivoResumen?: ServicioActivoResumen | null;
  activo?: boolean;
  asignacionDiaria?: AsignacionDiaria;
  fcmTokens?: string[];
}

export interface DuplasServicio {
  chofer: string;
  enganchador: string;
  duplaId?: string;
  legajoChofer?: string;
  legajoEnganchador?: string;
  uidChofer?: string;
  uidEnganchador?: string;
  /** @deprecated Campo legacy en actas guardadas */
  ayudante?: string;
  /** @deprecated Campo legacy en actas guardadas */
  inspector?: string;
}

export interface Evento {
  id?: string;
  tipo: TipoEvento;
  timestamp: any; // Firestore Timestamp or string
  geo?: GeoPoint;
  fotos?: Foto[];
  observacionGeneral?: string;
  corralon?: string;
  /** Dirección en texto libre o URL de Maps cuando no hay geo resuelta. */
  ubicacionReferencia?: string;
}

export interface Servicio {
  id: string;
  patente: string;
  numeroInfraccion?: string;
  identificadorCompuesto: string; // `{numeroInfraccion}-{legajo}-{patente}` — también ID del documento
  estado: EstadoServicio;
  grua: string;          // id de grúa `G-{patente}`
  gruaDocId?: string;    // doc ID real en colección gruas (retrocompat)
  corralon?: string;     // nombre del corralón (snapshot de display)
  corralonId?: string;   // doc ID real en colección corralones (retrocompat)
  creadoPor: string;     // uid del enganchador
  legajoChofer?: string; // legajo al momento del enganche
  /** Tránsito o transporte al momento del enganche. */
  tipoFlota?: TipoFlota;
  dupla: DuplasServicio;
  /** GPS capturado al iniciar el enganche (origen del traslado). */
  geoEnganche?: GeoPoint;
  creadoEn?: any;     // Firestore Timestamp
  /** @deprecated Usar `creadoEn`. Será eliminado tras migración 08. */
  fechaCreacion?: any;
  /** Momento en que se confirmó el desenganche (cierre del acta). */
  finalizadoEn?: unknown;
  motivoAnulacion?: string | null;
  anuladoPor?: string;
  anuladoEn?: unknown;
  /** Acta cargada manualmente por admin/supervisor (respaldo operativo). */
  origenManual?: boolean;
  /** Cantidad de revisiones registradas (ediciones, anulaciones, etc.). */
  versionCount?: number;
  /** Total de fotos en eventos (denormalizado para listados). */
  totalFotos?: number;
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
  /** ID de dupla del catálogo. Vacío si la combinación chofer+enganchador es ad-hoc. */
  duplaId: string;
  duplaChofer: string;
  duplaEnganchador: string;
  /** @deprecated Payload legacy */
  duplaAyudante?: string;
  /** Legajo del chofer (enviado por frontend cuando la dupla es ad-hoc). */
  legajoChofer?: string;
  /** Legajo del enganchador (enviado por frontend cuando la dupla es ad-hoc). */
  legajoEnganchador?: string;
  tipoFlota?: TipoFlota;
}

// Payloads para Firebase Functions
export interface IniciarEnganchePayload {
  patente: string;
  numeroInfraccion?: string;
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
  numeroInfraccion?: string;
  grua: string;
  corralon?: string | null;
  dupla: DuplasServicio;
  tipoFlota?: TipoFlota;
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
  numeroInfraccion?: string;
  grua: string;
  dupla: DuplasServicio;
  legajoEnganchador: string;
  corralon?: string | null;
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

// ── Carnets de conducir ──────────────────────────────────────

export interface CarnetDeConducir {
  id: string;
  numero: number;
  nombre: string;
  legajo: string;
  fechaVencimiento: string;
  activo: boolean;
}

export type CarnetEstadoVencimiento =
  | 'VIGENTE'
  | 'POR_VENCER_30D'
  | 'POR_VENCER_15D'
  | 'POR_VENCER_7D'
  | 'VENCIDO';

export function diasParaVencimiento(fechaVencimiento: string, ahora?: Date): number {
  const hoy = ahora ?? new Date();
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const diffMs = venc.getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.floor(diffMs / 86_400_000);
}

export function calcularEstadoCarnet(fechaVencimiento: string, ahora?: Date): CarnetEstadoVencimiento {
  const dias = diasParaVencimiento(fechaVencimiento, ahora);
  if (dias <= 0) return 'VENCIDO';
  if (dias <= 7) return 'POR_VENCER_7D';
  if (dias <= 15) return 'POR_VENCER_15D';
  if (dias <= 30) return 'POR_VENCER_30D';
  return 'VIGENTE';
}
