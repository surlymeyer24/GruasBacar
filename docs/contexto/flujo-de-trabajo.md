# Flujo de trabajo

---

## Antes de tocar nada

1. **Leer `docs/contexto/decisiones.md`** — Para no reabrir algo que ya se decidió. Si la decisión te parece incorrecta, discutilo antes de codear.
2. **Leer `docs/contexto/arquitectura.md`** — Para saber dónde va cada cosa y qué NO existe en el proyecto.
3. **Verificar que compila** — Correr `npm run build` desde la raíz antes de arrancar. Si ya está roto, no agregues más encima.
4. **Levantar emuladores si vas a tocar functions** — `npm run emulators` desde la raíz. Necesita Java instalado.

---

## Entorno de desarrollo

### Levantar el frontend (solo UI)
```bash
npm run dev          # desde la raíz (alias de cd frontend && npm run dev)
```
Abre en `http://localhost:5173`. Si `isMock = true` en `frontend/src/firebase.ts`, funciona sin backend.

### Levantar todo (frontend + emuladores Firebase)
```bash
# Terminal 1: emuladores (Auth, Firestore, Storage, Functions)
npm run emulators

# Terminal 2: frontend apuntando a emuladores
# Asegurate de tener VITE_USE_EMULATORS=true en frontend/.env.local
npm run dev
```
Emulador UI en `http://localhost:4000`. Functions en `http://localhost:5001`.

### Seed de datos de prueba
```bash
npm run seed:emulator    # carga grúas, corralones, duplas y usuarios de prueba en los emuladores
npm run seed             # carga en producción (requiere ServiceAccountKey.json)
```
Credenciales de prueba:
- Admin: `admin@bacar.com` / `Admin123!`
- Enganchador: `chofer@bacar.com` / `Chofer123!`

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
2. Exportar la function en `functions/src/index.ts` con `onCall(callable, ...)`
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
| `npm run dev` | Levanta frontend en dev (Vite) |
| `npm run emulators` | Compila shared + functions y levanta emuladores Firebase |
| `npm run build` | Compila los tres workspaces en orden |
| `npm run deploy` | Build completo + deploy a Firebase |
| `npm run deploy:functions` | Predeploy + deploy solo Cloud Functions |
| `npm run seed` | Carga datos iniciales en Firestore producción |
| `npm run seed:emulator` | Carga datos iniciales en emuladores locales |
| `npm run sync-usuarios` | Sincroniza usuarios de Auth → Firestore |
| `npm run sync-usuarios:emulator` | Idem en emuladores |
| `npm run fix-invokers` | Habilita invocación pública en Cloud Functions v2 |

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
