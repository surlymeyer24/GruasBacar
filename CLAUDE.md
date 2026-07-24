# gruasBacar — Instrucciones para Claude

## Planes de mejora

Los planes de mejora del sistema están en `docs/planes/*.md` (01 al 12). Cada archivo documenta un problema detectado, la solución propuesta, los archivos a modificar y validaciones post-implementación. Consultarlos antes de proponer cambios estructurales y al recibir instrucciones tipo "implementar ítem N del análisis funcional".

Estado actual:
- **01** Trazabilidad dupla — IMPLEMENTADO
- **02** Auto-provisión perfil — IMPLEMENTADO
- **03** Validar grúa/corralón backend — IMPLEMENTADO
- **04** Validar liberarServicioHuérfano — IMPLEMENTADO
- **05** Auth en obtenerDatosIniciales — IMPLEMENTADO
- **06** Transaccionar evento enganche — IMPLEMENTADO
- **07** IdentificadorCompuesto inmutable — IMPLEMENTADO
- **08** Migración rol→roles, fechaCreacion→creadoEn — IMPLEMENTADO
- **09** ABMs flota a Cloud Functions — PENDIENTE (mejora)
- **10** Colección turnos (historial asignaciones) — IMPLEMENTADO
- **11** Señalización cambios usuario — PENDIENTE (mejora)
- **12** Eliminar catálogo de duplas — PENDIENTE (mejora, post-piloto)

## Restricciones de arquitectura

- **No usar `onSnapshot`** en docs de usuario por costo de Firestore. Alternativas: señalización via notificaciones, polling liviano, refresh en navegación.
- **No arrancar dev servers ni tocar `.env.local`** — el usuario prueba por su cuenta.
