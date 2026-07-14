# 04 — Validar estado en liberarServicioActivoSiHuerfano

**Estado: IMPLEMENTADO**
**Prioridad: Crítico**
**Esfuerzo estimado: 1 hora**

## Problema

`liberarServicioActivoSiHuerfano` en `servicio.service.ts` (línea ~1018+) limpia el campo `servicioActivoId` del usuario sin verificar que el servicio esté en estado terminal (DESENGANCHADO o ANULADO).

**Riesgo:** Un operador puede usar esta función para "escapar" de un servicio activo que está en estado ENGANCHADO o EN_TRASLADO, rompiendo la integridad del flujo. El servicio queda en un estado no-terminal sin operador asignado.

## Solución propuesta

1. Antes de limpiar `servicioActivoId`, leer el documento del servicio referenciado.
2. Solo limpiar si:
   - El servicio **no existe** (fue borrado manualmente — es un huérfano real)
   - El servicio está en estado **DESENGANCHADO** (completado)
   - El servicio está en estado **ANULADO**
3. Si el servicio existe y está en estado activo (ENGANCHADO, EN_TRASLADO), lanzar error explicando que debe completar o anular el servicio primero.

## Archivos a modificar

- `functions/src/services/servicio.service.ts` — función `liberarServicioActivoSiHuerfano`

## Validaciones post-implementación

- Crear un servicio ENGANCHADO → intentar liberar → debe fallar
- Completar un servicio → intentar liberar → debe funcionar
- Poner un `servicioActivoId` apuntando a un doc inexistente → debe limpiar

## Cómo usar este documento

Decile a Claude: "Implementar ítem 04 del análisis funcional" o referenciá `docs/planes/04-validar-liberar-servicio-huerfano.md`.
