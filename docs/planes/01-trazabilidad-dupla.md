# 01 — Trazabilidad de la dupla en el servicio

**Estado: IMPLEMENTADO** (2026-07-07)

## Problema

`DuplasServicio` solo guardaba `{ chofer: string, enganchador: string }` — nombres de texto plano sin ningún vínculo al catálogo de duplas, legajos ni usuarios. La `AsignacionDiaria` ya tenía `duplaId`, `legajoChofer` y `legajoEnganchador`, pero `iniciarEnganche` no los propagaba al servicio.

En la edición de actas (HistorialPage), chofer y enganchador eran inputs de texto libre donde se podía escribir cualquier cosa. En contraste, NuevaActaManualPage sí usaba selects del catálogo.

**Consecuencia:** imposible saber qué usuario fue chofer/enganchador de un acta si el nombre cambió. Imposible generar reportes cruzando con el catálogo.

## Solución implementada

1. **`shared/src/types.ts`** — `DuplasServicio` ampliado con campos opcionales: `duplaId`, `legajoChofer`, `legajoEnganchador`, `uidChofer`, `uidEnganchador`. Opcionales por retrocompatibilidad con actas existentes.

2. **`functions/src/services/servicio.service.ts`** — `iniciarEnganche` lee la `AsignacionDiaria` del usuario y propaga `duplaId`, `legajoChofer`, `legajoEnganchador` al documento del servicio. Los datos se leen del backend (no del frontend) para evitar manipulación.

3. **`frontend/src/pages/HistorialPage.tsx`** — Inputs de texto reemplazados por `CustomSelect` de duplas del catálogo. Al seleccionar una dupla, se resuelven automáticamente nombres, legajos y UIDs. Los campos de trazabilidad se envían en el payload de `actualizarServicio`.

4. **`frontend/src/pages/NuevaActaManualPage.tsx`** — Al crear actas manuales, se resuelven legajos y UIDs desde el catálogo de usuarios y se incluyen en el payload.

## Archivos modificados

- `shared/src/types.ts` — interfaz `DuplasServicio`
- `functions/src/services/servicio.service.ts` — función `iniciarEnganche`
- `frontend/src/pages/HistorialPage.tsx` — edición de acta
- `frontend/src/pages/NuevaActaManualPage.tsx` — creación de acta manual

## Cómo usar este documento en futuras sesiones

Incluí la ruta `docs/planes/01-trazabilidad-dupla.md` en el contexto de la conversación o mencioná "ítem 1 del análisis funcional" para que Claude sepa que ya está implementado y no lo vuelva a proponer.
