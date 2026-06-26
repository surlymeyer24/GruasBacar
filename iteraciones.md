# Plan de Iteraciones — Sistema de Grúas
**Duración total: 10 días hábiles**

---

## Advertencia antes de arrancar

10 días para una persona es ajustado para todo el MVP. Este plan prioriza el **flujo core del chofer** (que es lo que tiene que funcionar sí o sí) y deja el admin simplificado. Si te atrasás en una iteración, lo que se recorta es del final, no del medio.

**Regla:** si un día terminás antes, avanzás al siguiente. Si te atrasás, no saltés — terminá lo que estás haciendo.

---

## Iteración 0 — Setup (Día 1)

**Objetivo:** que todo compile y se pueda navegar entre pantallas vacías. Que la Service Account pueda escribir en Drive.

| Tarea | Archivos |
|---|---|
| Inicializar Vite + React + TypeScript + Tailwind | `frontend/` |
| Inicializar Firebase Functions con TypeScript | `functions/` |
| Configurar Firebase project (Auth, Firestore) | `firebase.json`, `.firebaserc` |
| Configurar Service Account en proyecto `gruasbacar` con acceso a Google Drive API | Google Cloud Console |
| Crear carpeta raíz "Gruas" en Drive de la cuenta designada y compartirla con la Service Account | Google Drive |
| Escribir Firestore Security Rules iniciales (cerradas) | `firestore.rules` |
| Cerrar Storage Rules (no se usa, las fotos van a Drive) | `storage.rules` |
| Configurar `shared/src/types.ts` con todas las interfaces | `shared/src/types.ts` |
| Configurar Firebase SDK en el frontend | `frontend/src/firebase.ts` |
| Implementar `AuthContext` + `useAuth` + `ProtectedRoute` + `RoleGuard` | `context/`, `hooks/`, `components/auth/` |
| Login funcional con Firebase Auth (email/password) | `LoginForm.tsx`, `LoginPage.tsx` |
| Routing básico con React Router (todas las pages como placeholder) | `App.tsx`, todas las pages |
| Layout + Navbar responsive | `Layout.tsx`, `Navbar.tsx` |
| Deploy inicial a Firebase Hosting (pantalla de login funcionando) | — |

**Entregable del día 1:** la app se abre en el celular, el login funciona, navega entre pantallas vacías según el rol, y la Service Account puede crear carpetas en Drive.

---

## Iteración 1 — Enganche: Datos (Días 2-3)

**Objetivo:** el chofer puede cargar los datos de un enganche y confirmarlos.

### Día 2

| Tarea | Archivos |
|---|---|
| Function `iniciarEnganche`: validar unicidad, crear servicio, setear `servicioActivoId` en usuario | `functions/src/services/servicio.service.ts`, `functions/src/index.ts` |
| Function `obtenerDatosIniciales`: devolver grúas, corralones, duplas activas | `functions/src/index.ts` |
| Services frontend para llamar las functions | `frontend/src/services/servicio.service.ts` |
| Hook `useServicioActivo`: escuchar en tiempo real el servicio activo del chofer | `hooks/useServicioActivo.ts` |
| Lógica de redirección: si hay servicio activo, ir al estado correspondiente | `HomePage.tsx` |

### Día 3

| Tarea | Archivos |
|---|---|
| `DatosForm.tsx`: formulario de número infracción, patente, grúa, dupla, inspector | `components/enganche/DatosForm.tsx` |
| `ResumenConfirmacion.tsx`: pantalla de confirmación "¿Son correctos?" | `components/enganche/ResumenConfirmacion.tsx` |
| `ConfirmDialog.tsx` reutilizable | `components/shared/ConfirmDialog.tsx` |
| `EnganchePage.tsx`: orquesta DatosForm → Resumen → (confirma) → pasa a fotos | `pages/EnganchePage.tsx` |
| Cargar datos de grúas/duplas/corralones desde Firestore | `services/grua.service.ts`, `services/dupla.service.ts` |
| Testear flujo completo: login → datos → confirmar → servicio creado en Firestore | — |

**Entregable del día 3:** un chofer puede loguearse, cargar datos de un enganche, y confirmarlo. El servicio queda creado en Firestore con estado ENGANCHADO.

---

## Iteración 2 — Enganche: Fotos + Google Drive (Días 4-5)

**Objetivo:** el chofer saca las 5 fotos en orden guiado y se suben a Google Drive.

### Día 4

| Tarea | Archivos |
|---|---|
| `useCamera` hook: acceder a la cámara del celular, capturar foto, forzar cámara (no galería) | `hooks/useCamera.ts` |
| `compressImage.ts`: comprimir foto antes de subir (canvas resize, JPEG 0.7, max 1200px) | `utils/compressImage.ts` |
| `useGeolocation` hook: obtener posición actual | `hooks/useGeolocation.ts` |
| `FotoCapture.tsx`: componente reutilizable — abre cámara, muestra preview, pregunta "¿Subir esta foto?", reintento | `components/shared/FotoCapture.tsx` |
| Function `subirFotoDrive`: recibir foto en base64 + metadata, crear estructura de carpetas en Drive (`Gruas/YYYY-MM-DD/PATENTE-INFRACCION/{enganche,desenganche}/`), subir foto, devolver driveFileId y URL | `functions/src/services/drive.service.ts` |
| `foto.service.ts`: comprimir foto, convertir a base64, llamar Function `subirFotoDrive`, devolver URL | `services/foto.service.ts` |
| ⚠️ Probar cámara en celular real (Android + iOS Safari) | — |
| ⚠️ Probar que la Function suba correctamente a Drive y la foto sea visible | — |

### Día 5

| Tarea | Archivos |
|---|---|
| `FotoGuiada.tsx`: flujo guiado — delantera → derecha → izquierda → trasera → observación. Con etiqueta visible, observación opcional por foto, barra de progreso | `components/enganche/FotoGuiada.tsx` |
| Function `registrarEventoEnganche`: guardar evento con fotos (driveFileId + url), geo (primera foto), timestamp servidor | `functions/src/services/servicio.service.ts` |
| Integrar geo automática en la primera foto | `FotoGuiada.tsx` + `useGeolocation` |
| Function `confirmarTraslado`: transicionar estado a EN_TRASLADO + timestamp servidor | `functions/src/services/servicio.service.ts` |
| Botón "Traslado" al completar fotos → llama function que transiciona estado | — |
| Testear flujo completo en celular real: cámara, fotos, geo, subida a Drive | — |

**Entregable del día 5:** el flujo de enganche completo funciona de punta a punta. El chofer carga datos, saca las 5 fotos en orden, se suben a Google Drive en carpetas organizadas, confirma, y el servicio pasa a EN_TRASLADO.

---

## Iteración 3 — Traslado + Desenganche (Días 6-7)

**Objetivo:** el flujo core completo funciona de principio a fin.

### Día 6

| Tarea | Archivos |
|---|---|
| `PantallaTraslado.tsx`: pantalla de espera con botón "Desenganche", muestra datos del servicio | `components/traslado/PantallaTraslado.tsx` |
| `TrasladoPage.tsx` | `pages/TrasladoPage.tsx` |
| `LlegadaCorralon.tsx`: al presionar "Desenganche" → geo + timestamp automáticos + selector de corralón | `components/desenganche/LlegadaCorralon.tsx` |
| Function `registrarLlegadaCorralon`: geo, timestamp servidor, corralón seleccionado | `functions/src/services/servicio.service.ts` |

### Día 7

| Tarea | Archivos |
|---|---|
| `FotoDesenganche.tsx`: mismo flujo guiado de 4 fotos + observación general (reutiliza `FotoCapture`). Fotos se suben a Drive en subcarpeta `desenganche/` | `components/desenganche/FotoDesenganche.tsx` |
| `ConfirmacionFinal.tsx`: confirmar desenganche | `components/desenganche/ConfirmacionFinal.tsx` |
| Function `confirmarDesenganche`: guardar evento, transicionar a DESENGANCHADO, limpiar `servicioActivoId` | `functions/src/services/servicio.service.ts` |
| `DesenganchePage.tsx`: orquesta llegada → fotos → confirmación | `pages/DesenganchePage.tsx` |
| Testear flujo completo: enganche → traslado → desenganche → servicio cerrado → puede iniciar otro | — |

**Entregable del día 7:** el flujo core completo funciona. Un chofer puede hacer un servicio de principio a fin. Las fotos están organizadas en Drive.

---

## Iteración 4 — Admin + Historial (Días 8-9)

**Objetivo:** el admin puede gestionar datos y ver servicios.

### Día 8

| Tarea | Archivos |
|---|---|
| `ServiciosList.tsx`: tabla/lista de todos los servicios con estado, timestamps, filtro por fecha | `components/admin/ServiciosList.tsx` |
| Function `anularServicio`: validar que no sea del día actual, transicionar a ANULADO | `functions/src/services/servicio.service.ts` |
| `HistorialPage.tsx`: historial del chofer (sus servicios) | `pages/HistorialPage.tsx` |
| `AdminPage.tsx`: layout con tabs/secciones para cada ABM | `pages/AdminPage.tsx` |

### Día 9

| Tarea | Archivos |
|---|---|
| `GruasCRUD.tsx`: crear, editar, desactivar grúas | `components/admin/GruasCRUD.tsx` |
| `CorralonesCRUD.tsx`: crear, editar, desactivar corralones | `components/admin/CorralonesCRUD.tsx` |
| `DuplasCRUD.tsx`: crear, editar duplas | `components/admin/DuplasCRUD.tsx` |
| `UsuariosCRUD.tsx`: crear usuarios, asignar rol, editar | `components/admin/UsuariosCRUD.tsx` |
| Firestore Security Rules definitivas | `firestore.rules` |

**Entregable del día 9:** el admin puede ver servicios, anular, y gestionar las entidades. Los ABMs son funcionales aunque no estén pulidos visualmente.

---

## Iteración 5 — Testing, pulido, deploy (Día 10)

**Objetivo:** que funcione en producción sin vergüenza.

| Tarea |
|---|
| Testear flujo completo en celular real (Android + iOS Safari) |
| Corregir bugs de responsive, cámara, geolocalización |
| Verificar que los timestamps del servidor funcionan correctamente |
| Verificar Security Rules (un chofer no puede ver servicios de otro) |
| Verificar que las fotos en Drive están organizadas correctamente y son accesibles |
| Deploy final a Firebase Hosting + Functions |
| Crear usuario admin y usuario chofer de prueba |
| Probar con el cliente o con un compañero de trabajo |

**Entregable del día 10:** el sistema está en producción, funcional, y listo para una demo.

---

## Qué queda afuera si te atrasás (en orden de descarte)

1. **Primero se recorta:** los ABMs se simplifican a carga manual por Firestore Console
2. **Después:** el historial del chofer se posterga
3. **Después:** los filtros del admin se simplifican
4. **Nunca se recorta:** el flujo core (enganche → traslado → desenganche) — es la razón de ser del sistema

---

## Riesgos que te van a hacer perder tiempo

| Riesgo | Mitigación |
|---|---|
| La cámara no funciona en Safari iOS | Probá el `useCamera` el día 4 a primera hora en un iPhone. Si falla, buscá la solución ese día, no el 10. |
| La geolocalización tarda o falla | Pedí permisos apenas el chofer se loguea, no cuando necesite la foto. |
| Firebase Functions tarda en deployar | Usá el emulador local para desarrollo. Solo deployá al final del día. |
| TypeScript te frena al principio | No busques tipado perfecto. Usá `as` cuando te trabe y volvé a tiparlo bien el día 10. No es excusa para volver a JS. |
| Google Drive API falla o la Service Account no tiene permisos | Probá la subida a Drive el día 1 con una Function de prueba mínima. No esperes al día 4 para descubrir que la SA no tiene acceso. |
| La Function de subida a Drive es lenta por el tamaño de la foto | Comprimí bien en el cliente (max 1200px, JPEG 0.7). Si sigue lento, bajá a 800px. |