# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sistema web mobile-first para registrar y controlar el ciclo de vida de enganches de autos mal estacionados por grúas de BACAR. Mide tiempos de cada etapa (enganche, traslado, desenganche). El operador de campo usa la app en su celular durante el servicio.

## Build & verification commands

```bash
# Full build (shared → functions → frontend) — run from repo root
npm run build

# Build individual workspaces
cd shared && npm run build          # must rebuild after changing shared types
cd functions && npm run build       # compiles to functions/lib/
cd frontend && npx tsc --noEmit     # type-check only (no output)

# Deploy
npm run ship                        # preflight + build + deploy all (hosting + functions + rules)
npm run ship:functions              # deploy only Cloud Functions
npm run ship:hosting                # deploy only hosting
npm run ship:rules                  # deploy only Firestore/Storage rules
npm run ship:test                   # deploy test site (test-gruasbacar.web.app)
npm run fix-invokers                # REQUIRED after first deploy of a new Cloud Function (enables public invocation on Cloud Run)

# Emulators (requires Java 11+)
npm run emu                         # build shared+functions, start Firebase emulators (base LOCAL)
npm run seed                        # copia producción → emulador (único seed; alias: emu:seed, pull-prod)
npm run dev                         # frontend → emulators (will not talk to prod)
```

**Importante:** no hay comando para vaciar la base. Si el emulador quedó raro, parar `emu`, borrar a mano `.emulator-data/` en la raíz del repo, y volver a `npm run emu` + `npm run seed`.

```bash
# Other
npm run preflight                   # pre-ship checks
```

## Architecture

**Monorepo** with npm workspaces: `shared/`, `functions/`, `frontend/`.

| Workspace | Stack | Purpose |
|---|---|---|
| `shared/` | TypeScript (pure) | Types, interfaces, domain logic. Imported as `@gruasbacar/shared` |
| `functions/` | Firebase Functions v2 (Node 20) | All backend logic via `onCall` Callable Functions |
| `frontend/` | React 18 + Vite + Tailwind CSS v4 | SPA mobile-first, HashRouter |

**Data flow:** Frontend → Firebase Callable Functions → Firestore. No REST API. No ORM. No Firestore direct writes for `servicios/` (Security Rules block it; only Admin SDK in Functions writes).

**Photos:** Captured on device → compressed client-side (JPEG 0.7, max 1200px) → uploaded to Firebase Storage (resumable) → trigger `procesarFotoStorage` moves to Google Drive → staging confirmed via `fotosStaging` subcollection. Drive is the permanent archive; Storage is a temporary buffer.

**Auth:** Firebase Auth (email/password). Roles stored in Firestore `usuarios/{uid}.roles[]`, not Custom Claims. Always use `esAdmin(roles)` / `esOperador(roles)` from shared — never `roles.includes('ADMIN')` (misses SUPERADMIN inheritance).

### Service state machine

```
ENGANCHADO → EN_TRASLADO → DESENGANCHADO
     ↓               ↓
  ANULADO         ANULADO
```

Transitions happen only via Cloud Functions with server timestamps.

### Key files

- `shared/src/types.ts` — All shared types, role helpers, domain logic
- `functions/src/index.ts` — All Cloud Function exports
- `functions/src/services/servicio.service.ts` — Core service lifecycle (enganche, traslado, desenganche, anulación)
- `functions/src/utils/validators.ts` — Backend validation helpers
- `functions/src/utils/callableHandler.ts` — `withHttpsErrorHandling` wrapper (all `onCall` must use it)
- `frontend/src/context/AuthContext.tsx` — Global auth state, `servicioActivoId` management
- `frontend/src/hooks/useServicioActivo.ts` — Real-time listener for active service
- `frontend/src/services/fotoStorage.service.ts` — Resumable photo upload to Storage
- `frontend/src/services/fotoCache.service.ts` — IndexedDB photo draft persistence

## Constraints

- **No `onSnapshot` on user docs** — Firestore cost. Use notifications, light polling, or refresh on navigation instead.
- **No dev servers from Claude** — The user tests manually. Don't start dev servers or touch `.env.local`.
- **Server timestamps only** — Never generate official timestamps on the client. `FieldValue.serverTimestamp()` in Cloud Functions.
- **No direct Firestore writes for `servicios/`** — All mutations go through Cloud Functions.
- **Icons: lucide-react only.** Animations: motion (Framer Motion). Styles: Tailwind CSS v4 utility classes.
- **All `onCall` handlers must use `withHttpsErrorHandling`** wrapper.
- **Validate strings in backend** — Use `validarString(valor, campo, maxLength)` / `validarStringOpcional(...)` from `functions/src/utils/validators.ts`.
- **`numeroInfraccion` is auto-generated** — Never add inputs for acta numbers in forms.

## When changing shared types

1. Edit `shared/src/types.ts`, re-export from `shared/src/index.ts`
2. Run `cd shared && npm run build`
3. Frontend picks it up via Vite alias (may need restart). Functions needs `shared/dist/` rebuilt.
4. For deploy: `npm run ship:functions` runs predeploy that copies shared to `functions/vendor/shared/` automatically.

## When adding a new Cloud Function

1. Logic in `functions/src/services/{name}.service.ts`
2. Export in `functions/src/index.ts`: wrap with `withHttpsErrorHandling('name', handler)` + auth middleware (`verificarAuth`, `verificarAdmin`, `verificarGestionActas`, or `verificarOperador`)
3. Frontend service in `frontend/src/services/` calling `httpsCallable(functions, "name")`
4. After first deploy: `npm run fix-invokers` (without this, CORS 403 in production)

## Notifications system

- `shared/src/notificaciones.ts` — `TipoNotificacion` union type
- `functions/src/services/notification.service.ts` — `crearNotificacion()`, `TIPOS_CON_PUSH` set (types that trigger push)
- Dedup via `claveDedup` field on notifications

## Roles

| Role | Access |
|---|---|
| `SUPERADMIN` | Everything ADMIN can do + manage admins, only one who can assign SUPERADMIN |
| `ADMIN` | Fleet ABM, users, dashboards, edit/annul all actas |
| `SUPERVISOR` | Read-only monitoring dashboard, full historial, edit/annul actas. No fleet config, no field ops |
| `ENGANCHADOR` | Field operations (enganche/traslado/desenganche), own actas |
| `CHOFER` | Legacy equivalent of ENGANCHADOR |

Multi-role supported. Helpers in `shared/src/types.ts`: `esAdmin()`, `esSuperAdmin()`, `esOperador()`, `esSupervisor()`, `puedeGestionarActas()`.

## Planes de mejora

Los planes están en `docs/planes/*.md` (01 al 12). Consultarlos antes de proponer cambios estructurales.

Estado:
- **01** Trazabilidad dupla — IMPLEMENTADO
- **02** Auto-provisión perfil — IMPLEMENTADO
- **03** Validar grúa/corralón backend — IMPLEMENTADO
- **04** Validar liberarServicioHuérfano — IMPLEMENTADO
- **05** Auth en obtenerDatosIniciales — IMPLEMENTADO
- **06** Transaccionar evento enganche — IMPLEMENTADO
- **07** IdentificadorCompuesto inmutable — IMPLEMENTADO
- **08** Migración rol→roles, fechaCreacion→creadoEn — IMPLEMENTADO
- **09** ABMs flota a Cloud Functions — PENDIENTE (mejora)
- **10** Colección turnos (historial asignaciones) — IMPLEMENTADO
- **11** Señalización cambios usuario — PENDIENTE (mejora)
- **12** Eliminar catálogo de duplas — PENDIENTE (mejora, post-piloto)

## Deeper documentation

- `docs/contexto/arquitectura.md` — Full data model, Firestore schema, routes, permissions
- `docs/contexto/decisiones.md` — Architectural decisions with rationale
- `docs/contexto/convenciones.md` — Code conventions, patterns, import order
- `docs/contexto/flujo-de-trabajo.md` — Dev workflow, deploy process, common commands
- `emu-a-prod.md` — Paso a paso: emulador → probar → `ship` a producción
- `docs/contexto/errores-conocidos.md` — Known gotchas that save debug time
- `docs/contexto/glosario.md` — Domain glossary and entity definitions
- `docs/contexto/entorno-test.md` — Test environment (test-gruasbacar.web.app)
- `docs/contexto/subida-fotos-storage.md` — Photo upload pipeline details
