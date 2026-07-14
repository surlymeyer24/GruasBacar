# 02 — Eliminar auto-provisión de perfil en AuthContext

**Estado: IMPLEMENTADO**
**Prioridad: Crítico**
**Esfuerzo estimado: 2-3 horas**

## Problema

Cuando un usuario de Firebase Auth inicia sesión sin documento en `usuarios/{uid}`, el frontend (`AuthContext.tsx`, línea ~215) ejecuta `setDoc` directamente, creando un perfil con `roles: ["ENGANCHADOR"]`. Esto bypasea:

- La validación de legajo obligatorio para enganchadores
- La verificación de roles por parte del admin
- La verificación de unicidad de email/legajo en `crearUsuario` (Cloud Function)

**Riesgo:** Cualquier persona que tenga cuenta en Firebase Auth obtiene rol operador automáticamente sin intervención de un administrador.

## Solución propuesta

1. **Eliminar el `setDoc`** del `AuthContext.tsx`. No crear documento de usuario desde el frontend.
2. **Agregar pantalla de "Cuenta pendiente de activación"** cuando el usuario existe en Auth pero no tiene doc en `usuarios/`. Mostrar mensaje tipo: "Tu cuenta fue creada pero todavía no está habilitada. Contactá al administrador."
3. **Bloquear navegación** — el usuario sin doc no debe poder acceder a ninguna ruta operativa.
4. **Verificar que `crearUsuario` (CF)** sea la única forma de crear perfiles.

## Archivos a modificar

- `frontend/src/context/AuthContext.tsx` — eliminar bloque de `setDoc` y agregar estado `pendienteActivacion`
- `frontend/src/components/auth/RoleGuard.tsx` — manejar caso sin doc
- `frontend/src/App.tsx` — ruta de pantalla pendiente (o componente inline)

## Validaciones post-implementación

- Crear un usuario en Firebase Auth console → verificar que NO obtiene acceso al sistema
- Crear el usuario via Cloud Function → verificar que sí accede
- Verificar que usuarios existentes no se vean afectados

## Cómo usar este documento

Decile a Claude: "Implementar ítem 02 del análisis funcional" o referenciá `docs/planes/02-auto-provision-perfil.md`. El documento le da contexto del problema, la solución y los archivos a tocar.
