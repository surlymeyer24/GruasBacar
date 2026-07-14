# Cambios Pre-Despliegue Piloto

Fecha: 30 de junio de 2026
Commits: `2b8a331` y `f2a6656` sobre `dev`

---

## Resumen

Auditoría completa del proyecto y resolución de hallazgos críticos de seguridad, estabilidad y UX antes del despliegue piloto.

---

## Hallazgos Críticos Resueltos

### 1. Error Boundary Global

**Problema:** Si un componente de React lanzaba un error no capturado, la app entera se quedaba en blanco sin feedback al usuario.

**Solución:**
- Creado `frontend/src/components/shared/ErrorBoundary.tsx` — componente class-based con `componentDidCatch` que muestra pantalla de error amigable con botón "Recargar aplicación"
- Envuelto el árbol completo de `App.tsx` dentro de `<ErrorBoundary>`

**Archivos:**
- `frontend/src/components/shared/ErrorBoundary.tsx` (nuevo)
- `frontend/src/App.tsx` (modificado)

---

### 2. Registro de Cuentas Restringido a Administradores

**Problema:** La Cloud Function `registrarCuenta` no validaba autenticación. Cualquier persona podía crear cuentas con rol ENGANCHADOR.

**Decisión:** Solo administradores pueden crear cuentas (el panel admin ya tenía `crearUsuario` con validación).

**Solución:**
- Agregado `verificarAdmin(request.auth)` en `registrarCuenta` (`functions/src/index.ts`)
- Eliminado el formulario de registro público de `LoginPage.tsx` (campos nombre, legajo, repetir contraseña, toggle signup/login)
- Reemplazado el botón "Crear Cuenta" por el texto "¿Necesita una cuenta? Contacte al administrador del sistema."

**Archivos:**
- `functions/src/index.ts` (modificado)
- `frontend/src/pages/LoginPage.tsx` (modificado)

---

### 3. Drive Service Account — Fail Fast

**Problema:** `drive.service.ts` tenía un email de service account hardcodeado (`231607744664-compute@developer.gserviceaccount.com`) como fallback silencioso en `getServiceAccountEmail()`. En producción ese email no tiene permisos sobre el Drive compartido, causando fallos difíciles de diagnosticar.

**Solución:**
- Eliminado el fallback silencioso
- Agregada cadena de resolución: `GoogleAuth` → variable de entorno `GOOGLE_SERVICE_ACCOUNT_EMAIL` → error explícito con mensaje descriptivo
- `SA_EMAIL_FALLBACK` se mantiene solo para mensajes informativos en errores (instrucciones al admin)

**Archivos:**
- `functions/src/services/drive.service.ts` (modificado)

---

### 4. Detección de Errores de Red

**Problema:** Cuando el operador perdía conexión a internet, la app mostraba mensajes genéricos como "No se pudo confirmar el enganche" sin indicar que el problema era la conectividad.

**Solución:**
- Agregada función `esErrorDeRed()` en `firebaseError.ts` que detecta:
  - `functions/unavailable` y `functions/deadline-exceeded` (Firebase)
  - `TypeError: Failed to fetch` (navegador sin red)
  - Mensajes con "network", "err_internet" (errores del navegador)
- Cuando se detecta error de red, se muestra: "Sin conexión a internet. Verificá tu señal e intentá de nuevo."
- Los formularios y fotos no se pierden al fallar — el operador puede reintentar cuando recupere señal

**Archivos:**
- `frontend/src/utils/firebaseError.ts` (modificado)

---

## Hallazgo Descartado

### Debounce en Botones de Acción

La auditoría lo marcó como crítico pero al verificar, **todas las páginas con operaciones async ya tienen protección**:

| Página | Variable de estado | Botón deshabilitado |
|--------|-------------------|---------------------|
| EnganchePage | `loadingAction` | Si |
| DesenganchePage | `isFinishing` | Si |
| NuevaActaManualPage | `submitting` | Si |
| LoginPage | `submitting` | Si |
| ConfiguracionDiaModal | `saving` | Si |
| FotoLoteUpload | `isUploading` | Si |

TrasladoPage solo tiene un botón de navegación (no llama Cloud Functions), no necesita debounce.

---

## Otros Archivos Incluidos en el Commit

Estos archivos ya existían como cambios pendientes y fueron incluidos en el commit de hardening:

- `frontend/public/apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png` — Iconos PWA
- `frontend/src/components/admin/AdminTurnosPanel.tsx` — Panel de administración de turnos (nuevo)
- `frontend/src/pages/TurnosPage.tsx` — Página de turnos (nueva)
- `scripts/ensure-deps.mjs` — Script de verificación de dependencias (nuevo)
- `frontend/vite.config.ts` — Configuración PWA y build
- `frontend/index.html` — Meta tags para PWA (apple-mobile-web-app-capable, theme-color)
- `shared/src/types.ts` — Tipos compartidos
- `frontend/src/services/adminCatalog.cache.ts` y `adminServicios.cache.ts` — Caché de catálogos
- `package.json` y `package-lock.json` — Dependencias actualizadas

---

## Estado de la PWA

La PWA está lista para producción:

- Manifest completo (nombre, iconos 192x192 y 512x512, standalone, theme-color)
- Service Worker con Workbox (cachea assets estáticos y Google Fonts)
- Meta tags de Apple configurados (apple-mobile-web-app-capable, status-bar-style)
- Permisos: cámara y geolocalización habilitadas solo para mismo origen

**Nota:** No se cachean respuestas de Firestore offline. La persistencia offline de Firestore no está habilitada (mejora para post-piloto).

---

### 5. Límites de Longitud en Campos de Texto (Backend)

**Problema:** Los campos de texto libre no tenían límite de longitud en el backend. Un usuario malicioso o un error de frontend podía enviar strings de tamaño arbitrario.

**Solución:**
- `validarString()` ahora acepta un parámetro opcional `maxLength`
- Nueva función `validarStringOpcional()` para campos opcionales con límite
- `parseUbicacionInput()` valida longitud máxima de 500 caracteres
- Límites aplicados en todos los servicios:

| Campo | Límite | Servicios afectados |
|-------|--------|---------------------|
| numeroInfraccion | 50 | iniciarEnganche, crearActaManual |
| grua / gruaPatente | 20 | iniciarEnganche, actualizarServicio, guardarAsignacionDiaria |
| chofer / duplaChofer | 100 | iniciarEnganche, actualizarServicio, guardarAsignacionDiaria |
| enganchador / duplaEnganchador | 100 | iniciarEnganche, actualizarServicio, guardarAsignacionDiaria |
| inspector | 100 | iniciarEnganche, actualizarServicio, guardarAsignacionDiaria |
| corralon | 200 | registrarLlegadaCorralon, actualizarServicio, crearActaManual |
| encargadoDeposito | 100 | registrarLlegadaCorralon, crearActaManual |
| observacionGeneral | 1000 | registrarEventoEnganche, confirmarDesenganche, crearActaManual |
| motivo (anulación) | 500 | anularServicio |
| legajoEnganchador | 50 | crearActaManual |
| ubicación (enganche/llegada) | 500 | crearActaManual (parseUbicacionInput) |
| nombre (usuario) | 100 | crearUsuario, registrarCuenta, actualizarUsuario |
| legajo (usuario) | 50 | crearUsuario, registrarCuenta, actualizarUsuario |

**Archivos:**
- `functions/src/utils/validators.ts` (modificado)
- `functions/src/services/servicio.service.ts` (modificado)
- `functions/src/services/usuario.service.ts` (modificado)

---

## Resultados de la Auditoría General

| Categoría | Puntaje | Notas |
|-----------|---------|-------|
| Auth y RBAC | 9/10 | Roles bien implementados, registro ahora restringido |
| Validación de datos | 10/10 | Validators completos + límites de longitud en todos los campos |
| Manejo de errores | 8/10 | Mejorado con Error Boundary + detección de red |
| Reglas Firestore | 10/10 | Defensa en profundidad excelente |
| Máquina de estados | 10/10 | Flujo enganche-traslado-desenganche sin bugs |
| Config de deploy | 9/10 | Firebase completo, predeploy robusto |
| Testing | 1/10 | Sin tests (riesgo para post-piloto) |
| Performance | 6/10 | Sin lazy loading ni paginación en historial |

---

## Mejoras Recomendadas Post-Piloto

1. **Tests** — Unit tests para validators y máquina de estados; E2E para flujo completo
2. **CI/CD** — GitHub Actions para build + deploy automático
3. **Lazy loading** — `React.lazy()` en rutas para reducir bundle inicial
4. **Paginación** — HistorialPage carga todos los servicios de una vez
5. **Monitoreo** — Integración con Sentry o similar para tracking de errores
6. **Persistencia offline Firestore** — `enableIndexedDbPersistence()` para datos offline
7. **Timeout de sesión** — Logout automático por inactividad (30 min)

---

# Cambios del 2 de julio de 2026 (pendientes de commit)

Changeset grande sobre `dev` (~64 archivos, +1302/−1034) con ajustes operativos previos al arranque del piloto.

## Rol SUPERADMIN

- Nuevo rol `SUPERADMIN` por encima de `ADMIN` — hereda todos sus permisos vía `esAdmin()` y agrega gestión de admins, configuración y auditoría.
- Solo un SUPERADMIN puede asignar el rol SUPERADMIN (`crearUsuario`/`actualizarUsuario` validan `callerRoles`).
- Migrados a `esAdmin()`: middleware de functions, `RoleGuard`, `firestore.rules` (`isAdmin()`).

## Auto-generación del número de acta

- `generarNumeroActa()`: contador atómico en `contadores/actas` (transacción Firestore, 6 dígitos). Usado por `iniciarEnganche` y `crearActaManual`.
- El operador ya no tipea el número de infracción. `numeroInfraccion` pasó a opcional en tipos y payloads.
- Identificador compuesto nuevo: `{infraccion}-{legajo}-{patente}` (fallback `{legajo}-{patente}`), usado como ID del documento. `sanitizeIdentificadorPart()` remueve `/`.

## Eliminación de inspector y encargado de depósito

- `inspector` eliminado de asignación diaria, enganche, formularios y validaciones. `encargadoDeposito` eliminado de llegada al corralón y acta manual.
- Quedan como campos legacy `@deprecated` para leer actas viejas. `diffEdicionServicio()` y `eventosParaVistaActa()` ya no los comparan/propagan.

## Duplas: chofer + enganchador, vínculo por legajo

- `Dupla` pasa de `{chofer, ayudante}` a `{chofer, enganchador}` (+ `legajoChofer`, `legajoEnganchador`, `gruaId`, `orden`). Helper de compatibilidad: `enganchadorDeDupla()`.
- La asignación diaria captura los legajos del catálogo al guardarse. `asignacionCoincideConUsuario()` (legajo primero, nombres fallback) permite que la Home avise si el turno cargado no corresponde al usuario.

## Patente S/N

- Se aceptan vehículos sin patente legible con el valor canónico `S/N` (`PATENTE_SIN_NUMERO`, `normalizarPatenteInput()`, `esPatenteSinNumero()`).

## Nueva página: Mis Actas (`/mis-actas`)

- Historial personal del operador (rol ENGANCHADOR): actas propias sin anuladas, búsqueda por patente/grúa, detalle con eventos, ubicaciones y galerías de fotos de Drive.

## Manejo de errores centralizado en Cloud Functions

- Nuevo `functions/src/utils/callableHandler.ts` con `withHttpsErrorHandling(nombreOperacion, handler)`. Todos los `onCall` de `index.ts` quedan envueltos: los `HttpsError` pasan tal cual y cualquier otro error se loguea y se re-lanza como `HttpsError('internal', 'Error inesperado en {operacion}: {detalle}')`.
- En frontend, `servicio.service.ts` agrega try-catch con `getFirebaseErrorMessage()` en las operaciones principales.

## Scripts de operaciones

- `scripts/pull-prod.mjs` (`npm run pull-prod`) — clona datos de producción (colecciones + subcolecciones + usuarios de Auth con password de prueba) a los emuladores.
- `scripts/cargar-nuevas-duplas.mjs` — carga batch de usuarios y duplas con validación de legajos únicos, `--emulator` y `--dry-run`.

## Otros

- Nuevo modo `npm run dev:live` (Vite `--mode live` + `frontend/.env.live`) para desarrollar contra Firebase real sin tocar `.env.local`.
- Fotos adicionales por evento: el enganchador puede agregar hasta 3 fotos extra además de las 4 guiadas obligatorias (`validarLoteFotos(fotos, fotosBase64, 3)` — antes el máximo era 1 adicional).
- Home saluda con el primer nombre (`primerNombre()`).
- Workbox: `maximumFileSizeToCacheInBytes` = 5 MB. TypeScript de functions actualizado a `^5.9.3`.
- Textos de UI: "secuestro" reemplazado por "servicio" en manifest y pantallas.
