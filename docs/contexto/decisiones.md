# Decisiones tomadas

> Una entrada por decisión. Lo importante es el "por qué" y el "qué descartamos".

---

## Inicio del proyecto · Google Drive en vez de Firebase Storage para fotos

- **Decisión:** Las fotos se suben a Google Drive via Service Account, no a Firebase Storage.
- **Por qué:** El cliente necesita que las fotos queden organizadas en una estructura de carpetas legible por humanos (`Gruas/YYYY-MM-DD/LEGAJO/PATENTE_INFRACCION/{enganche,desenganche}/`), accesibles desde la interfaz de Drive sin herramientas técnicas. Firebase Storage no ofrece esa navegabilidad de carpetas para usuarios no técnicos.
- **Descartado:**
  - **Firebase Storage** — Funciona bien técnicamente, pero las fotos quedan en un bucket opaco que solo se navega desde la Firebase Console. El cliente quiere ver las fotos desde su Drive de Google.
  - **Cloudinary / S3** — Agrega dependencia externa fuera del ecosistema Firebase/Google. Más complejidad para un MVP.
- **Estado:** Vigente. Las Storage Rules están cerradas (solo quedan como fallback por si se necesita temporalmente).

---

## Jun 2025 · Firebase Storage como buffer de subida (Drive sigue siendo el archivo oficial)

- **Decisión:** Las fotos se suben desde el celular a **Firebase Storage** (upload resumible) y un trigger `procesarFotoStorage` las mueve a **Google Drive**, borra Storage, y expone progreso via `fotosStaging`.
- **Por qué:** El callable con base64 era lento e frágil en 3G (4 requests, sin reanudación, cold starts). Storage mejora el transporte desde móvil sin perder la estructura de carpetas en Drive que el cliente necesita.
- **Descartado:**
  - **Solo callable base64** — Sigue existiendo `subirFotoEvento` por compatibilidad, pero el flujo operativo ya no lo usa.
  - **Storage como archivo permanente** — Duplicaría costo y no aporta; Drive sigue siendo la fuente de verdad.
  - **Outbox offline completo** — Pendiente para fase 2; por ahora IndexedDB + reintentar subida.
- **Implementación:** Ver `docs/contexto/subida-fotos-storage.md`.
- **Estado:** Vigente. Requiere setup IAM único para el trigger (3 service accounts).

---

## Inicio del proyecto · Firebase Callable Functions en vez de API REST

- **Decisión:** Toda la comunicación frontend → backend es via `onCall` (Firebase Callable Functions v2), no hay API REST custom.
- **Por qué:** Las Callable Functions manejan automáticamente la serialización, CORS, y el contexto de auth (`request.auth`). Reduce boilerplate vs. montar un Express/API custom sobre Cloud Functions. Para un MVP con operaciones puntuales (iniciar enganche, confirmar traslado, etc.) es la opción más rápida.
- **Descartado:**
  - **API REST con Express sobre Cloud Functions** — Más flexible para APIs complejas, pero agrega routing manual, middleware de CORS, parsing de body, validación de tokens manual. Overkill para este caso.
  - **Firestore directo desde el cliente para escrituras** — Peligroso. Las transiciones de estado necesitan validaciones atómicas (unicidad, estado previo, timestamps de servidor) que no se pueden garantizar solo con Security Rules.
- **Estado:** Vigente.

---

## Inicio del proyecto · Timestamps de servidor, nunca del cliente

- **Decisión:** Todos los timestamps de transición de estado (`creadoEn`, `finalizadoEn`, timestamps de eventos) se generan con `FieldValue.serverTimestamp()` en Cloud Functions.
- **Por qué:** El objetivo principal del sistema es medir tiempos de cada etapa (enganche → traslado → desenganche). Si el cliente genera los timestamps, un chofer podría manipular su reloj para falsear tiempos. Es un requerimiento no funcional crítico (RNF-06).
- **Descartado:**
  - **`new Date()` en el cliente** — No confiable. El reloj del celular puede estar desincronizado o manipulado intencionalmente.
  - **`Timestamp.now()` del SDK de Firestore en el cliente** — Sigue dependiendo del reloj local.
- **Estado:** Vigente. No negociable.

---

## Inicio del proyecto · HashRouter en vez de BrowserRouter

- **Decisión:** Se usa `HashRouter` de React Router (rutas con `#/`), no `BrowserRouter`.
- **Por qué:** Firebase Hosting maneja rewrites a `index.html` para SPA, pero `HashRouter` elimina completamente los problemas de refresh en producción (404 al recargar una ruta como `/enganche`). Es más robusto para una PWA mobile-first donde el usuario puede cerrar y reabrir la app en cualquier estado.
- **Descartado:**
  - **BrowserRouter** — Requiere configuración de rewrites perfecta en el servidor. Funciona con Firebase Hosting si el rewrite está bien configurado (`"rewrites": [{"source": "**", "destination": "/index.html"}]`), pero `HashRouter` es a prueba de errores de configuración.
- **Estado:** Vigente. Si en el futuro se necesita SEO (ej: landing pública), migrar a `BrowserRouter` con rewrites.

---

## Inicio del proyecto · Union types en vez de enums de TypeScript

- **Decisión:** Los estados, roles, tipos de evento y tipos de flota se definen como union types (`type EstadoServicio = 'ENGANCHADO' | 'EN_TRASLADO' | ...`), no como `enum`.
- **Por qué:** Los union types son más livianos en el bundle (desaparecen en compilación), son compatibles directamente con los valores string de Firestore sin conversión, y se serializan/deserializan sin problemas en payloads de Callable Functions.
- **Descartado:**
  - **`enum` de TypeScript** — Genera código JavaScript en runtime. Agrega overhead y puede causar problemas de comparación si se serializa/deserializa entre frontend y functions (el valor puede dejar de ser la instancia del enum).
  - **Objetos const con `as const`** — Viable pero más verbose para este caso. No agrega beneficio claro sobre union types directos.
- **Estado:** Vigente.

---

## Inicio del proyecto · Workspace monorepo con `shared/` como paquete

- **Decisión:** El proyecto es un monorepo con npm workspaces (`shared`, `functions`, `frontend`). Los tipos compartidos viven en `shared/src/types.ts` y se importan como `@gruasbacar/shared`.
- **Por qué:** Frontend y backend necesitan las mismas interfaces (`Servicio`, `Usuario`, `Evento`, payloads). Sin un paquete compartido, los tipos se duplican y divergen inevitablemente. El workspace alias permite importar con ruta absoluta limpia.
- **Descartado:**
  - **Copiar/pegar tipos entre frontend y functions** — Garantía de que divergen en la segunda semana.
  - **Monorepo con Turborepo/Nx** — Demasiada infra para un proyecto de una persona. npm workspaces nativo es suficiente.
- **Estado:** Vigente.

---

## Inicio del proyecto · Roles en Firestore, no en Firebase Auth Custom Claims

- **Decisión:** Los roles (`ADMIN`, `SUPERVISOR`, `ENGANCHADOR`, `CHOFER`) se almacenan en el documento del usuario en Firestore (`usuarios/{uid}.roles[]`), no en Custom Claims de Firebase Auth.
- **Por qué:** Custom Claims requiere llamar al Admin SDK para setearlos y re-autenticar al usuario para que tomen efecto. Con roles en Firestore, el admin puede cambiar un rol y el efecto es inmediato en la próxima lectura. Además, las Security Rules pueden leer directamente el documento del usuario con `get()`.
- **Descartado:**
  - **Firebase Auth Custom Claims** — Latencia de propagación (el usuario tiene que re-loguearse o esperar que el token se refresque). Más complejo para un MVP.
- **Estado:** Vigente. Trade-off: cada request autenticada en Security Rules hace un `get()` adicional al documento del usuario. Aceptable para este volumen.

---

## Inicio del proyecto · Compresión de fotos en el cliente, no en el servidor

- **Decisión:** Las fotos se comprimen en el frontend (canvas resize, JPEG calidad 0.7, máximo 1200px de lado mayor) antes de enviarlas como base64 a la Cloud Function.
- **Por qué:** Los celulares sacan fotos de 4-12 MB. Enviar eso como base64 a una Cloud Function duplicaría el tamaño (~33% más en base64) y la Function necesitaría más memoria y tiempo. Comprimir en el cliente reduce el payload a ~100-300 KB por foto, lo que hace viable enviarlas en un solo request.
- **Descartado:**
  - **Comprimir en la Cloud Function** — La foto llegaría a 8-16 MB en base64. La Function necesitaría 1 GB+ de RAM y timeouts largos. Inviable para el plan gratuito/económico de Firebase.
  - **Upload directo a Storage + trigger en Cloud Function** — No aplica porque no usamos Firebase Storage (decisión de Google Drive).
- **Estado:** Vigente. Si la calidad no es suficiente, subir a max 1600px antes de bajar resolución.

---

## Inicio del proyecto · Servicios en Firestore como máquina de estados, no editables

- **Decisión:** Un servicio solo avanza de estado (`ENGANCHADO → EN_TRASLADO → DESENGANCHADO`) o se anula. No se editan campos retroactivamente. Excepción: el admin tiene `actualizarServicio` para correcciones de datos (patente, grúa, dupla).
- **Por qué:** El servicio es un registro operativo con valor legal (acta de infracción). Permitir edición libre abriría la puerta a inconsistencias entre los datos del servicio y las fotos/eventos ya guardados. La máquina de estados lineal simplifica la lógica enormemente.
- **Descartado:**
  - **Edición libre de todos los campos** — Riesgo de inconsistencia. ¿Qué pasa si se cambia la patente después de subir las fotos con la patente vieja a Drive?
  - **Versionado de cambios** — Correcto pero overkill para MVP.
- **Estado:** Vigente. Edición de datos (no de estado) habilitada para admin y supervisor como corrección puntual.

---

## Inicio del proyecto · Escrituras a `servicios/` solo via Cloud Functions

- **Decisión:** Las Firestore Security Rules bloquean toda escritura directa del cliente a `servicios/` y `servicios/{id}/eventos/` (`allow create: if false; allow update: if false;`). Solo las Cloud Functions (con Admin SDK) pueden escribir.
- **Por qué:** Las transiciones de estado requieren validaciones complejas (verificar estado previo, unicidad, permisos, timestamps de servidor, transacciones atómicas). Las Security Rules no pueden expresar esa lógica. Delegar todo al Admin SDK en Functions da control total.
- **Descartado:**
  - **Escritura directa con Security Rules complejas** — Las rules de Firestore son limitadas para validaciones multi-documento (ej: verificar que no exista otro servicio con el mismo identificador compuesto). Además, `serverTimestamp()` en rules es frágil.
- **Estado:** Vigente. Los CRUDs de entidades auxiliares (`gruas`, `corralones`, `duplas`) sí permiten escritura directa del admin desde el cliente.

---

## Inicio del proyecto · Tailwind CSS v4 (no v3, no CSS modules)

- **Decisión:** El frontend usa Tailwind CSS v4 con el plugin `@tailwindcss/vite`.
- **Por qué:** Mobile-first es el caso de uso principal. Tailwind permite prototipar rápido con clases utilitarias sin salir del JSX. La v4 simplifica la configuración (no necesita `tailwind.config.js` explícito en la mayoría de casos).
- **Descartado:**
  - **CSS modules / Vanilla CSS** — Más aislado por componente, pero más lento para prototipar un MVP en 10 días.
  - **Styled-components / Emotion** — Runtime CSS-in-JS agrega peso al bundle y complejidad. No aporta valor para este proyecto.
  - **Tailwind v3** — Funciona bien pero v4 estaba disponible y simplifica el setup con Vite.
- **Estado:** Vigente.

---

## Inicio del proyecto · Modo mock/simulación en frontend

- **Decisión:** El frontend tiene un flag global `isMock` que controla si se usan servicios reales de Firebase o datos simulados en `localStorage`.
- **Por qué:** Permite desarrollar y probar la UI sin tener Firebase Functions corriendo. Útil para prototipado inicial y demos rápidas. Cada servicio del frontend tiene ramas `if (!isMock && app)` para la lógica real y un fallback mock.
- **Descartado:**
  - **Solo emuladores de Firebase** — Los emuladores son pesados de levantar (`npm run emulators` requiere Java, varios puertos). El modo mock es más liviano para trabajo de UI puro.
  - **MSW (Mock Service Worker)** — Más elegante para interceptar requests, pero agrega una dependencia y complejidad. El `isMock` inline es crudo pero funcional para un equipo de una persona.
- **Estado:** Vigente, con intención de eliminar gradualmente a medida que los emuladores se estabilicen. El `isMock` actual está en `false` para producción.

---

## Durante desarrollo · Evolución de CHOFER a ENGANCHADOR + multi-rol

- **Decisión:** El rol operativo principal pasó de llamarse `CHOFER` a `ENGANCHADOR`. Se agregó soporte para múltiples roles por usuario (`roles: RolUsuario[]` en vez de `rol: RolUsuario`). `CHOFER` se mantiene como alias legacy de `ENGANCHADOR`.
- **Por qué:** El operador de campo no es solo un "chofer" — es quien ejecuta el enganche completo. El nombre `ENGANCHADOR` refleja mejor la función. Multi-rol permite que un admin también sea operador de campo para demos o emergencias.
- **Descartado:**
  - **Mantener solo `CHOFER`** — Nombre confuso. La dupla tiene "chofer" y "ayudante" como personas, pero el usuario del sistema es el operador.
  - **Borrar `CHOFER` del código** — Rompería documentos existentes en Firestore que tienen `rol: 'CHOFER'`. Se mantiene con `normalizeRol()` para retrocompatibilidad.
- **Estado:** Vigente. `CHOFER` y `ENGANCHADOR` son equivalentes operativamente via `esOperador()`.

---

## Durante desarrollo · Asignación diaria de turno en vez de asignación fija

- **Decisión:** La grúa, dupla e inspector se asignan al inicio de cada turno (`asignacionDiaria` en el documento del usuario), no como campos fijos del usuario. La asignación tiene TTL de 8 horas (`DURACION_TURNO_MS`).
- **Por qué:** Los choferes rotan de grúa y dupla. Una asignación fija en el perfil del usuario no refleja la operación real. La asignación diaria se guarda una vez al inicio del turno y se autocompleta en cada enganche nuevo.
- **Descartado:**
  - **Asignación fija en el perfil** — No refleja la realidad operativa.
  - **Selección manual en cada enganche** — Tedioso y propenso a errores. El chofer debería seleccionar grúa, dupla e inspector en cada servicio.
  - **Modelo de "turnos" como entidad separada** — Correcto a largo plazo, dejado para post-MVP.
- **Estado:** Vigente. Revisar si 8 horas de TTL es correcto con el cliente.

---

## Durante desarrollo · Subida de fotos una por una al servidor (no en lote)

- **Decisión:** Cada foto se sube individualmente a Google Drive via `subirFotoEvento` durante la captura guiada, no todas juntas al final.
- **Por qué:** Si se suben las 5 fotos en un solo request al final, el payload es enorme (~1.5 MB en base64 por las 5 fotos) y si falla, se pierden todas. Subiendo una por una: si falla una, las anteriores ya están guardadas. Además, el timeout de la Cloud Function se distribuye mejor.
- **Descartado:**
  - **Subir todas juntas en `registrarEventoEnganche`** — Riesgo de timeout por payload grande. Si falla, hay que repetir todo.
  - **Subir desde el cliente directamente a Drive API** — Requeriría exponer credenciales de la Service Account al frontend. Inaceptable.
- **Estado:** Vigente. `subirFotoEvento` sube individual, `registrarEventoEnganche` / `confirmarDesenganche` reciben las referencias ya subidas.

---

## Durante desarrollo · Legajo del chofer como campo obligatorio para operadores

- **Decisión:** El legajo es obligatorio para usuarios con rol `ENGANCHADOR`/`CHOFER` (`requiereLegajo()`). Se valida unicidad entre usuarios (`legajoYaUsado()`). Se graba en el servicio al momento del enganche (`legajoChofer`).
- **Por qué:** Las fotos en Google Drive se organizan en carpetas por legajo (`Gruas/YYYY-MM-DD/LEGAJO-PATENTE-INFRACCION/`). Sin legajo, no se puede armar la ruta. Además, el legajo es dato operativo necesario para las actas de infracción.
- **Descartado:**
  - **Usar el uid de Firebase como identificador en la ruta de Drive** — Un hash no es legible para humanos revisando las carpetas de Drive.
  - **Legajo opcional** — Rompería la estructura de carpetas en Drive.
- **Estado:** Vigente.

---

## Durante desarrollo · Tipo de flota: TRANSITO vs TRANSPORTE

- **Decisión:** Se agregó `TipoFlota = 'TRANSITO' | 'TRANSPORTE'` como clasificación de grúas y duplas. Default legacy: `TRANSITO`.
- **Por qué:** BACAR opera dos tipos de servicio con operación distinta. El tipo de flota se hereda de la grúa asignada al momento del enganche y queda registrado en el servicio para filtrado y reportes.
- **Descartado:**
  - **Un solo tipo sin distinción** — No refleja la operación real del cliente.
  - **Enum extensible** — Por ahora son exactamente dos tipos. Union type es suficiente.
- **Estado:** Vigente. `normalizeTipoFlota()` asegura retrocompatibilidad con documentos que no tienen el campo.

---

## Jun 2025 · Rol SUPERVISOR (auditoría de actas)

- **Decisión:** Se agregó el rol `SUPERVISOR` como cuenta de solo lectura operativa con capacidad de auditoría sobre actas.
- **Por qué:** BACAR necesita personas que monitoreen la flota y consulten/corrijan actas sin acceso a la configuración ni al flujo de enganche en campo.
- **Qué puede hacer un supervisor:**
  - Dashboard en `/supervisor-dashboard` (actas registradas, grúas en operación, actas abiertas, operadores en turno)
  - Historial completo en `/historial`
  - Editar datos de actas (`actualizarServicio`) y anularlas (`anularServicio`)
  - **No** puede: configurar flota, crear usuarios, ni operar enganches
- **Implementación:**
  - Helpers en `shared/src/types.ts`: `esSupervisor`, `puedeVerHistorialCompleto`, `puedeGestionarActas`, `esRutaSupervisor`
  - Middleware `verificarGestionActas` en functions para editar actas
  - Firestore rules: lectura de todos los `servicios`, `eventos` y listado de `usuarios` (solo lectura)
- **Descartado:**
  - **Reutilizar solo el dashboard admin** — Mezclaba links de configuración que el supervisor no debe ver
  - **Dar rol ADMIN reducido** — Demasiados permisos; el supervisor no debe tocar ABM ni usuarios
- **Estado:** Vigente. Asignar desde Admin → Usuarios del Sistema.

---

## Jun 2025 · Borrador local de fotos en IndexedDB

- **Decisión:** Las fotos capturadas durante enganche/desenganche se guardan en borrador local (IndexedDB) antes de confirmarse en servidor. Implementado en `fotoCache.service.ts`, integrado en `FotoLoteUpload.tsx`.
- **Por qué:** Los operadores trabajan en celular en la calle. Una recarga accidental de la página (batería, pérdida de señal, cierre del navegador) borraba todas las fotos ya sacadas.
- **Comportamiento:**
  - Clave: `{servicioId}:{enganche|desenganche}`
  - Guardado automático con debounce al capturar cada foto
  - Restauración al reabrir el paso de fotos
  - TTL: 24 horas
  - Limpieza: al confirmar enganche en servidor; al cerrar desenganche en confirmación final (no al pasar al paso de confirmación)
- **Descartado:**
  - **localStorage** — Límite de ~5 MB insuficiente para varias fotos en base64
  - **sessionStorage** — Se pierde al cerrar pestaña; IndexedDB persiste mejor
- **Estado:** Vigente. Si IndexedDB no está disponible, falla en silencio (el operador debe volver a sacar las fotos).
