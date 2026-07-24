# Entorno de prueba (test-gruasbacar)

Misma Firestore / Auth / Functions que producción. Las actas creadas desde el site de test se marcan con `esTest: true` y **no aparecen** en historial, reportes ni KPIs de producción.

## Setup (una sola vez)

1. En Firebase Console → Hosting → **Add another site** → ID `test-gruasbacar`
2. Aplicar targets (si `.firebaserc` aún no los tiene):

```bash
firebase target:apply hosting production gruasbacar
firebase target:apply hosting test test-gruasbacar
```

3. Deploy de functions (incluye persistir `esTest`) e índices:

```bash
npm run ship:functions
npm run ship:rules
```

## Deploy del site de test

```bash
npm run ship:test
```

URL: https://test-gruasbacar.web.app

El build inyecta `VITE_ES_TEST=true`. Vas a ver una cinta ámbar “ENTORNO DE PRUEBA”.

## Comportamiento

| | Producción (`gruasbacar.web.app`) | Test (`test-gruasbacar.web.app`) |
|--|--|--|
| Actas nuevas | sin `esTest` | `esTest: true` |
| Listados / KPIs | ocultan `esTest` | muestran todas (badge TEST) |
| Banner | no | sí |

## Limitación

Hay un solo `servicioActivoId` por usuario. Si iniciás un enganche en test, hay que terminarlo (o liberarlo) antes de usar producción con el mismo usuario; el backend bloquea un segundo servicio activo.
