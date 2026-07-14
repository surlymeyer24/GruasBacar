# 09 — Migrar ABMs de flota a Cloud Functions con auditoría

**Estado: PENDIENTE**
**Prioridad: Mejora**
**Esfuerzo estimado: 1-2 días**

## Problema

Las operaciones CRUD de `gruas`, `corralones` y `duplas` se escriben directamente desde el frontend al Firestore. No hay registro de quién creó, modificó o desactivó una entidad. Las Firestore Rules permiten escritura a cualquier admin sin validación de esquema.

**Consecuencias:**
- No hay auditoría de cambios en la flota
- No se valida integridad de datos (ej: una dupla podría crearse sin legajos)
- Un admin podría corromper datos desde el frontend

## Solución propuesta

### Cloud Functions nuevas

1. **`crearGrua`** — validar esquema, generar doc ID estándar (`G-{patente}`), agregar `creadoPor`, `creadoEn`
2. **`actualizarGrua`** — validar esquema, agregar `modificadoPor`, `modificadoEn`
3. **`crearCorralon`** — validar esquema, agregar auditoría
4. **`actualizarCorralon`** — idem
5. **`crearDupla`** — validar que legajos existan en `usuarios/`, agregar auditoría
6. **`actualizarDupla`** — idem
7. **`eliminarDupla`** / **`desactivarGrua`** — soft delete con `desactivadoPor`, `desactivadoEn`

### Firestore Rules

8. Cambiar `gruas`, `corralones`, `duplas` a `allow write: if false` (solo Admin SDK)

### Frontend

9. Migrar servicios del frontend (`grua.service.ts`, `corralon.service.ts`, `dupla.service.ts`) de escritura directa a `httpsCallable`
10. Los paneles admin (`AdminDuplasPanel`, etc.) llaman a las nuevas CFs

## Archivos a crear/modificar

- `functions/src/services/flota.service.ts` (nuevo) — lógica de ABM
- `functions/src/index.ts` — exportar nuevas CFs
- `firestore.rules` — bloquear escritura directa
- `frontend/src/services/grua.service.ts`, `corralon.service.ts`, `dupla.service.ts` — migrar a httpsCallable
- `frontend/src/components/admin/AdminDuplasPanel.tsx`, etc. — adaptar

## Cómo usar este documento

Decile a Claude: "Implementar ítem 09 del análisis funcional". Es el ítem más grande — considerar hacerlo en etapas (primero duplas, después grúas, después corralones).
