# 07 — No actualizar identificadorCompuesto en ediciones

**Estado: IMPLEMENTADO**
**Prioridad: Media**
**Esfuerzo estimado: 2 horas**

## Problema

Al crear un servicio, `identificadorCompuesto` se usa como ID del documento Firestore (`servicioRef.doc(identificadorCompuesto)`). Cuando se edita un servicio y cambia la patente o infracción, `actualizarServicio` recalcula el campo `identificadorCompuesto` pero no mueve el documento.

**Resultado:** El campo `identificadorCompuesto` dice `"000123-1042-AB123CD"` pero el doc ID sigue siendo `"000123-1042-AA999BB"`. Divergencia entre el campo y el ID real.

## Solución propuesta

**Opción A (recomendada):** No actualizar `identificadorCompuesto` en ediciones. Dejarlo como ID histórico inmutable que coincide con el doc ID. Si se necesita mostrar patente/infracción actualizados, usar los campos `patente` y `numeroInfraccion` directamente.

**Opción B:** Mover el documento al nuevo ID (crear nuevo + borrar viejo + actualizar referencias). Más complejo y riesgoso — requiere actualizar `servicioActivoId` del usuario, subcollections de eventos y versiones.

### Pasos para Opción A

1. En `actualizarServicio`, eliminar la línea que actualiza `identificadorCompuesto` en el objeto `updates`.
2. Eliminar la validación de duplicados basada en el nuevo `identificadorCompuesto` (ya no cambia).
3. Verificar que `diffEdicionServicio` registre el cambio de patente/infracción sin depender del `identificadorCompuesto`.
4. En los listados/reportes, asegurar que se muestre la patente del campo `patente`, no parseada del `identificadorCompuesto`.

## Archivos a modificar

- `functions/src/services/servicio.service.ts` — función `actualizarServicio`
- `shared/src/versionesActa.ts` — verificar que el diff no use `identificadorCompuesto`
- Frontend (vistas que parsean `identificadorCompuesto`) — verificar que usen `servicio.patente`

## Cómo usar este documento

Decile a Claude: "Implementar ítem 07 del análisis funcional" o referenciá `docs/planes/07-identificador-compuesto-inmutable.md`.
