# 11 — Señalización via notificaciones para cambios en el doc del usuario

**Estado: PENDIENTE**
**Prioridad: Mejora**
**Esfuerzo estimado: 3-4 horas**

## Problema

El `AuthContext` lee el documento del usuario una sola vez al iniciar sesión. Si un admin cambia los roles del operador, libera su servicio activo, o modifica cualquier dato del perfil, el operador no se entera hasta que recarga la página manualmente.

**Restricción:** Usar `onSnapshot` en `usuarios/{uid}` es costoso en Firestore (una conexión persistente por cada usuario activo). Decisión de arquitectura: no usar `onSnapshot` para esto.

## Solución propuesta

### Señalización via notificaciones (preferido)

El frontend ya tiene un listener de `notificaciones/` activo. Aprovechar ese canal:

1. Cuando una Cloud Function modifica el doc del usuario (ej: `actualizarUsuario`, `asignarTurnoOperador`, `liberarServicioActivoSiHuerfano`), crear una notificación de tipo sistema:
```
notificaciones/{autoId}
  tipo: "PERFIL_ACTUALIZADO"
  uid: string
  timestamp: serverTimestamp
```

2. En el frontend, cuando llega una notificación `PERFIL_ACTUALIZADO`, llamar `refreshUserData()` en el `AuthContext`.

### Alternativas complementarias

3. **Polling liviano:** `getDoc` cada 60-90 segundos solo si el usuario tiene `servicioActivoId`. Mucho más barato que un listener.
4. **Refresh en navegación:** Llamar `refreshUserData()` al cambiar de página (via `useEffect` en el router).

### Recomendación

Implementar las 3 estrategias combinadas:
- Señalización via notificaciones para cambios inmediatos (roles, liberación)
- Refresh en navegación como red de seguridad general
- Polling liviano solo durante servicio activo (para detectar anulaciones por admin)

## Archivos a crear/modificar

- `functions/src/services/usuario.service.ts` — agregar creación de notificación en funciones que modifican el usuario
- `frontend/src/context/AuthContext.tsx` — agregar `refreshUserData()`, polling condicional, refresh en navegación
- `frontend/src/App.tsx` o layout — trigger de refresh en cambio de ruta

## Cómo usar este documento

Decile a Claude: "Implementar ítem 11 del análisis funcional" o referenciá `docs/planes/11-senalizacion-cambios-usuario.md`.
