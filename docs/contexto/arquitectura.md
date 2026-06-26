# Arquitectura

## En una frase

Sistema web mobile-first para registrar y controlar el ciclo de vida de enganches de autos mal estacionados por las gruas de BACAR, midiendo tiempos de cada etapa (enganche, traslado, desenganche).

## Stack

- **Lenguaje / runtime:** TypeScript (frontend y backend)
- **Frontend:** React 18 + Vite + Tailwind CSS v4 (SPA mobile-first)
- **Backend:** Firebase Functions (Cloud Functions for Firebase)
- **Base de datos:** Firestore (datos estructurados)
- **Autenticacion:** Firebase Auth (email/password, roles `ADMIN`, `SUPERVISOR`, `ENGANCHADOR` y `CHOFER`)
- **Almacenamiento de fotos:** Google Drive API via Service Account (archivo definitivo). Firebase Storage como buffer temporal de subida desde móvil (jun 2025).
- **Hosting:** Firebase Hosting
- **Paquete compartido:** `shared/` con tipos TypeScript usados por frontend y functions

## Mapa de carpetas

- `shared/src/` → Tipos e interfaces compartidos entre frontend y backend (`Servicio`, `Evento`, `Usuario`, `Grua`, `Corralon`, `Dupla`)
- `functions/src/` → Firebase Functions: logica de negocio, servicios, middleware de auth, validaciones
- `functions/src/services/` → Logica core: `servicio.service.ts` (enganche, traslado, desenganche, anulacion), `usuario.service.ts`
- `frontend/src/pages/` → Paginas: Login, Home, Enganche, Traslado, Desenganche, Historial, AdminDashboard, SupervisorDashboard, Admin
- `frontend/src/components/` → Componentes agrupados por dominio: `auth/`, `enganche/`, `traslado/`, `desenganche/`, `admin/`, `shared/`
- `frontend/src/hooks/` → Hooks custom: `useAuth`, `useServicioActivo` (listener real-time), `useCamera`, `useGeolocation`, `useAdminCatalog`
- `frontend/src/services/` → Servicios frontend que llaman a Firebase Functions y Firestore directamente para CRUDs. Incluye `fotoCache.service.ts` (borrador IndexedDB), `fotoStorage.service.ts` (upload resumible + listener staging).
- `frontend/src/context/` → `AuthContext` (estado global de autenticacion)

## Flujo de datos

1. El enganchador se autentica con Firebase Auth. `AuthContext` mantiene el estado de sesion y roles.
2. Al inicio del turno, el enganchador carga su asignacion diaria (grua, dupla, inspector). Se guarda en `usuarios/{uid}.asignacionDiaria` con TTL de 8 horas.
3. Al iniciar un enganche, el frontend llama a una Firebase Function (`iniciarEnganche`) que valida unicidad del identificador compuesto (patente + numero de infraccion), crea el documento `Servicio` en Firestore y setea `servicioActivoId` en el documento del usuario.
4. Las fotos se capturan con la camara del dispositivo, se comprimen en el cliente (canvas resize, JPEG ~0.55, max 800px), se persisten en borrador local (IndexedDB), se suben via `uploadBytesResumible` a Firebase Storage (`servicios/{id}/{carpeta}/{etiqueta}.jpg`), el trigger `procesarFotoStorage` (us-east1) las mueve a Google Drive y escribe `fotosStaging`; el frontend confirma el evento con URLs. Ver `docs/contexto/subida-fotos-storage.md`.
5. Cada transicion de estado (ENGANCHADO → EN_TRASLADO → DESENGANCHADO) se ejecuta via Firebase Functions que generan timestamps de servidor (no del cliente) y persisten eventos con geo, fotos y observaciones en la subcoleccion `servicios/{id}/eventos`.
6. `useServicioActivo` escucha en tiempo real el servicio abierto del enganchador via Firestore onSnapshot, y redirige automaticamente a la pantalla correspondiente al estado actual.

## Modelo de datos Firestore

| Coleccion | Campos clave | Notas |
|---|---|---|
| `servicios` | id (auto), patente, numeroInfraccion, identificadorCompuesto, estado, grua, corralon, creadoPor, legajoChofer, tipoFlota, dupla: {chofer, ayudante, inspector} | estado: ENGANCHADO \| EN_TRASLADO \| DESENGANCHADO \| ANULADO |
| `servicios/{id}/eventos` | tipo, timestamp (server), geo: {lat,lng}, fotos: [{url, driveFileId, etiqueta, observacion}], observacionGeneral, corralon, encargadoDeposito | tipo: ENGANCHE \| TRASLADO \| LLEGADA_CORRALON \| DESENGANCHE |
| `servicios/{id}/fotosStaging` | carpeta, etiqueta, status, url, driveFileId, error | Temporal: staging Storage→Drive; se limpia al registrar evento |
| `usuarios` | uid, nombre, roles[] (ADMIN\|SUPERVISOR\|ENGANCHADOR\|CHOFER), legajo, servicioActivoId, asignacionDiaria | roles[] reemplaza al legacy rol singular. Supervisor puede listar usuarios (lectura) para el dashboard |
| `gruas` | id, patente, descripcion, activa, tipo (TRANSITO\|TRANSPORTE) | |
| `corralones` | id, nombre, direccion, activo, lat, lng | |
| `duplas` | id, chofer, ayudante, tipo (TRANSITO\|TRANSPORTE) | |

### Estados y transiciones

```
ENGANCHADO → EN_TRASLADO → DESENGANCHADO
     ↓               ↓
  ANULADO         ANULADO
```

Operadores pueden anular en estados ENGANCHADO y EN_TRASLADO. Admins y supervisores pueden anular en cualquier estado anulable (incluido DESENGANCHADO).

## Rutas principales (HashRouter)

| Ruta | Rol requerido | Descripción |
|---|---|---|
| `/` | Operador | Home operador |
| `/enganche`, `/traslado`, `/desenganche` | Operador | Flujo de campo |
| `/admin-dashboard` | Admin | Dashboard de administración |
| `/supervisor-dashboard` | Supervisor | Dashboard de supervisión (monitoreo) |
| `/historial` | Autenticado | Historial de actas (completo para admin/supervisor, propio para operador) |
| `/admin` | Admin | Configuración de flota y usuarios |

El supervisor solo puede navegar entre `/supervisor-dashboard` y `/historial`. Cualquier otra ruta lo redirige a su home.

## Permisos de gestión de actas

| Acción | Callable Function | Quién puede |
|---|---|---|
| Editar datos del acta | `actualizarServicio` | Admin, supervisor (`verificarGestionActas`) |
| Anular acta | `anularServicio` | Operador (propias, estados tempranos), admin y supervisor (cualquiera, incl. entregadas) |

La edición y anulación desde el historial están en `HistorialPage.tsx` (modal de detalle). No hay borrado físico de documentos en Firestore.

## Lo que NO existe (y no hay que crear)

- **Firebase Storage no es archivo permanente** — solo buffer de subida; Drive es el destino final. Detalle en `subida-fotos-storage.md`.
- **No hay ORM ni capa de abstraccion sobre Firestore** — se usa el SDK directo tanto en functions como en frontend.
- **No hay cache layer de Firestore custom** — Firestore maneja su propio cache offline. Excepción: borrador de fotos en IndexedDB (`fotoCache.service.ts`) para no perder capturas si la página se recarga antes de confirmar.
- **No hay API REST custom** — toda la comunicacion backend es via Firebase Callable Functions.
- **No hay sistema de notificaciones push** — el chofer opera la app activamente durante el servicio.
- **No hay sistema de reportes** — queda para post-MVP.
- **No hay edicion libre de servicios** — un servicio solo avanza de estado o se anula. Admin y supervisor pueden corregir datos (patente, grua, dupla) via `actualizarServicio`, pero no cambiar el estado manualmente.
- **No hay roles mas alla de ADMIN, SUPERVISOR, ENGANCHADOR y CHOFER** — CHOFER es legacy equivalente a ENGANCHADOR. El inspector de transito no es usuario del sistema, solo se guarda su nombre.
