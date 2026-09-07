# De emulador a producción

El emulador sirve para **probar el código**. Pasar a producción es **desplegar ese código**. La base local **no se copia** a la nube.

Hay dos bases distintas:

| | Emulador | Producción |
|--|--|--|
| Dónde | Tu máquina (`127.0.0.1`) | Proyecto Firebase `gruasbacar` |
| Cómo se usa | `npm run emu` + `npm run dev` | `npm run ship` → [gruasbacar.web.app](https://gruasbacar.web.app) |
| Datos | Copia de prod (`npm run seed`) + lo que pruebes | Datos reales. No se tocan con el seed |

`test-gruasbacar.web.app` **no es un paso intermedio**. Usa la misma Firestore que producción (las actas de ese site se marcan `esTest`). Ver `docs/contexto/entorno-test.md`.

---

## Paso 1 — Levantar el emulador

Hace falta Java 11+. Desde la raíz del repo:

```bash
npm run emu
```

Compila `shared` + `functions` y arranca Auth, Firestore, Storage y Functions en local.

- UI del emulador: [http://localhost:4000](http://localhost:4000)
- Al salir, guarda el estado en `.emulator-data/` (no se commitea)
- Al arrancar de nuevo, reimporta esa carpeta

Dejá esta terminal abierta.

## Paso 2 — Datos locales (si hace falta)

Con el emulador **ya corriendo**:

```bash
npm run seed
```

Copia Firestore + Auth de producción → emulador (solo lectura de prod). Igual que `emu:seed` y `pull-prod`.

- Requiere `functions/src/auth/ServiceAccountKey.json` (para **leer** prod, no para escribir)
- En el emulador todos los usuarios Auth quedan con contraseña `Test1234!`
- No copia tokens FCM
- No hace falta todos los días: si `.emulator-data` ya tiene datos, `emu` los reusa

## Paso 3 — Frontend

Otra terminal:

```bash
npm run dev
```

Cinta cyan **EMULADOR LOCAL**. Entrá con un email de prod y `Test1234!`.

En Vite DEV el frontend no puede hablar con producción.

## Paso 4 — Implementar y probar

Orden habitual: tipos en `shared/` → Cloud Functions → frontend.

Si tocás `shared/` y las functions del emulador:

```bash
cd shared && npm run build
```

(reiniciar `emu` si hace falta para que functions tomen el cambio).

Probar el flujo de verdad en el emulador (no solo mock): enganche → traslado → desenganche si toca el core; roles; fotos con recarga de página; callables nuevas.

Antes de darlo por bueno:

```bash
npm run build
```

desde la raíz, sin errores.

### Si el emulador quedó raro

**No hay comando para vaciar la base.** No existe `vaciar-bd` ni `emu:clean`.

1. Parar `npm run emu` (Ctrl+C)
2. Borrar a mano la carpeta `.emulator-data` en la raíz del repo
3. `npm run emu` y, con el emulador arriba, `npm run seed`

---

## Paso 5 — Pasar a producción

Cuando está bien en local, se sube el **código**. Los datos de prueba del emulador se quedan en la máquina.

```bash
npm run ship
```

Preflight + build + hosting + functions + rules → producción.

Si no cambió todo:

| Qué tocaste | Comando |
|---|---|
| Solo UI | `npm run ship:hosting` |
| Solo Cloud Functions | `npm run ship:functions` |
| Solo rules / índices | `npm run ship:rules` |
| Todo | `npm run ship` |

### Cloud Function nueva

Después del **primer** deploy de esa function:

```bash
npm run fix-invokers
```

Si no, en producción da CORS 403.

### Verificar en prod

- App: [https://gruasbacar.web.app](https://gruasbacar.web.app)
- Console: [Firebase Console](https://console.firebase.google.com/project/gruasbacar)
- Functions: región `us-central1`

---

## Qué no hacer

- No hay `dev:live`: no desarrollar el frontend contra Firestore real.
- No hay `seed:prod`: el seed solo llena el emulador.
- No subir `.emulator-data` ni “pasar” actas de prueba a prod.
- No usar `test-gruasbacar.web.app` como si fuera el emulador: es la misma base que producción.
