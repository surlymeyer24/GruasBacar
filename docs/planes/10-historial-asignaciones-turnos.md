# 10 — Colección turnos para historial de asignaciones diarias

**Estado: PENDIENTE**
**Prioridad: Mejora**
**Esfuerzo estimado: 1 día**

## Problema

La asignación diaria se sobrescribe en el campo `asignacionDiaria` del documento de usuario. No se puede saber qué grúa y dupla usó un operador ayer, la semana pasada, o en cualquier fecha anterior.

**Consecuencias:**
- No hay historial operativo de turnos
- No se pueden generar reportes de "quién trabajó con quién" o "rotación de grúas"
- Si hay un incidente, no se puede reconstruir quién estaba asignado a qué

## Solución propuesta

### Nueva colección `turnos`

1. Crear colección `turnos` con documentos que representen cada asignación diaria:

```
turnos/{autoId}
  operadorUid: string        // ref a usuarios/
  operadorNombre: string     // snapshot
  fecha: string              // YYYY-MM-DD
  gruaPatente: string
  duplaId: string            // ref a duplas/
  duplaChofer: string        // snapshot
  duplaEnganchador: string   // snapshot
  legajoChofer?: string
  legajoEnganchador?: string
  tipoFlota: TipoFlota
  creadoEn: Timestamp
```

2. En `guardarAsignacionDiaria` (CF), además de actualizar el campo del usuario, crear un documento en `turnos/`.
3. Firestore Rules: solo lectura para admin/supervisor, escritura solo via Admin SDK.

### Panel de consulta

4. Agregar vista en el panel admin para consultar turnos por fecha, operador o grúa.
5. Útil para reportes y auditoría operativa.

## Archivos a crear/modificar

- `shared/src/types.ts` — interfaz `Turno`
- `functions/src/services/usuario.service.ts` — `guardarAsignacionDiaria`, agregar escritura a `turnos/`
- `firestore.rules` — reglas para `turnos/`
- `frontend/src/pages/AdminPage.tsx` o panel nuevo — vista de consulta

## Cómo usar este documento

Decile a Claude: "Implementar ítem 10 del análisis funcional" o referenciá `docs/planes/10-historial-asignaciones-turnos.md`.
