# Errores conocidos (gotchas)

> Las trampas que ya mordieron. Cada una ahorra una hora de debug.

---

## Las fotos desaparecen al recargar la página durante la captura

- **Pasa cuando:** El operador sacó 2-3 fotos, la página se recarga (batería, señal, cierre accidental) y al volver el lote está vacío.
- **Causa real:** Antes de jun 2025, las fotos vivían solo en estado React (`FotoLoteUpload`). Una recarga borraba todo el estado del componente.
- **Solución:** Desde jun 2025, `fotoCache.service.ts` persiste el borrador en IndexedDB con clave `{servicioId}:{enganche|desenganche}`. Al reabrir el paso de fotos, se restauran automáticamente. Si no se restauran:
  1. Verificar que el navegador soporta IndexedDB (modo privado extremo puede bloquearlo)
  2. Verificar que no pasaron más de 24 h (TTL del borrador)
  3. Verificar que no se confirmó ya el paso (enganche limpia al confirmar; desenganche limpia al cierre final)

---

## CORS 403 al llamar una Cloud Function nueva en producción

- **Pasa cuando:** Deployás una Cloud Function nueva y al llamarla desde el frontend en producción, el navegador muestra `Access to fetch has been blocked by CORS policy` o un HTTP 403.
- **Causa real:** Firebase Functions v2 corren sobre Cloud Run. Por default, Cloud Run solo permite invocación autenticada con IAM. El preflight `OPTIONS` del navegador no lleva credenciales → Cloud Run lo rechaza con 403 → el navegador interpreta eso como error de CORS. No es un problema de CORS — es un problema de permisos de Cloud Run.
- **Solución:** Ejecutar `npm run fix-invokers` después de cada deploy de una function nueva. El script agrega `allUsers` como invoker público tanto en Cloud Functions como en Cloud Run. La autenticación real se maneja dentro de la function con `verificarAuth`/`verificarAdmin`/`verificarOperador`, no a nivel IAM.

---

## `@gruasbacar/shared` no resuelve en functions después de un cambio

- **Pasa cuando:** Modificás `shared/src/types.ts`, corrés los emuladores, y las functions siguen usando la versión vieja de los tipos. O al hacer deploy, falla con `Cannot find module '@gruasbacar/shared'`.
- **Causa real:** Functions no usa el alias de Vite — depende de `vendor/shared/` (una copia compilada). En desarrollo con emuladores, usa el workspace de npm (que necesita `shared/dist/`). Si `shared/dist/` no existe o está desactualizado, las functions ven tipos viejos.
- **Solución:**
  - Para emuladores: `cd shared && npm run build` antes de levantar emuladores.
  - Para deploy: `npm run deploy:functions` — el predeploy reconstruye `vendor/shared/` automáticamente.
  - **No editar `functions/vendor/` a mano** — se borra y regenera en cada predeploy.

---

## El campo `rol` y el campo `roles` coexisten en documentos de usuario

- **Pasa cuando:** Leés un documento de `usuarios/` y tiene `rol: "CHOFER"` (string) y `roles: ["ENGANCHADOR"]` (array), o solo tiene uno de los dos.
- **Causa real:** El sistema migró de un campo singular `rol: RolUsuario` a un array `roles: RolUsuario[]`. Los documentos creados antes de la migración solo tienen `rol`. Los nuevos tienen `roles`. Algunos tienen ambos con valores diferentes.
- **Solución:** Nunca leer `rol` ni `roles` directamente. Siempre usar `normalizeRoles(data.roles, data.rol)` de `@gruasbacar/shared`. Esta función prioriza `roles[]` si existe, y cae a `rol` como fallback legacy. El middleware de auth (`auth.middleware.ts`) y el `AuthContext` ya hacen esto.
- **⚠️ No "arreglar" esto borrando el campo `rol`** de los documentos — rompería la retrocompatibilidad si queda algún path que lo lea.

---

## `creadoEn` vs `fechaCreacion` — dos campos para lo mismo

- **Pasa cuando:** Buscás la fecha de creación de un servicio y no sabés cuál campo usar, o uno está y el otro no.
- **Causa real:** `creadoEn` es el campo oficial (Firestore server timestamp). `fechaCreacion` es un alias legacy que existe en datos mock y en el workspace `labs/gruas-bacar`. El tipo `Servicio` en shared tiene ambos: `creadoEn?: any` y `fechaCreacion?: any`.
- **Solución:** Usar `fechaServicio(servicio)` de `frontend/src/utils/formatters.ts`. Esta función intenta `creadoEn` primero y cae a `fechaCreacion` como fallback:
  ```ts
  return parseFirestoreDate(servicio.creadoEn) ?? parseFirestoreDate(servicio.fechaCreacion);
  ```
  En código nuevo, siempre escribir `creadoEn`. Nunca crear `fechaCreacion` en documentos nuevos.

---

## Los emuladores conectan doble si no hay guarda de `globalThis`

- **Pasa cuando:** En desarrollo con Vite + HMR, la app reconecta los emuladores de Firebase al hacer hot reload. Firestore muestra el warning `"Firestore has already been started and its settings can not be changed"` o empieza a fallar con conexiones duplicadas.
- **Causa real:** Vite re-ejecuta `firebase.ts` en cada hot reload. Sin la guarda `globalThis.__GRUASBACAR_EMULATORS__`, `connectAuthEmulator`, `connectFirestoreEmulator`, etc. se llaman múltiples veces.
- **Solución:** Ya está resuelto con el flag global:
  ```ts
  if (useEmulators && !globalThis.__GRUASBACAR_EMULATORS__) {
    connectAuthEmulator(auth, ...);
    // ...
    globalThis.__GRUASBACAR_EMULATORS__ = true;
  }
  ```
  **No quitar el `// eslint-disable-next-line no-var`** de la declaración `declare global` — es necesario porque `var` es obligatorio para extender `globalThis` en TypeScript.

---

## `useServicioActivo` en modo mock usa un `setInterval` de 800ms

- **Pasa cuando:** Estás en modo mock (`isMock = true`) y ves que la UI del servicio activo se actualiza con un delay de hasta 800ms después de un cambio.
- **Causa real:** En modo mock, no hay `onSnapshot` de Firestore. El hook usa `localStorage` como store y lo pollea cada 800ms como fallback de reactividad. También escucha `window.addEventListener("storage")` y un evento custom `"local_services_updated"`, pero el interval es el que garantiza que siempre se sincronice.
- **Solución:** Es **intencional** — no "optimizar" quitando el interval. Sin él, los cambios a localStorage hechos en la misma pestaña (que no disparan el evento `storage`) no se reflejarían. En producción con Firebase real, esto no aplica — se usa `onSnapshot` que es instantáneo.

---

## Fotos fallan en Drive pero el servicio se guarda sin fotos en dev

- **Pasa cuando:** Estás desarrollando localmente, el enganche se registra exitosamente, pero los eventos no tienen fotos. La consola muestra `[resolverFotosConUrl] Drive falló en dev, guardando evento sin fotos`.
- **Causa real:** El flag `FOTOS_OPCIONALES_DEV=true` en las variables de entorno de functions permite que los eventos se guarden sin fotos cuando Google Drive no está configurado (falta el secret `GOOGLE_DRIVE_FOLDER_ID` o la Service Account no tiene acceso a Drive).
- **Solución:** Es **intencional** para no bloquear el desarrollo de UI. En producción, este flag no existe y las fotos son obligatorias (4-5 por evento). Si necesitás probar el upload real de fotos localmente:
  1. Configurar el secret: `firebase functions:secrets:set GOOGLE_DRIVE_FOLDER_ID`
  2. Compartir la carpeta de Drive con la Service Account
  3. Quitar `FOTOS_OPCIONALES_DEV=true` del entorno

---

## Geolocation timeout en interiores o con GPS débil

- **Pasa cuando:** El enganchador está adentro de un edificio o en una zona con señal GPS débil, y la captura de geo falla con "Tiempo de espera agotado al conectar con el GPS" después de 9 segundos.
- **Causa real:** `useGeolocation` usa `enableHighAccuracy: true` con un timeout de 9000ms. En interiores, el GPS puede tardar 15-30 segundos o directamente no resolver una posición precisa.
- **Solución:** El enganche no se bloquea por falta de geo — si falla, se registra con `{ lat: 0, lng: 0 }` como fallback. Esto es aceptable porque la geo es un dato complementario, no un bloqueante del flujo operativo. **No aumentar el timeout** a más de 9s porque el chofer está en la calle esperando y cada segundo cuenta en la experiencia.

---

## Timestamps aparecen como `null` justo después de crear un servicio

- **Pasa cuando:** Creás un servicio y en el frontend `creadoEn` aparece como `null` o `undefined` inmediatamente después.
- **Causa real:** `FieldValue.serverTimestamp()` es un sentinel — Firestore no le asigna un valor hasta que el write llega al servidor. Si leés el documento antes de que se confirme la escritura (ej: via `onSnapshot` con `hasPendingWrites: true`), el campo tiene valor `null` en el snapshot local.
- **Solución:** `parseFirestoreDate()` en `formatters.ts` ya maneja esto devolviendo `null` graciosamente. Los componentes que muestran fechas usan un fallback `"—"`. **No intentar generar un timestamp en el cliente como workaround** — el timestamp oficial siempre viene del servidor.

---

## Security Rules hacen un `get()` extra por cada request autenticada

- **Pasa cuando:** Ves en el dashboard de Firestore que hay muchas lecturas a la colección `usuarios/` que no parecen venir de tu código.
- **Causa real:** Las Security Rules usan `usuarioAutenticado()` que hace `get(/databases/.../usuarios/{uid})` para verificar el rol. Cada operación de lectura/escritura que pase por rules ejecuta esta lectura adicional. Es un costo conocido de tener roles en Firestore en vez de Custom Claims.
- **Solución:** Es **intencional** y aceptable para el volumen actual (decenas de choferes, no miles). Las lecturas de rules no se facturan como lecturas normales en el plan Blaze. Si el volumen escala significativamente, migrar a Custom Claims (ver `decisiones.md`).

---

## El `input[type=file]` con `capture="environment"` no fuerza cámara en todos los dispositivos

- **Pasa cuando:** En algunos Android con Chrome, el selector de fotos ofrece la galería además de la cámara, a pesar de que el componente de captura usa `accept="image/*" capture="environment"`.
- **Causa real:** El atributo `capture` es una sugerencia al navegador, no una orden. Chrome en Android respeta `capture="environment"` en la mayoría de dispositivos, pero algunos fabricantes (Samsung, Xiaomi) lo ignoran y muestran el chooser de apps.
- **Solución:** No hay fix universal. El atributo `capture="environment"` es lo más cercano que existe en web. Una PWA nativa o una app nativa resolverían esto, pero excede el alcance del MVP. **No intentar usar `getUserMedia` como reemplazo** — el flujo actual de `<input>` es más compatible y no requiere permisos de cámara persistentes.

---

## `npm run build` falla con `tsc` no encontrado

- **Pasa cuando:** Clonar el repo en una máquina nueva y correr `npm run build` sin haber instalado dependencias.
- **Causa real:** El script de build de functions usa `npx tsc`, que depende de que TypeScript esté instalado en algún `node_modules/` del monorepo.
- **Solución:** Correr `npm install` en la raíz del proyecto primero. El predeploy (`functions/scripts/predeploy.mjs`) tiene un fallback que intenta instalar automáticamente si no encuentra `tsc`, pero no siempre funciona en todos los OS.

---

## Deploy: `Could not find rules for the following storage targets: rules`

- **Pasa cuando:** Se ejecuta `firebase deploy --only storage:rules` (o similar con `:rules` en Storage).
- **Causa real:** A diferencia de Firestore (`firestore:rules`), **Storage no soporta** el filtro `storage:rules`. Firebase interpreta `rules` como nombre de un bucket target inexistente.
- **Solución:** Usar `firebase deploy --only storage` (sin `:rules`).

---

## Deploy: región function ≠ región del bucket Storage

- **Pasa cuando:** `A function in region us-central1 cannot listen to a bucket in region us-east1`.
- **Causa real:** El bucket `gruasbacar.firebasestorage.app` está en **us-east1**. El trigger `procesarFotoStorage` debe desplegarse en la **misma región**.
- **Solución:** En `functions/src/index.ts`, `onObjectFinalized` con `region: 'us-east1'`. Los callables HTTP pueden seguir en `us-central1`.

---

## Deploy: `We failed to modify the IAM policy for the project`

- **Pasa cuando:** Primer deploy de `procesarFotoStorage` (trigger Storage → Eventarc → Cloud Run).
- **Causa real:** Firebase intenta agregar roles a **service accounts de Google** (no al usuario). Falla con `403 Policy update access denied` si quien deploya no puede hacer `setIamPolicy` o la organización bloquea el cambio.
- **Solución:** El **Propietario** del proyecto debe asignar manualmente 4 roles en **3 service accounts**. Detalle completo en `docs/contexto/subida-fotos-storage.md` (sección IAM).
- **No confundir:** Dar todos los roles a `service-...@gs-project-accounts...` **no alcanza** — faltan Pub/Sub, Compute, **Eventarc** y **Firebase Storage** (cross-service rules).

---

## Deploy: `storage.buckets.get denied` (Eventarc)

- **Pasa cuando:** `procesarFotoStorage` no se crea; mensaje sobre Eventarc service account y validación del bucket.
- **Causa real:** `service-231607744664@gcp-sa-eventarc.iam.gserviceaccount.com` no puede leer metadata del bucket.
- **Solución (Owner):** Rol **Storage Legacy Bucket Reader** en esa cuenta. Ver `subida-fotos-storage.md` sección IAM extra A.

---

## Deploy: Cross-service Storage rules (firestore.get en storage.rules)

- **Pasa cuando:** Al deployar storage, Firebase pregunta *Grant the new role?* y falla con `403 Policy update access denied`.
- **Causa real:** `storage.rules` usa `firestore.get(...)` para validar `creadoPor`. La cuenta `gcp-sa-firebasestorage` necesita leer Firestore al evaluar rules.
- **Solución (Owner):** Rol **Cloud Datastore User** en `service-231607744664@gcp-sa-firebasestorage.iam.gserviceaccount.com`. Ver sección IAM extra B en `subida-fotos-storage.md`.
- **Nota:** Las rules pueden desplegarse igual (`released rules`); el riesgo es que la condición cross-service no aplique hasta otorgar el rol.

---

## Cosas que parecen rotas pero son a propósito

- **`storage.rules` + Storage en uso** — Desde jun 2025 Storage es buffer temporal de fotos; las rules restringen escritura al `creadoPor` del servicio. Drive sigue siendo archivo definitivo.
- **`isMock = false` hardcodeado** — No es una variable de entorno. Se cambia manualmente en `frontend/src/firebase.ts` cuando se necesita modo simulación. Es intencional que sea manual para no activarlo por accidente en producción.
- **`"DESENGANCHE" as any` en el mock de servicio.service.ts** — Es un cast forzado para evitar un error de tipos en el mock que usa strings donde el tipo espera `TipoEvento`. No arreglar — el mock no va a producción.
- **`fechaCreacion` en el tipo `Servicio`** — El comentario dice `// Alias for labs compatibility`. No borrarlo — el workspace `labs/gruas-bacar` lo usa.
- **El warning `Firestore has already been started...` en HMR** — Puede aparecer ocasionalmente a pesar de la guarda `globalThis`. Es inofensivo — Firestore ignora la reconexión duplicada.
- **`noUnusedLocals: false` y `noUnusedParameters: false` en el tsconfig del frontend** — Es intencional para no bloquear el desarrollo durante iteraciones rápidas. No "endurecer" esto sin consenso.
- **Los console.warn con `[tag]` en functions** — Son logging intencional para diagnóstico en Cloud Functions. No son errores a resolver. El formato `[nombreFuncion]` es para filtrar en Cloud Logging.
- **Subida de fotos vía Storage resumible** — El frontend sube en secuencia a Storage; el trigger procesa en Drive. Si una foto falla en staging, el operador reintenta desde la UI. Ver `subida-fotos-storage.md`.
