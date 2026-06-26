# Convenciones de código

## Estilo

- **Formato:** Sin Prettier ni ESLint configurado formalmente. Se sigue indentación de 2 espacios, comillas dobles en JSX/TSX, comillas simples en imports puros TS.
- **Naming de archivos:**
  - Componentes y páginas → `PascalCase.tsx` (ej: `EnganchePage.tsx`, `FotoGuiada.tsx`, `ProtectedRoute.tsx`)
  - Hooks → `camelCase.ts` con prefijo `use` (ej: `useAuth.ts`, `useServicioActivo.ts`, `useCamera.ts`)
  - Servicios → `kebab-case` o `camelCase` + sufijo `.service.ts` (ej: `servicio.service.ts`, `foto.service.ts`, `auth.service.ts`)
  - Utilidades → `camelCase.ts` (ej: `compressImage.ts`, `formatters.ts`, `firebaseError.ts`)
  - Tipos compartidos → en `shared/src/types.ts`, re-exportados via `index.ts`
  - Archivos de contexto → `PascalCase.tsx` para el Provider, `kebab-case.ts` para la definición del Context (ej: `AuthContext.tsx` + `auth-context.ts`)
- **Naming de código:**
  - Interfaces y tipos → `PascalCase` (ej: `Servicio`, `EstadoServicio`, `IniciarEnganchePayload`)
  - Funciones y variables → `camelCase` (ej: `iniciarEnganche`, `patenteGruaParaServicio`)
  - Constantes de dominio → `UPPER_SNAKE_CASE` (ej: `DURACION_TURNO_MS`, `TIPO_FLOTA_OPTIONS`)
  - Enums como union types → `UPPER_SNAKE_CASE` strings (ej: `'ENGANCHADO' | 'EN_TRASLADO' | 'DESENGANCHADO' | 'ANULADO'`)
  - Componentes React → `PascalCase` función + `export default` (ej: `export default function App()`)

## Imports

Orden de imports (sin herramienta que lo enforce, pero se respeta por convención):

```ts
// 1. Librerías externas
import React, { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";

// 2. Paquete compartido (ruta absoluta via workspace alias)
import { Servicio, Foto, EstadoServicio } from "@gruasbacar/shared";

// 3. Módulos internos del proyecto (rutas relativas)
import { db, functions, isMock } from "../firebase";
import { servicioService } from "../services/servicio.service";
import { useAuth } from "../hooks/useAuth";
```

- **`@gruasbacar/shared`** es el alias del workspace para tipos compartidos frontend ↔ functions. Siempre importar tipos de ahí, nunca duplicarlos.
- En `functions/`, los imports de `shared` usan el mismo alias de workspace.

## Patrones que SÍ usamos

- **Firebase Callable Functions** para toda la comunicación frontend → backend. No hay API REST custom. Patrón:
  ```ts
  const cloudFn = httpsCallable<RequestType, ResponseType>(functions, "nombreDeLaFunction");
  const res = await cloudFn(data);
  return res.data;
  ```
- **Servicios como objetos literales** en frontend (`export const servicioService = { ... }`), no clases.
- **Funciones puras exportadas** en `shared/` para lógica de dominio (normalización de roles, validación de turnos, etc.). Sin estado, sin side effects.
- **Timestamps de servidor** para toda medición de tiempo en el backend. El cliente NO genera timestamps oficiales.
- **Modo mock/simulación** en frontend controlado por `isMock` flag global. Cada servicio tiene ramas `if (!isMock && app)` para producción y fallback local.
- **Context + Hook** para estado global: un `Context` define la interfaz, un `Provider` la implementa, un `useX` hook la consume con validación.
- **Componentes agrupados por dominio** dentro de `components/`: `auth/`, `enganche/`, `traslado/`, `desenganche/`, `admin/`, `shared/`.
- **Middleware de auth en functions** con helpers `verificarAuth`, `verificarAdmin`, `verificarGestionActas`, `verificarOperador` que extraen y validan el contexto de autenticación.
- **Compresión de fotos en cliente** (canvas resize, JPEG 0.7, max 1200px) antes de enviar base64 al backend.
- **Iconos con lucide-react**, no Material Icons ni otro paquete.
- **Animaciones con motion** (Framer Motion), no CSS puro para transiciones complejas.
- **Tailwind CSS v4** para estilos. No hay CSS modules ni styled-components.

## Patrones PROHIBIDOS

- **Nada de `any` innecesario en TS** — Si bien hay `any` en el codebase actual (deuda técnica), no agregar nuevos. Usar tipos explícitos o `unknown` + narrowing.
- **Nada de lógica de negocio en componentes** — Los componentes llaman a servicios (`services/`) o ejecutan hooks. La lógica pesada va en `services/` o en `shared/`.
- **Nada de timestamps del cliente** como fuente oficial — Los timestamps de verdad vienen de `FieldValue.serverTimestamp()` en las Cloud Functions.
- **Nada de API routes custom** — Toda comunicación es via Firebase Callable Functions (`onCall`).
- **Nada de Firebase Storage** — Las fotos van a Google Drive via Service Account. No usar `firebase/storage` para fotos.
- **Nada de ORM ni capa de abstracción sobre Firestore** — Se usa el SDK directo.
- **Nada de edición de servicios** — Un servicio solo avanza de estado o se anula. No se modifican campos retroactivamente (excepción: admin y supervisor con `actualizarServicio` para correcciones).
- **No duplicar tipos de `shared/`** — Si el tipo existe en `@gruasbacar/shared`, importarlo. No redefinirlo en frontend o functions.
- **No crear roles nuevos** sin actualizar `shared/src/types.ts` — Los roles son `ADMIN | SUPERVISOR | ENGANCHADOR | CHOFER` (CHOFER es legacy equivalente a ENGANCHADOR). Agregar helpers de permiso en `shared/` si el rol tiene reglas de acceso propias.

## TypeScript

- **Strict mode habilitado** (`"strict": true` en tsconfig)
- **Target:** ES2020
- **JSX:** `react-jsx` (no `React.createElement`)
- **Union types** en vez de enums de TS (ej: `type EstadoServicio = 'ENGANCHADO' | 'EN_TRASLADO' | ...`)
- **Payload interfaces** con sufijo `Payload` para datos que viajan a Cloud Functions (ej: `IniciarEnganchePayload`, `AnularServicioPayload`)
- **`Omit<>` para derivar tipos** cuando se envían datos parciales (ej: `Omit<Foto, 'url' | 'driveFileId'>[]`)

## Estructura de Functions (backend)

- **Entry point en `index.ts`** — Cada Cloud Function se exporta como `export const nombreFn = onCall(...)`.
- **Lógica en `services/`** — El `index.ts` solo orquesta: valida auth, delega a servicio, retorna `{ ok: true }`.
- **Errores como `HttpsError`** — En functions, los errores se lanzan como `HttpsError` con código y mensaje descriptivo para el cliente.
  ```ts
  throw new HttpsError('failed-precondition', 'El servicio ya fue anulado.');
  ```
- **Secrets via `defineSecret()`** — Las credenciales (ej: Google Drive folder ID) se manejan con Firebase Secrets, no `.env` en functions.

## Estructura de Frontend

- **Router:** `react-router-dom` con `HashRouter` (para compatibilidad con Firebase Hosting SPA).
- **Rutas protegidas:** `<ProtectedRoute>` + `<RoleGuard allowedRole="...">` como wrappers.
- **Páginas en `pages/`** — Cada página es un archivo, no un directorio. Sufijo `Page.tsx`.
- **Hooks custom** retornan objetos, no arrays. El hook valida que esté dentro del Provider:
  ```ts
  export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
      throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
  }
  ```

## Tests

- **No hay framework de tests configurado** actualmente (ni Jest, ni Vitest, ni Playwright).
- **Qué se debería testear** si se implementa:
  - Funciones puras de `shared/src/types.ts` (normalización, validación de turnos, roles)
  - Servicios de `functions/src/services/` (lógica de transiciones de estado)
  - Middleware de auth
- **Dónde irían:** `__tests__/` al lado de cada módulo, o `tests/` en la raíz de cada workspace.

## Commits

- **Formato:** No hay convención formal. Los mensajes son descriptivos en español, estilo libre.
- **Sugerencia a adoptar:** Conventional Commits en español:
  ```
  feat: agregar flujo de asignación diaria
  fix: corregir validación de legajo duplicado
  refactor: extraer lógica de turnos a shared
  docs: documentar convenciones de código
  ```

## Variables de entorno

- **Frontend:** Prefijo `VITE_` para variables accesibles en el cliente. Se configuran en `.env` / `.env.local`.
- **Functions:** Secrets con `defineSecret()`. No hay `.env` en el directorio de functions.
- **Ejemplo `.env` frontend:**
  ```
  VITE_FIREBASE_API_KEY=...
  VITE_FIREBASE_AUTH_DOMAIN=...
  VITE_FIREBASE_PROJECT_ID=...
  VITE_USE_EMULATORS=true
  ```
