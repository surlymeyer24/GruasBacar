# 08 — Script de migración: rol→roles y fechaCreacion→creadoEn

**Estado: IMPLEMENTADO**
**Prioridad: Media**
**Esfuerzo estimado: 3-4 horas**

## Problema

### `rol` vs `roles`
Los documentos de usuario tienen dos campos para roles: `rol` (string, campo legacy) y `roles` (array, campo actual). `normalizeRoles()` los mergea, lo cual puede dar la unión de privilegios si ambos tienen valores diferentes. Por ejemplo, un usuario con `rol: "ADMIN"` y `roles: ["ENGANCHADOR"]` termina con ambos roles.

### `fechaCreacion` vs `creadoEn`
El tipo `Servicio` tiene ambos como `any`. `fechaServicio()` intenta ambos con fallback. Ambigüedad innecesaria.

## Solución propuesta

### Script de migración (una vez)

1. **Usuarios:** Para cada doc en `usuarios/`:
   - Si tiene `rol` pero no `roles`: crear `roles: [rol]`
   - Si tiene ambos: mergear (como hace `normalizeRoles`), guardar en `roles`, borrar `rol`
   - Si solo tiene `roles`: borrar `rol` si existe
   - Registrar cada cambio en un log

2. **Servicios:** Para cada doc en `servicios/`:
   - Si tiene `fechaCreacion` pero no `creadoEn`: copiar a `creadoEn`, borrar `fechaCreacion`
   - Si tiene ambos: mantener `creadoEn`, borrar `fechaCreacion`

### Código post-migración

3. Marcar `rol` como `@deprecated` en el tipo `Usuario` (ya está implícito pero formalizar)
4. Marcar `fechaCreacion` como `@deprecated` en el tipo `Servicio` (ya está)
5. A futuro: eliminar `normalizeRoles()` fallback a `rol` y el fallback `fechaCreacion` en `fechaServicio()`

## Archivos a crear/modificar

- `scripts/migracion-rol-fecha.ts` (nuevo) — script de migración one-shot
- `shared/src/types.ts` — marcar `rol` y `fechaCreacion` como `@deprecated` formalmente

## Cómo usar este documento

Decile a Claude: "Implementar ítem 08 del análisis funcional". El script debe ser idempotente y dry-run first.
