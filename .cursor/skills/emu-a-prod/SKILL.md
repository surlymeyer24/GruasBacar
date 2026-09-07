---
name: emu-a-prod
description: >-
  Protocolo de autorización por paso para el flujo emulador y promoción de código
  en gruasBacar. Usar cuando el usuario pida seed, pull-prod, traer datos de
  producción al emulador, levantar emu, npm run dev, resetear .emulator-data,
  build, ship, ship:test, o mencione emu-a-prod. Datos solo prod → emulador.
  Nunca escribir producción. Especificar cada acción y esperar autorización.
---

# Protocolo emu-a-prod

Fuente de verdad del flujo: `emu-a-prod.md` (raíz). Complemento: `docs/contexto/flujo-de-trabajo.md`, `docs/contexto/entorno-test.md`.

El usuario nombra el **paso**. El agente responde con la **especificación** y espera. No ejecutar en el mismo turno en que se especifica.

## Invariantes (no negociables)

1. **Dos mundos.** Emulador = `127.0.0.1`. Producción = proyecto Firebase `gruasbacar`. No se mezclan.
2. **Datos unidireccionales: prod → emulador.** Nunca emulador → prod. No hay `seed:prod`.
3. **Sin potestad sobre producción.** Este flujo no es dueño de la base real ni de actas reales. No asumir responsabilidad de prod.
4. **Autorización por acción.** Cada comando, borrado o script se escribe en el mensaje. Un sí a otro paso no autoriza este.
5. **Cero pérdida por accionar propio.** Si hay duda de corrección o de riesgo → detener, proponer backup, esperar.
6. **Test hosting no es emu.** `test-gruasbacar.web.app` usa la **misma** Firestore que prod.

## Plantilla obligatoria (un paso por mensaje)

```markdown
## Paso: [nombre en el lenguaje del usuario]

**Qué implica**
- [efecto concreto: qué se lee, qué se escribe, dónde]

**Destino**
- Emulador | Solo lectura de prod | Código en el proyecto real (fuera de potestad de datos)

**Riesgo**
- [qué se puede perder o pisar; si toca prod, decirlo sin eufemismos]

**Qué puede fallar**
- [precondiciones, errores típicos, síntomas]

**Mitigación (opcional)**
- ¿Querés que proponga o ejecute algo antes? (ej. backup, verificar que emu está arriba)
- [una o dos opciones concretas, no un menú largo]

**Acción a autorizar**
- Comando o pasos exactos, copiables, sin flags extra
- Qué NO se va a hacer en esta acción

¿Autorizás que desarrolle **esta** acción? Respondé sí / no (o cambiá el alcance). Hasta entonces no ejecuto nada.
```

Después de un **sí** claro a esa acción: ejecutar solo lo autorizado, informar resultado, no encadenar el paso siguiente sin nueva especificación.

## Mapa pedido → paso

| Pedido típico | Paso | Acción (tras sí) |
|--|--|--|
| Levantá el emulador | 1 | `npm run emu` (Java 11+). Dejar terminal abierta. UI `http://localhost:4000`. Preferir que lo corra el usuario. |
| Traeme prod al emulador / seed / pull-prod | 2 | Emulador **ya corriendo**. `npm run seed` (= `emu:seed` = `pull-prod`). |
| Frontend local | 3 | Otra terminal: `npm run dev`. Cinta cyan EMULADOR LOCAL. Clave emu: `Test1234!`. |
| Probar / build | 4 | Probar flujo real en emu. Si tocaste `shared/`: rebuild. Cierre: `npm run build` en raíz. |
| Emu raro / reset local | 4b | Parar emu → borrar a mano `.emulator-data` → `emu` → `seed`. No existe vaciar-bd. |
| Ship / prod | 5 | **Especificar solamente.** Sube **código**, no datos del emu. Ver sección potestad. |

## Paso 2 — seed (detalle experto)

- Lee Firestore + Auth de **prod**; escribe **solo** emulador.
- `scripts/pull-prod.mjs` rechaza `--prod`.
- Requiere `functions/src/auth/ServiceAccountKey.json` (leer prod, no escribir).
- Colecciones: `usuarios`, `gruas`, `corralones`, `duplas`, `servicios` (+ subcols `eventos`, `fotosStaging`, `versiones`).
- No copia tokens FCM. Auth local: password `Test1234!`.
- **Pisa** el Firestore/Auth ya cargado en el emulador. No pisa prod.
- Falla si emu no está arriba, si falta la key, o si Java/emu se cayó a mitad.

No hace falta seed todos los días: `emu` reimporta `.emulator-data`.

## Backup

Si hay duda, o el pedido roza prod (ship, scripts `--prod`, reset agresivo):

**Acción aparte (también con plantilla):** `npm run backup` → lectura de prod a `.backups/`. No escribe la base. Sigue requiriendo autorización.

No uses backup como permiso encubierto para después escribir prod.

## Fuera de potestad / prohibido ejecutar

**Datos hacia prod — rechazar siempre** (aunque el usuario lo pida “para recuperar”):

- `scripts/restore-collections-to-prod.mjs`
- Cualquier “pasar el emu a la nube”, actas de prueba a prod, `.emulator-data` al repo o a Firebase
- `vaciar-bd`, `emu:clean`, `seed:prod`, `dev:live`
- `sync-usuarios` / `migrate-*` / `import-drive-actas` con `--prod`

**Código en el proyecto real** (`npm run ship`, `ship:hosting|functions|rules`, `deploy`, `fix-invokers`, `ship:test`):

- Este agente **no es responsable** de producción.
- Podés **especificar** el paso 5 (qué comando, que no copia datos del emu, function nueva → `fix-invokers` o CORS 403, test site = misma base).
- **No ejecutar** salvo que el usuario autorice el **comando exacto** y confirme que entiende que despliega al proyecto `gruasbacar`. Si dudás, no lo corras; sugerí backup y que lo ejecute él.

`ship:test` no es un entorno seguro: mismas Functions/Firestore que prod; actas `esTest`.

## Servidores

No tocar `.env.local`. No asumir que `emu`/`dev` ya corren: verificar o preguntar. Procesos largos: el usuario en sus terminales, salvo que autorice explícitamente arrancarlos acá.

## Qué no hacer en la respuesta

- No encadenar “después corro el seed y el ship”.
- No suavizar “es solo un deploy”.
- No improvisar scripts nuevos para “copiar a prod”.
- No borrar `.emulator-data` sin autorización de **ese** borrado.
