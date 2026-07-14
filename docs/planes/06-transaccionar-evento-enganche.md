# 06 — Transaccionar registrarEventoEnganche

**Estado: IMPLEMENTADO**
**Prioridad: Media**
**Esfuerzo estimado: 1 hora**

## Problema

En `registrarEventoEnganche`, el evento se escribe con `.add()` fuera de transacción, y luego `totalFotos` se incrementa en una escritura separada. Si la segunda falla, el servicio tiene un evento con fotos pero el contador `totalFotos` no refleja la realidad.

En contraste, `confirmarDesenganche` sí hace ambas operaciones dentro de `runTransaction` (correcto).

## Solución propuesta

1. Envolver la escritura del evento y el incremento de `totalFotos` en un `runTransaction`.
2. Dentro de la transacción:
   - `tx.create(eventosRef.doc(), eventoData)` — crear el evento
   - `tx.update(servicioRef, { totalFotos: admin.firestore.FieldValue.increment(cantFotos) })` — incrementar contador
3. Mantener la misma estructura que usa `confirmarDesenganche`.

## Archivos a modificar

- `functions/src/services/servicio.service.ts` — función `registrarEventoEnganche`

## Cómo usar este documento

Decile a Claude: "Implementar ítem 06 del análisis funcional" o referenciá `docs/planes/06-transaccionar-evento-enganche.md`.
