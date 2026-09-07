# Flujo de trabajo

---

## Antes de tocar nada

1. **Leer `docs/contexto/decisiones.md`** — Para no reabrir algo que ya se decidió. Si la decisión te parece incorrecta, discutilo antes de codear.
2. **Leer `docs/contexto/arquitectura.md`** — Para saber dónde va cada cosa y qué NO existe en el proyecto.
3. **Verificar que compila** — Correr `npm run build` desde la raíz antes de arrancar. Si ya está roto, no agregues más encima.
4. **Levantar emuladores si vas a tocar functions** — `npm run emulators` desde la raíz. Necesita Java instalado.

---

## Entorno de desarrollo

Hay **dos bases distintas**. El emulador es un Firestore/Auth/Storage en tu máquina (`127.0.0.1`). Producción es el proyecto `gruasbacar` en Google Cloud. No se mezclan: el frontend de `npm run dev` no puede hablar con producción.

Paso a paso de una funcionalidad (emu → prod): `emu-a-prod.md`.

`test-gruasbacar.web.app` **no** es un sandbox: usa la misma base que producción (ver `docs/contexto/entorno-test.md`).

### Flujo del emulador

Hace falta Java 11+. El estado local vive en `.emulator-data/` (no se commitea). `npm run emu` lo importa al arrancar y lo exporta al salir.

**Trabajo diario**

```bash
# Terminal 1 — emulador (Auth, Firestore, Storage, Functions)
npm run emu

# Terminal 2 — frontend (siempre contra localhost)
npm run dev
```

UI del emulador: `http://localhost:4000`. En la app vas a ver una cinta cyan **EMULADOR LOCAL**.

**Datos (solo con el emulador ya corriendo)**

```bash
npm run seed         # igual que emu:seed y pull-prod
```

Copia Firestore + Auth de producción → emulador. Requiere `functions/src/auth/ServiceAccountKey.json` (solo para **leer** prod). **No escribe** en producción. No copia tokens FCM. En el emulador todos los usuarios Auth usan la contraseña `Test1234!`.

No hace falta sembrar todos los días: si `.emulator-data` ya tiene datos, `emu` los reimporta.

> **Importante — no hay comando para vaciar la base.**  
> No existe `vaciar-bd`, `emu:clean` ni ningún script que borre Firestore/Auth.  
> Si el emulador quedó raro (datos incoherentes, Auth desfasado, seed a medias):
>
> 1. Parar `npm run emu` (Ctrl+C).
> 2. Borrar a mano la carpeta `.emulator-data` en la raíz del repo.
> 3. Volver a `npm run emu` y, con el emulador arriba, `npm run seed`.

### Scripts Admin SDK
Un script no elige destino por flag. O es de emulador (`initEmulatorAdmin`, rechaza `--prod`) o es de producción (`initProdAdmin` / `--prod`, rechaza `--emulator` y variables de emulador).

---

## Para hacer un cambio

### 1. Identificar qué workspace(s) toca el cambio

| Cambio | Workspace(s) afectado(s) |
|---|---|
| Nuevo tipo o interfaz compartida | `shared/` → luego rebuild |
| Nueva Cloud Function | `functions/` + posiblemente `frontend/services/` |
| Nuevo componente o página | `frontend/` |
| Nuevo campo en una entidad | `shared/` + `functions/` + `frontend/` (los tres) |

### 2. Si tocás `shared/`, rebuild antes de probar

`shared/` se compila a `shared/dist/`. Frontend lo usa via alias de Vite (no necesita rebuild para dev), pero functions sí:

```bash
cd shared && npm run build
```

### 3. Implementar el cambio

- **Tipos primero** — Si el cambio involucra un tipo nuevo o modificado, empezar por `shared/src/types.ts`.
- **Backend segundo** — Si hay lógica nueva en Cloud Functions, implementarla en `functions/src/services/` y exportarla en `functions/src/index.ts`.
- **Frontend último** — Componentes, servicios, hooks. El frontend es consumidor de los tipos y las functions.

### 4. Si agregás una Cloud Function nueva

1. Crear la lógica en `functions/src/services/{servicio}.service.ts`
2. Exportar la function en `functions/src/index.ts` con `onCall(callable, ...)` y **envolver el handler con `withHttpsErrorHandling('nombreDeLaFunction', async (request) => {...})`** (de `functions/src/utils/callableHandler.ts`) — garantiza que los errores lleguen al frontend como `HttpsError` con mensaje útil
3. Agregar middleware de auth al inicio: `verificarAuth`, `verificarAdmin`, `verificarGestionActas`, o `verificarOperador`
4. Crear el servicio frontend en `frontend/src/services/` que llame a `httpsCallable(functions, "nombreDeLaFunction")`
5. Después del primer deploy, ejecutar `npm run fix-invokers` para habilitar invocación pública en Cloud Run (sino da error de CORS)

### 5. Si agregás una entidad nueva

1. Definir la interfaz en `shared/src/types.ts`
2. Re-exportar en `shared/src/index.ts`
3. Crear las Security Rules en `firestore.rules`
4. Crear el servicio frontend en `frontend/src/services/{entidad}.service.ts`
5. Si necesita ABM, crear el componente en `frontend/src/components/admin/`

---

## Antes de dar algo por terminado

### Compilación (obligatorio)

- [ ] **`npm run build`** desde la raíz pasa sin errores (compila shared → functions → frontend)
- [ ] Sin errores de TypeScript en ninguno de los tres workspaces

### Verificación funcional

- [ ] El cambio funciona en el **emulador local** (no solo en mock)
- [ ] Si tocaste el **flujo core** (enganche → traslado → desenganche), probarlo completo
- [ ] Si tocaste **auth o roles**, verificar que admin, supervisor y enganchador siguen funcionando
- [ ] Si tocaste **captura de fotos**, probar recarga de página durante el paso de fotos (debe restaurar borrador)
- [ ] Si tocaste **Cloud Functions**, verificar que responden correctamente via `httpsCallable`

### Limpieza de código

- [ ] No quedan `console.log` de debug (sí está bien `console.error` y `console.warn` intencionales)
- [ ] No se agregaron `any` nuevos — si fue necesario temporalmente, dejá un `// TODO: tipar correctamente`
- [ ] No se duplicaron tipos que ya existen en `@gruasbacar/shared`
- [ ] Si se agregó un campo a una entidad, se actualizó `shared/src/types.ts`

### Compatibilidad mobile

- [ ] Si el cambio es de UI, verificar en viewport mobile (Chrome DevTools → 375px)
- [ ] Los botones y inputs son suficientemente grandes para dedo (min 44px)
- [ ] No hay scroll horizontal no deseado

---

## Deploy

### Deploy completo (hosting + functions)
```bash
npm run deploy
```
Esto ejecuta en orden:
1. `shared/` → compila TypeScript
2. `functions/` → predeploy empaqueta shared en `vendor/`, compila TS, instala deps de producción
3. `frontend/` → `tsc && vite build` genera `frontend/dist/`
4. `firebase deploy` → sube hosting + functions + rules

### Deploy solo functions (más rápido)
```bash
npm run deploy:functions
```
Ejecuta el predeploy (`functions/scripts/predeploy.mjs`) y despliega solo las Cloud Functions.

### Después del primer deploy de una function nueva
```bash
npm run fix-invokers
```
Script PowerShell que habilita invocación pública (`allUsers` → `roles/run.invoker`) en cada Cloud Function v2. Sin esto, las Callable Functions devuelven 403 y el navegador muestra error de CORS.

### URL de producción
- **Hosting:** `https://gruasbacar.web.app`
- **Firebase Console:** `https://console.firebase.google.com/project/gruasbacar`
- **Región de Functions:** `us-central1`

---

## Scripts útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Frontend en dev **contra emuladores** (no toca prod) |
| `npm run seed` / `emu:seed` / `pull-prod` | Copia de solo lectura: producción → emulador (sin tokens FCM) |
| `npm run emu` / `npm run emulators` | Compila shared + functions y levanta emuladores Firebase. Persistencia: `.emulator-data/` |
| `npm run build` | Compila los tres workspaces en orden |
| `npm run deploy` | Build completo + deploy a Firebase |
| `npm run deploy:functions` | Predeploy + deploy solo Cloud Functions |
| `npm run sync-usuarios` | Limpia docs huérfanos Auth ↔ Firestore (producción) |

### Backup de Firestore en Drive

Todos los días a las **03:00 (Argentina)** la function `backupFirestoreDiario` exporta las colecciones (incluye `eventos` y `versiones` de cada acta, más el listado de Auth **sin contraseñas**) y sube un `.json.gz` privado a:

`Backups/{YYYY-MM-DD}/gruasbacar-firestore-….json.gz`

junto con un `manifest.json`. Las carpetas de más de **30 días** van a la papelera de Drive. Un admin puede disparar el mismo backup a mano con la callable `ejecutarBackupFirestore`. No incluye fotos: esas ya viven en Drive.

### Importar actas desde fotos de Drive

Si hay carpetas de fotos en Drive (fecha, legajo, patente, n° de acta) pero no el documento en Firestore:

```bash
node scripts/importar-actas-desde-drive.mjs --scan --desde 2026-07-01 --hasta 2026-07-31
node scripts/importar-actas-desde-drive.mjs --csv .backups/actas-drive-faltantes.csv
node scripts/importar-actas-desde-drive.mjs --csv .backups/actas-drive-faltantes.csv --write
```

No re-sube fotos: enlaza los `driveFileId` existentes. Completá hora, chofer y grúa en el CSV si el script no los infiere del turno de ese día. La ubicación queda como **PENDIENTE**.

---

## Errores comunes y cómo resolverlos

| Síntoma | Causa probable | Solución |
|---|---|---|
| CORS error en producción al llamar una function | La function no tiene invoker público en Cloud Run | `npm run fix-invokers` |
| `Cannot find module '@gruasbacar/shared'` en functions | `vendor/shared` no existe o está desactualizado | `npm run deploy:functions` (el predeploy lo reconstruye) |
| Tipos desactualizados en frontend | `shared/` se modificó pero no se recompiló | Reiniciar Vite (el alias apunta al source, pero a veces necesita refresh) |
| Emuladores no arrancan | Java no instalado o puertos ocupados | Verificar Java 11+. Matar procesos en puertos 8080, 9099, 5001, 4000 |
| Fotos no se suben a Drive | Secret `GOOGLE_DRIVE_FOLDER_ID` no configurado | `firebase functions:secrets:set GOOGLE_DRIVE_FOLDER_ID` con el ID de la carpeta raíz en Drive |
| `The service account does not have permission` | Service Account sin acceso a la carpeta de Drive | Compartir la carpeta de Drive con el email de la Service Account |
| `servicioActivoId` quedó colgado | El enganchador cerró la app durante un servicio | Admin o supervisor anula el servicio, o el enganchador usa "liberar servicio" desde inicio |
| Cambios de rol SUPERVISOR no aplican en producción | Firestore rules o functions sin desplegar | `firebase deploy --only firestore:rules,functions` |
