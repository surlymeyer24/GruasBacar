# 05 — Agregar verificarAuth a obtenerDatosIniciales

**Estado: IMPLEMENTADO**
**Prioridad: Media**
**Esfuerzo estimado: 15 minutos**

## Problema

La Cloud Function `obtenerDatosIniciales` devuelve la lista completa de grúas, corralones y duplas activos sin verificar autenticación. Cualquier persona que conozca el endpoint obtiene datos operativos de la flota.

## Solución propuesta

1. Agregar `verificarAuth(request.auth)` al inicio del handler en `functions/src/index.ts`.
2. Verificar que el frontend maneje correctamente un `unauthenticated` error (debería redirigir a login).

## Archivos a modificar

- `functions/src/index.ts` — handler de `obtenerDatosIniciales`

## Cómo usar este documento

Decile a Claude: "Implementar ítem 05 del análisis funcional". Es un cambio mínimo de una línea.
