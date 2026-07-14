# Mejoras Post-Piloto — gruasBacar

Documento generado: 30 de junio de 2026
Contexto: Listado priorizado de mejoras a implementar tras la prueba piloto.

---

## Prioridad Alta (Seguridad y Estabilidad)

### 1. Tests Automatizados

**Estado actual:** Sin tests. No hay archivos `.test.ts`, ni configuración de Jest/Vitest.

**Por qué importa:** Sin tests, cada cambio puede romper funcionalidad existente sin que nadie lo note hasta que un operador lo reporte en campo.

**Qué hacer:**
- Configurar Vitest en `frontend/` y Jest en `functions/`
- **Unit tests prioritarios:**
  - `validators.ts` — validarPatente, validarString, validarStringOpcional, validarLoteFotos
  - Máquina de estados del servicio (ENGANCHADO → EN_TRASLADO → DESENGANCHADO | ANULADO)
  - `firebaseError.ts` — esErrorDeRed, getFirebaseErrorMessage
- **Integration tests:**
  - `servicio.service.ts` — flujo completo de enganche a desenganche con Firebase Emulators
  - `usuario.service.ts` — crear, actualizar, desactivar usuario
- **E2E (post-unitarios):**
  - Cypress o Playwright para flujo completo: login → configurar día → enganche → traslado → desenganche

**Esfuerzo estimado:** 2-3 semanas

---

### 2. Rate Limiting

**Estado actual:** Sin límites de frecuencia por usuario. Firebase tiene cuotas globales del proyecto pero no por usuario.

**Por qué importa:** Un usuario autenticado (o un token robado) podría hacer miles de llamadas por minuto, generando costos y datos basura.

**Qué hacer:**
- Opción A (simple): Contador en Firestore por usuario/función con ventana de tiempo (ej: máx 10 llamadas/minuto a `iniciarEnganche`)
- Opción B (robusto): Usar Firebase App Check (ver punto 3) + rate limiting en middleware
- Implementar como middleware reutilizable:
  ```
  verificarRateLimit(uid, 'iniciarEnganche', { maxLlamadas: 10, ventanaSegundos: 60 })
  ```

**Esfuerzo estimado:** 2-3 días

---

### 3. Firebase App Check

**Estado actual:** No configurado. Las Cloud Functions aceptan requests de cualquier cliente que tenga un token de auth válido.

**Por qué importa:** Sin App Check, alguien con un token de autenticación puede llamar a las functions desde Postman, scripts, o cualquier herramienta. App Check verifica que la request venga de tu app real.

**Qué hacer:**
- Activar App Check en la consola de Firebase con reCAPTCHA Enterprise (web)
- Agregar `initializeAppCheck()` en `frontend/src/firebase.ts`
- Habilitar enforcement en Cloud Functions
- Probar que la PWA siga funcionando correctamente

**Esfuerzo estimado:** 1 día

---

### 4. Monitoreo de Errores en Producción

**Estado actual:** Solo `console.error` en el frontend y `firebase-functions/logger` en el backend. Los errores del frontend se pierden — solo los ve el usuario en su navegador.

**Por qué importa:** Si un operador tiene un error en campo, no hay forma de saber qué pasó sin que lo reporte manualmente.

**Qué hacer:**
- Integrar Sentry (tiene plan gratuito) en el frontend:
  - Captura automática de excepciones no manejadas
  - Conectar con el ErrorBoundary existente
  - Breadcrumbs de navegación para reproducir el flujo del usuario
- En Cloud Functions: habilitar Error Reporting de Google Cloud (ya incluido con Firebase, solo necesita configuración)
- Configurar alertas por email cuando haya errores nuevos

**Esfuerzo estimado:** 1 día (Sentry) + 2 horas (Error Reporting)

---

### 5. Timeout de Sesión

**Estado actual:** Una vez logueado, la sesión persiste indefinidamente (Firebase Auth por defecto). No hay logout por inactividad.

**Por qué importa:** Si un operador deja el celular desbloqueado, cualquiera puede operar con su cuenta. En un sistema que genera actas legales, esto es un riesgo.

**Qué hacer:**
- Timer de inactividad en `AuthContext.tsx` (30 minutos sin interacción → logout automático)
- Eventos a monitorear: clicks, toques, scroll, teclas
- Mostrar aviso 2 minutos antes: "Tu sesión va a expirar. ¿Querés continuar?"
- Resetear timer en cada interacción

**Esfuerzo estimado:** 3-4 horas

---

## Prioridad Media (Performance y UX)

### 6. Lazy Loading de Rutas

**Estado actual:** Todas las páginas se importan estáticamente en `App.tsx`. El bundle inicial incluye todo el código aunque el usuario solo necesite LoginPage.

**Por qué importa:** En zonas con señal débil (contexto de operadores en la calle), un bundle más chico significa carga más rápida.

**Qué hacer:**
- Reemplazar imports estáticos por `React.lazy()` + `<Suspense>`:
  ```tsx
  const EnganchePage = React.lazy(() => import('./pages/EnganchePage'));
  const HistorialPage = React.lazy(() => import('./pages/HistorialPage'));
  // etc.
  ```
- Agregar un componente `<Suspense fallback={<Spinner />}>` alrededor de las rutas
- LoginPage y HomePage pueden quedar como imports estáticos (se usan siempre)

**Esfuerzo estimado:** 2-3 horas

---

### 7. Paginación en Historial

**Estado actual:** `HistorialPage` carga todos los servicios de Firestore de una vez con `getDocs()` sin `limit()`. Solo tiene filtrado client-side con `useMemo`.

**Por qué importa:** Con el tiempo, la cantidad de servicios va a crecer. Cargar 10,000 documentos de golpe es lento y costoso (lecturas de Firestore se cobran por documento).

**Qué hacer:**
- Agregar `limit(20)` y `startAfter(lastDoc)` en la query de Firestore
- Botón "Cargar más" o scroll infinito en el frontend
- Mantener los filtros existentes pero aplicarlos server-side (en la query de Firestore, no en `useMemo`)
- Considerar índices compuestos en Firestore si se filtra por múltiples campos

**Esfuerzo estimado:** 1-2 días

---

### 8. Persistencia Offline de Firestore

**Estado actual:** `getFirestore(app)` sin configuración de persistencia. Si el operador pierde conexión, las lecturas de Firestore fallan.

**Por qué importa:** Los operadores trabajan en la calle y pueden perder señal momentáneamente. Con persistencia offline, los datos consultados previamente siguen disponibles.

**Qué hacer:**
- Agregar en `firebase.ts`:
  ```ts
  import { enableIndexedDbPersistence } from 'firebase/firestore';
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn('Offline persistence no disponible:', err.code);
  });
  ```
- **Importante:** Esto solo cachea datos ya leídos. Las Cloud Functions (escrituras) siguen necesitando conexión.
- Probar que no genere conflictos con múltiples pestañas abiertas

**Esfuerzo estimado:** 2 horas + testing

---

### 9. Escucha en Tiempo Real del Servicio Activo

**Estado actual:** `ServicioActivoContext.tsx` tiene un `TODO: escuchar cambios en tiempo real (onSnapshot)`. Actualmente el estado se actualiza solo cuando el usuario navega o refresca.

**Por qué importa:** Si un admin anula un servicio desde el panel, el operador no se entera hasta que recargue la app.

**Qué hacer:**
- Reemplazar la lectura puntual por `onSnapshot` en el documento del servicio activo
- Unsubscribe automático cuando el componente se desmonte o el servicio cambie
- Mostrar notificación si el estado del servicio cambió externamente

**Esfuerzo estimado:** 3-4 horas

---

## Prioridad Baja (Mejoras Incrementales)

### 10. CI/CD con GitHub Actions

**Estado actual:** No hay pipeline de CI/CD. El deploy es manual con `firebase deploy`.

**Qué hacer:**
- Workflow en `.github/workflows/deploy.yml`:
  - En push a `main`: build → lint → test → deploy a Firebase
  - En PR a `main`: build → lint → test (sin deploy)
- Secrets de GitHub: `FIREBASE_TOKEN` para deploy

**Esfuerzo estimado:** 3-4 horas

---

### 11. Validación de Patente Duplicada en Servicio Activo

**Estado actual:** `EnganchePage.tsx:264` tiene un `TODO: verificar que la patente no esté en un servicio activo`. Si un operador intenta enganchar un vehículo que ya está en un servicio activo, el backend no lo impide.

**Qué hacer:**
- En `iniciarEnganche` (backend), consultar si existe un servicio con esa patente en estado ENGANCHADO o EN_TRASLADO
- Si existe, rechazar con error descriptivo: "Este vehículo ya tiene un servicio activo (nro. infracción: X)"

**Esfuerzo estimado:** 2-3 horas

---

### 12. Verificación de Duplicados en Acta Manual

**Estado actual:** `NuevaActaManualPage.tsx:100` tiene un `TODO: verificar duplicados antes de crear`.

**Qué hacer:**
- Antes de crear el acta, verificar si ya existe un servicio con el mismo número de infracción
- Mostrar warning al usuario si encuentra uno, permitiendo continuar si es intencional

**Esfuerzo estimado:** 2 horas

---

### 13. Enriquecer Datos de Corralón en Acta Manual

**Estado actual:** `NuevaActaManualPage.tsx:182` tiene un `TODO: enriquecer los datos de corralón`. Cuando se selecciona un corralón del catálogo, no se completan todos los campos automáticamente.

**Qué hacer:**
- Al seleccionar corralón del catálogo, autocompletar encargado de depósito y dirección si están disponibles en el documento del catálogo

**Esfuerzo estimado:** 1-2 horas

---

### 14. Paginación del Cache de Servicios Admin

**Estado actual:** `adminServicios.cache.ts:86` tiene un `TODO: paginar si la colección crece`. El panel admin carga todos los servicios.

**Qué hacer:**
- Aplicar la misma solución de paginación del punto 7
- Filtros server-side por fecha, estado, operador

**Esfuerzo estimado:** 1 día

---

### 15. Caching Offline de API en Service Worker

**Estado actual:** El Service Worker (Workbox) solo cachea assets estáticos y Google Fonts. No cachea respuestas de Cloud Functions.

**Qué hacer:**
- Agregar estrategia `NetworkFirst` para la Cloud Function `obtenerDatosIniciales` (catálogos de grúas, duplas, corralonés)
- Estos datos cambian poco y permitirían que la app muestre los selectores incluso sin conexión
- **No cachear** funciones de escritura (iniciarEnganche, etc.)

**Esfuerzo estimado:** 3-4 horas

---

## Resumen por Esfuerzo

| Mejora | Prioridad | Esfuerzo |
|--------|-----------|----------|
| Tests automatizados | Alta | 2-3 semanas |
| Rate limiting | Alta | 2-3 días |
| Firebase App Check | Alta | 1 día |
| Monitoreo (Sentry) | Alta | 1 día |
| Timeout de sesión | Alta | 3-4 horas |
| Lazy loading | Media | 2-3 horas |
| Paginación historial | Media | 1-2 días |
| Persistencia offline | Media | 2 horas |
| onSnapshot servicio activo | Media | 3-4 horas |
| CI/CD | Baja | 3-4 horas |
| Validar patente duplicada | Baja | 2-3 horas |
| Duplicados acta manual | Baja | 2 horas |
| Enriquecer corralón | Baja | 1-2 horas |
| Paginación admin | Baja | 1 día |
| Caching offline API | Baja | 3-4 horas |

---

## TODOs Encontrados en el Código

| Archivo | Línea | TODO |
|---------|-------|------|
| `frontend/src/pages/EnganchePage.tsx` | 264 | Verificar que la patente no esté en un servicio activo |
| `frontend/src/pages/NuevaActaManualPage.tsx` | 100 | Verificar duplicados antes de crear |
| `frontend/src/pages/NuevaActaManualPage.tsx` | 182 | Enriquecer los datos de corralón |
| `frontend/src/services/adminServicios.cache.ts` | 86 | Paginar si la colección crece |
| `frontend/src/context/ServicioActivoContext.tsx` | 54 | Escuchar cambios en tiempo real (onSnapshot) |
