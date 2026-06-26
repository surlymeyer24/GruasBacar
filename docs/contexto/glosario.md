# Glosario y entidades

---

## Términos del dominio

- **Enganche** → Acto de enganchar un auto mal estacionado con la grúa. Es el inicio de un servicio. Incluye carga de datos (patente, infracción, dupla) + flujo guiado de 4-5 fotos. No es "remolque" ni "arrastre" — en BACAR se dice *enganche*.
- **Desenganche** → Acto de soltar el auto en el corralón de destino. Incluye registro de llegada + fotos del vehículo en el corralón. Cierra el servicio.
- **Traslado** → Etapa intermedia entre enganche y desenganche. El auto está siendo trasladado al corralón. No tiene acción del chofer más que esperar y presionar "Desenganche" al llegar.
- **Servicio** → Unidad central del sistema. Representa un enganche completo de principio a fin: nace con un enganche, pasa por traslado, y termina con un desenganche confirmado (o se anula). Un servicio = un auto enganchado.
- **Dupla** → Par de personas operativas asignadas a una grúa: un chofer y un ayudante. La dupla no es un usuario del sistema — es un registro de configuración. El usuario del sistema es el *enganchador*.
- **Inspector (de tránsito)** → Funcionario municipal que labra la infracción y autoriza el enganche. No es usuario del sistema. Solo se guarda su nombre como dato del servicio. Está presente en el lugar del enganche pero no usa la app.
- **Enganchador** → Operador de campo que usa la app. Es quien ejecuta el enganche, saca las fotos, y opera el flujo completo. Antes se llamaba "chofer" en el sistema. Es el usuario activo en el celular durante la operación.
- **Corralón** → Depósito municipal donde se llevan los autos enganchados. Es el destino del traslado. El chofer selecciona a cuál corralón llegó al momento del desenganche.
- **Acta (de infracción)** → Documento físico que labra el inspector de tránsito. Tiene un número de infracción único. Es el origen del servicio en el mundo real. El sistema lo referencia como `numeroInfraccion`.
- **Patente** → Dominio/placa del auto enganchado. Formato argentino viejo (`AAA123`) o Mercosur (`AA123AA`). Se valida en el backend. Junto con el número de infracción forma el identificador compuesto.
- **Identificador compuesto** → Clave de unicidad de un servicio: `{patente}__{numeroInfraccion}`. Previene que se cree dos veces el mismo servicio por error de carga. Se valida antes de confirmar el enganche.
- **Legajo** → Número de identificación interna del enganchador dentro de BACAR. Obligatorio para usuarios operadores. Se usa como parte de la ruta de carpetas en Google Drive y queda grabado en el servicio al momento del enganche.
- **Asignación diaria** → Configuración que el enganchador carga al inicio de cada turno: qué grúa usa, qué dupla lo acompaña, y quién es el inspector. Tiene TTL de 8 horas. Se autocompleta en cada enganche nuevo para no tener que elegir los mismos datos cada vez.
- **Turno** → Período operativo de 8 horas (`DURACION_TURNO_MS`). Empieza cuando el enganchador guarda su asignación diaria. Cuando vence, la asignación deja de estar vigente y hay que cargar una nueva.
- **Foto guiada** → Flujo forzado de captura de fotos en orden específico: delantera → lado derecho → lado izquierdo → trasera → observación (opcional). Solo desde cámara, sin galería. Aplica en enganche y desenganche.
- **Tipo de flota** → Clasificación operativa de las grúas y duplas: `TRANSITO` (tránsito municipal) o `TRANSPORTE`. Determina el contexto operativo del servicio. Se hereda de la grúa asignada.
- **Servicio activo** → El servicio que un enganchador tiene abierto en este momento. Solo puede tener uno a la vez (`servicioActivoId` en su documento de usuario). Bloquea la creación de nuevos servicios hasta que se cierre o anule el actual.
- **Anulación** → Cancelación de un servicio. Los operadores pueden anular en estados `ENGANCHADO` o `EN_TRASLADO`. Los admins y supervisores pueden anular en cualquier estado anulable (incluido `DESENGANCHADO`). El servicio anulado queda visible en historial con motivo. No hay borrado físico del documento.
- **Supervisor** → Rol de solo lectura operativa con capacidad de auditoría. Monitorea la flota desde un dashboard, consulta el historial completo de actas y puede editar o anular actas. No opera enganches ni accede a la configuración de flota.
- **Borrador de fotos** → Caché local en IndexedDB (`fotoCache.service.ts`) que persiste las fotos capturadas durante enganche/desenganche antes de confirmarlas. Sobrevive recargas accidentales de la página. Se limpia al confirmar en servidor (enganche) o al cerrar el desenganche.

---

## Entidades principales

### Servicio (`servicios/`)
Unidad central. Representa un auto enganchado desde el momento de la infracción hasta la entrega en el corralón.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string (auto) | ID generado por Firestore |
| `patente` | string | Dominio del auto enganchado (normalizado a mayúsculas) |
| `numeroInfraccion` | string | Número del acta labrada por el inspector |
| `identificadorCompuesto` | string | `{patente}__{numeroInfraccion}` — clave de unicidad |
| `estado` | `EstadoServicio` | `ENGANCHADO` → `EN_TRASLADO` → `DESENGANCHADO` o `ANULADO` |
| `grua` | string | Patente de la grúa asignada |
| `corralon` | string? | Nombre del corralón (se carga al registrar llegada) |
| `encargadoDeposito` | string? | Nombre del encargado del depósito al llegar |
| `creadoPor` | string | UID del enganchador que inició el servicio |
| `legajoChofer` | string? | Legajo del enganchador al momento del enganche |
| `tipoFlota` | `TipoFlota`? | `TRANSITO` o `TRANSPORTE` |
| `dupla` | `DuplasServicio` | `{ chofer, ayudante, inspector }` — snapshot al momento del enganche |
| `creadoEn` | Timestamp | Timestamp de servidor al crear el servicio |
| `finalizadoEn` | Timestamp? | Timestamp de servidor al confirmar desenganche |
| `motivoAnulacion` | string? | Razón de anulación (si fue anulado) |
| `anuladoPor` | string? | UID de quien anuló |
| `anuladoEn` | Timestamp? | Timestamp de servidor de la anulación |

**Relaciones:** Tiene N eventos (subcolección). Creado por un usuario. Referencia una grúa (por patente), un corralón (por nombre), y una dupla (snapshot de nombres).

---

### Evento (`servicios/{id}/eventos/`)
Registro inmutable de cada transición en el ciclo de vida del servicio. Cada evento tiene un timestamp de servidor.

| Campo | Tipo | Descripción |
|---|---|---|
| `tipo` | `TipoEvento` | `ENGANCHE`, `TRASLADO`, `LLEGADA_CORRALON`, `DESENGANCHE` |
| `timestamp` | Timestamp | Generado por servidor — nunca por el cliente |
| `geo` | `GeoPoint`? | `{ lat, lng }` — ubicación en enganche y llegada al corralón |
| `fotos` | `Foto[]`? | Array de fotos con URL de Drive, etiqueta y observación |
| `observacionGeneral` | string? | Nota libre del enganchador |
| `corralon` | string? | Solo en `LLEGADA_CORRALON` |
| `encargadoDeposito` | string? | Solo en `LLEGADA_CORRALON` |

**Tipos de evento y qué contienen:**
- `ENGANCHE` → geo + 4-5 fotos + observaciones
- `TRASLADO` → solo timestamp (marca la salida hacia el corralón)
- `LLEGADA_CORRALON` → geo + corralón seleccionado + encargado del depósito
- `DESENGANCHE` → 4-5 fotos + observación general

---

### Usuario (`usuarios/`)
Persona registrada en el sistema. Puede ser admin, supervisor, enganchador, o combinar roles (ej. admin + enganchador).

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID de Firebase Auth |
| `nombre` | string | Nombre completo |
| `email` | string? | Email de login |
| `roles` | `RolUsuario[]` | Array de roles: `ADMIN`, `SUPERVISOR`, `ENGANCHADOR`, `CHOFER` |
| `rol` | `RolUsuario`? | ⚠️ Legacy — campo singular, deprecated a favor de `roles[]` |
| `legajo` | string? | Número de legajo (obligatorio para operadores) |
| `servicioActivoId` | string \| null | ID del servicio abierto actualmente, o `null` |
| `activo` | boolean? | Si la cuenta está habilitada |
| `asignacionDiaria` | `AsignacionDiaria`? | Turno actual: grúa, dupla, inspector, con TTL 8h |

**Relaciones:** Crea servicios (`creadoPor`). Tiene un servicio activo a la vez.

---

### Grúa (`gruas/`)
Vehículo de BACAR para hacer enganches.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de Firestore |
| `patente` | string | Dominio de la grúa |
| `descripcion` | string | Nombre o descripción de la grúa |
| `activa` | boolean | Si está disponible para asignación |
| `tipo` | `TipoFlota`? | `TRANSITO` o `TRANSPORTE` (default: `TRANSITO`) |

---

### Corralón (`corralones/`)
Depósito municipal donde se llevan los autos enganchados.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de Firestore |
| `nombre` | string | Nombre del corralón |
| `direccion` | string | Dirección física |
| `activo` | boolean | Si está disponible para selección |
| `lat` | number? | Latitud (para geo) |
| `lng` | number? | Longitud (para geo) |

---

### Dupla (`duplas/`)
Par operativo de chofer + ayudante. Es un registro de configuración, no un usuario del sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de Firestore |
| `chofer` | string | Nombre del chofer de la dupla |
| `ayudante` | string | Nombre del ayudante |
| `tipo` | `TipoFlota`? | `TRANSITO` o `TRANSPORTE` (default: `TRANSITO`) |

---

### Foto (embebida en Evento)
Imagen capturada durante enganche o desenganche. Se almacena en Google Drive.

| Campo | Tipo | Descripción |
|---|---|---|
| `url` | string | URL de visualización en Google Drive |
| `driveFileId` | string? | ID del archivo en Google Drive |
| `etiqueta` | `EtiquetaFoto` | `DELANTERA`, `LADO_DERECHO`, `LADO_IZQUIERDO`, `TRASERA`, `OBSERVACION` |
| `observacion` | string? | Nota opcional sobre la foto |

---

### Asignación Diaria (embebida en Usuario)
Configuración de turno del enganchador. Se carga una vez al inicio del día.

| Campo | Tipo | Descripción |
|---|---|---|
| `fecha` | string | `YYYY-MM-DD` en zona Argentina |
| `gruaPatente` | string | Patente de la grúa asignada |
| `duplaId` | string | ID de la dupla asignada |
| `duplaChofer` | string | Nombre del chofer (snapshot) |
| `duplaAyudante` | string | Nombre del ayudante (snapshot) |
| `inspector` | string | Nombre del inspector de tránsito |
| `tipoFlota` | `TipoFlota`? | Tipo de flota del turno |
| `inicioEn` | string? | ISO 8601, hora de inicio del turno. Expira a las 8h. |

---

## Estados de un servicio

```
ENGANCHADO → EN_TRASLADO → DESENGANCHADO
     ↓               ↓
  ANULADO         ANULADO
```

| Estado | Significado | Quién lo activa |
|---|---|---|
| `ENGANCHADO` | El auto fue enganchado. Se cargaron datos y fotos. | Enganchador (al iniciar) |
| `EN_TRASLADO` | La grúa salió hacia el corralón. | Enganchador (al presionar "Traslado") |
| `DESENGANCHADO` | El auto fue entregado en el corralón. Servicio cerrado. | Enganchador (al confirmar desenganche) |
| `ANULADO` | El servicio fue cancelado. Queda visible con motivo. | Admin, supervisor u operador (según estado) |

---

## Roles de usuario

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| `ADMIN` | Administrador de BACAR | ABM de grúas, corralones, duplas, usuarios. Dashboard admin. Ver y gestionar todas las actas (editar, anular). |
| `SUPERVISOR` | Supervisor de flota | Dashboard de supervisión (monitoreo en vivo). Historial completo de actas. Editar y anular actas. Sin acceso a configuración ni flujo operativo. |
| `ENGANCHADOR` | Operador de campo | Ejecutar el flujo completo de enganche/traslado/desenganche. Ver sus propios servicios en historial. |
| `CHOFER` | ⚠️ Legacy, equivalente a `ENGANCHADOR` | Mismo que `ENGANCHADOR`. Existe por retrocompatibilidad con documentos viejos. `esOperador()` los trata como iguales. |

Un usuario puede tener **múltiples roles** (ej: `['ADMIN', 'ENGANCHADOR']`). La ruta de inicio post-login la define `rutaInicioPorRoles()`: operador → `/`, admin → `/admin-dashboard`, supervisor → `/supervisor-dashboard`.

### Helpers de permisos (`shared/src/types.ts`)

| Función | Descripción |
|---|---|
| `esOperador(roles)` | `ENGANCHADOR` o `CHOFER` |
| `esSupervisor(roles)` | Tiene rol `SUPERVISOR` |
| `esSoloSupervisor(roles)` | Solo `SUPERVISOR`, sin admin ni operador |
| `puedeVerHistorialCompleto(roles)` | `ADMIN` o `SUPERVISOR` — ve todas las actas |
| `puedeGestionarActas(roles)` | `ADMIN` o `SUPERVISOR` — editar y anular actas |
| `rutaInicioPorRoles(roles)` | Home según rol |
| `esRutaSupervisor(pathname)` | Rutas permitidas para supervisor: `/supervisor-dashboard`, `/historial` |

---

## Siglas y nombres internos

- **BACAR** → Empresa de grúas para la que se construye el sistema. No es sigla del código — es el nombre del cliente.
- **`@gruasbacar/shared`** → Alias de workspace npm para el paquete `shared/`. Contiene tipos, interfaces, y funciones puras compartidas entre frontend y functions.
- **`isMock`** → Flag booleano global en `frontend/src/firebase.ts`. Cuando es `true`, el frontend usa datos simulados en `localStorage` en vez de Firebase real. Actualmente fijo en `false`.
- **`servicioActivoId`** → Campo en el documento del usuario que apunta al servicio que tiene abierto. `null` = libre para iniciar uno nuevo. Actúa como lock de concurrencia.
- **`identificadorCompuesto`** → Campo en el servicio: `{patente}__{numeroInfraccion}`. Se usa para validar unicidad y prevenir duplicados.
- **`geoEnganche`** → Coordenadas GPS capturadas automáticamente al momento del enganche. Se guarda en el servicio y en el evento.
- **`creadoEn` / `fechaCreacion`** → Timestamp de creación del servicio. `creadoEn` es el campo oficial (Firestore server timestamp). `fechaCreacion` es un alias legacy que existe en datos de mock/simulación.
- **`finalizadoEn`** → Timestamp de servidor que marca el cierre del servicio (confirmación de desenganche).
- **`DURACION_TURNO_MS`** → Constante: `8 * 60 * 60 * 1000` (8 horas en milisegundos). TTL de una asignación diaria.
- **`HttpsError`** → Clase de Firebase Functions para lanzar errores tipados al cliente. Códigos comunes en el proyecto: `unauthenticated`, `permission-denied`, `not-found`, `failed-precondition`, `already-exists`, `invalid-argument`.
- **`onCall`** → API de Firebase Functions v2 para definir Callable Functions. Toda la comunicación backend del proyecto usa este patrón.
- **`verificarAuth` / `verificarAdmin` / `verificarGestionActas` / `verificarOperador`** → Middleware de auth en functions. `verificarGestionActas` valida admin o supervisor (editar/anular actas).
- **ABM** → Alta-Baja-Modificación. Término argentino para CRUD. Se usa en las pantallas de admin: `GruasCRUD`, `CorralonesCRUD`, etc.
- **`fotosOpcionalesEnDev()`** → Flag de desarrollo en functions (`FOTOS_OPCIONALES_DEV=true`). Permite registrar eventos sin fotos cuando Google Drive no está configurado. Solo para desarrollo local.
- **Ruta de fotos en Drive** → Estructura: `Gruas/{YYYY-MM-DD}/{legajo}/{patente}_{infraccion}/{enganche|desenganche}/{nombre_foto}.jpg`
