# 03 — Validar existencia de grúa y corralón en backend

**Estado: IMPLEMENTADO**
**Prioridad: Crítico**
**Esfuerzo estimado: 3-4 horas**

## Problema

### Grúa
El campo `grua` en el servicio guarda `"G-ABC123"` (patente con prefijo). El backend no valida que la grúa exista ni esté activa en la colección `gruas`. `tipoFlotaDesdeGrua()` hace un lookup pero devuelve `'TRANSITO'` por defecto si no la encuentra, silenciando el error.

Además, el ID de la grúa en Firestore puede ser auto-generado, no necesariamente `"G-patente"`. El vínculo actual es implícito y frágil.

### Corralón
En `registrarLlegadaCorralon`, el backend acepta cualquier string como corralón (hasta 200 chars) sin validar que exista en la colección `corralones`. El campo puede ser un nombre, un doc ID, o texto libre según la ruta de entrada.

## Solución propuesta

### Grúa
1. En `iniciarEnganche`, validar que la grúa exista y esté activa antes de crear el servicio. Lanzar `HttpsError('not-found')` si no existe.
2. Guardar `gruaDocId` (doc ID real de Firestore) además de la patente normalizada. La patente queda como snapshot de display.
3. Considerar: si el convenio actual es que el doc ID de grúa ES `"G-patente"`, documentarlo y reforzar la convención en el ABM.

### Corralón
1. En `registrarLlegadaCorralon`, buscar el corralón en la colección `corralones` por doc ID o por nombre. Lanzar error si no existe o no está activo.
2. Guardar `corralonId` (doc ID) y `corralonNombre` (snapshot) en el servicio.
3. En `LlegadaCorralon.tsx` (frontend), asegurar que el select envíe el doc ID como value, no el nombre.

## Archivos a modificar

- `functions/src/services/servicio.service.ts` — `iniciarEnganche`, `registrarLlegadaCorralon`, `actualizarServicio`, `crearActaManual`
- `shared/src/types.ts` — agregar `gruaDocId?` y `corralonId?` a `Servicio` (opcionales por retrocompatibilidad)
- `frontend/src/components/desenganche/LlegadaCorralon.tsx` — verificar que envíe doc ID

## Cómo usar este documento

Decile a Claude: "Implementar ítem 03 del análisis funcional" o referenciá este archivo. Incluye el problema, la solución y los archivos a tocar.
