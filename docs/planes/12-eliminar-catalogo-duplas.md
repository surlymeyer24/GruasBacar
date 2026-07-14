# 12 — Eliminar catálogo de duplas

**Prioridad:** mejora  
**Estado:** PENDIENTE  
**Motivación:** Las duplas del catálogo representan parejas ideales que en la práctica no se respetan — los operadores rotan compañeros libremente día a día. El catálogo se convirtió en un intermediario innecesario: la fuente real de operadores es la colección `usuarios`.

## Problema

- La entidad `Dupla` (colección `duplas`) modela una pareja fija chofer+enganchador, pero operativamente las parejas cambian a diario.
- Los selects de chofer/enganchador ya se alimentan de los nombres extraídos de las duplas, cuando deberían venir directo de `usuarios` filtrados por rol.
- El admin mantiene un catálogo que nadie respeta, generando fricción y datos desactualizados.
- El campo `duplaId` en `AsignacionDiaria` y `Servicio.dupla` es best-effort desde la implementación de duplas editables — muchas asignaciones ya van con `duplaId = ""`.

## Solución

Reemplazar todas las dependencias del catálogo de duplas por consultas directas a la colección `usuarios`.

### Cambios por capa

**shared/src/types.ts**
- Eliminar interfaz `Dupla` y funciones asociadas: `enganchadorDeDupla`, `duplaDeUsuario`, `duplaEnganchadorDeAsignacion`.
- `DuplasServicio`: eliminar campo `duplaId` (mantener legajos y uids que son el vínculo real).
- `AsignacionDiaria`: eliminar campo `duplaId`.
- `GuardarAsignacionDiariaPayload`: eliminar campo `duplaId`.

**frontend/src/services/dupla.service.ts**
- Eliminar archivo completo.

**frontend/src/components/operador/ConfiguracionDiaModal.tsx**
- Reemplazar carga de duplas por carga de usuarios operadores activos (Cloud Function o query directa).
- Filtrar por rol: `CHOFER` para el select de chofer, `ENGANCHADOR` para el de enganchador.
- Eliminar lógica de `findDuplaMatch`, `extractOperadores`, y el indicador "coincide con dupla del catálogo".
- Pre-selección del usuario logueado: buscar directamente en la lista de usuarios por uid (más robusto que por nombre/legajo).

**frontend/src/components/admin/AdminDuplasPanel.tsx**
- Eliminar panel completo (ABM de duplas).

**frontend/src/components/admin/DuplasImportModal.tsx**
- Eliminar modal de importación de duplas.

**frontend/src/components/admin/AdminTurnosPanel.tsx**
- Eliminar pestaña "Sin turno" (basada en duplas sin turno activo) o reemplazarla por "Operadores sin turno" (usuarios operadores activos sin `asignacionDiaria` vigente).
- Los selects de chofer/enganchador en el modal de edición ya usan `usuarios` — solo eliminar la referencia a `duplasFiltradas` y `DUPLA_MANUAL`.

**frontend/src/pages/AdminDashboardPage.tsx**
- Eliminar pestaña/sección de duplas del sidebar y routing.

**frontend/src/components/admin/AdminSidebar.tsx**
- Eliminar entrada "Duplas" del menú.

**functions/src/services/usuario.service.ts**
- `guardarAsignacionDiaria`: eliminar validación de `duplaId` contra colección `duplas`. Los legajos vienen del payload.
- `asignarTurnoOperador`: misma limpieza.

**functions/src/services/servicio.service.ts**
- `iniciarEnganche`: eliminar propagación de `duplaId` a `DuplasServicio`. Mantener legajos y uids.

**firestore.rules**
- Eliminar reglas de la colección `duplas` (o marcar como read-only si se quiere mantener datos históricos).

### Migración del campo `Dupla.gruaId`

La grúa habitual estaba asociada a la dupla. Alternativas:
- **Opción A (recomendada):** Agregar campo `gruaHabitualId` a `Usuario`. El modal pre-selecciona la grúa del usuario logueado. Simple, sin entidad intermedia.
- **Opción B:** No migrar. El operador elige la grúa manualmente cada día. Ya funciona así cuando la dupla no tiene `gruaId`.

### Datos históricos

Los servicios ya creados tienen `dupla.duplaId` en Firestore. No hace falta migrarlos — el campo queda como dato histórico inmutable. Los nuevos servicios simplemente no lo tendrán.

La colección `duplas` en Firestore puede dejarse intacta (solo se deja de leer/escribir) o eliminarse en una limpieza posterior.

## Validación post-implementación

- [ ] El operador puede configurar turno eligiendo chofer + enganchador desde la lista de usuarios activos
- [ ] El admin puede asignar turnos sin referencia a duplas
- [ ] No existe sección "Duplas" en el panel admin
- [ ] Los servicios nuevos se crean sin `duplaId` pero con legajos y uids completos
- [ ] Los servicios históricos (con `duplaId`) siguen mostrándose correctamente en historial
- [ ] La pre-selección de grúa funciona desde `Usuario.gruaHabitualId` (si se elige opción A)
- [ ] `npx tsc --noEmit` compila limpio en shared, frontend y functions

## Dependencias

- Requiere que la implementación actual de duplas editables (selects independientes de chofer/enganchador) esté deployada y validada en producción antes de ejecutar este plan.
- No depende de otros ítems del backlog (02-11).
