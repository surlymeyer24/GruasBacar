# Sistema de Control de Enganches de Grúas
**Análisis y Definición de Requerimientos — MVP**

---

## 1. Contexto del Proyecto

Sistema web responsivo (mobile + desktop) para registrar y controlar el ciclo de vida de enganches de autos mal estacionados. Las grúas y choferes son de BACAR. La base de datos es Firebase/Firestore.

---

## 2. Entidades Principales

| Entidad | Descripción |
|---|---|
| Servicio | Unidad central. Nace con un enganche, termina con un desenganche confirmado. |
| Evento | Enganche, traslado o desenganche. Cada uno tiene timestamp, geolocalización y/o fotos según el tipo. |
| Dupla | Chofer + ayudante asignados a un servicio. Acompaña un inspector de tránsito (externo). |
| Grúa | Vehículo de BACAR asignado al servicio. |
| Corralón | Destino final del auto enganchado. Se carga al confirmar llegada. |
| Usuario | Chofer o Admin. Pertenece a BACAR. |

---

## 3. Requerimientos Funcionales

### 3.1 Flujo Core — Servicio

| ID | Requerimiento | Notas |
|---|---|---|
| RF-01 | Iniciar enganche cargando: número de infracción, patente, grúa, dupla (chofer + ayudante), nombre del inspector. | El número de infracción está en una boleta física del inspector. |
| RF-02 | Validar unicidad del identificador compuesto (patente + número de infracción) antes de confirmar el enganche. | Previene duplicados por error de tipeo. |
| RF-03 | Mostrar resumen de datos y pedir confirmación explícita antes de iniciar el enganche. | Reduce errores de carga. |
| RF-04 | Bloquear al chofer para no iniciar un nuevo servicio si tiene uno abierto. | Se desbloquea solo al confirmar el desenganche. Al abrir la app, si hay un servicio activo, redirigir al estado correspondiente. |
| RF-05 | Permitir que el admin cierre o anule un servicio manualmente. | Para casos de fuerza mayor: celular roto, etc. El servicio anulado queda visible en el historial con estado ANULADO. |
| RF-06 | Registrar 4 fotos en orden forzado (delantera, lado derecho, lado izquierdo, trasera) + 1 foto de observación general. | Solo desde cámara, sin subir desde galería. Aplica tanto en enganche como en desenganche. |
| RF-07 | Capturar geolocalización automáticamente al confirmar traslado (llegada al corralón). | Reemplaza la geo por foto en el desenganche. En enganche, la geo sigue siendo en la primera foto. |
| RF-08 | Permitir agregar observación por foto en el enganche. | |
| RF-09 | Permitir agregar una observación general en el desenganche. | Sin observación por foto. |
| RF-10 | Al confirmar enganche, mostrar botón "Traslado". Al presionarlo, el servicio pasa a EN_TRASLADO. | |
| RF-11 | Al presionar "Desenganche", registrar geo y timestamp de llegada al corralón, y solicitar corralón. Luego habilitar carga de fotos. | |
| RF-12 | Confirmar desenganche tras cargar las 4 fotos + foto de observación. | Si no pudo confirmar en el momento, puede retomarlo después o el admin lo confirma. |

### 3.2 Administración

| ID | Requerimiento |
|---|---|
| RF-13 | ABM de usuarios (choferes y admins): datos, seguridad, editar dupla asignada. |
| RF-14 | ABM de grúas. |
| RF-15 | ABM de corralones. |
| RF-16 | ABM de duplas. |
| RF-17 | El admin puede ver todos los servicios. |
| RF-18 | El chofer puede ver sus propios servicios. |

---

## 4. Requerimientos No Funcionales

| ID | Requerimiento | Detalle |
|---|---|---|
| RNF-01 | Responsivo mobile-first. | Funciona en celular y computadora. El flujo core se usa principalmente desde el celular. |
| RNF-02 | Firebase como base de datos. | Firestore para datos estructurados, Firebase Storage para fotos. |
| RNF-03 | Autenticación con Firebase Auth. | Roles: Admin y Chofer. |
| RNF-04 | Las fotos se comprimen en el cliente antes de subir. | Los celulares sacan fotos pesadas. Definir límite de tamaño. |
| RNF-05 | Los datos del enganche se persisten antes de subir fotos. | Si se pierde conexión durante la subida, los datos no se pierden. |
| RNF-06 | Escalabilidad a cronogramas de turno (futuro). | El modelo de datos debe contemplar la relación grúa-turno. |

---

## 5. Modelo de Datos Firestore (Propuesto)

| Colección | Campos clave | Notas |
|---|---|---|
| `servicios` | id (auto), patente, numeroInfraccion, identificadorCompuesto, estado, grua, corralon, creadoPor, dupla: {chofer, ayudante, inspector} | estado: `ENGANCHADO` \| `EN_TRASLADO` \| `DESENGANCHADO` \| `ANULADO` |
| `servicios/{id}/eventos` | tipo (ENGANCHE\|TRASLADO\|DESENGANCHE), timestamp, geo: {lat,lng}, fotos: [{url, etiqueta, observacion}], observacionGeneral | geo solo en ENGANCHE (primera foto) y TRASLADO (llegada). Fotos tienen etiqueta en ENGANCHE. |
| `usuarios` | uid, nombre, rol (ADMIN\|CHOFER), servicioActivoId | servicioActivoId = null si no tiene servicio abierto. Se usa para redirigir al estado correcto al abrir la app. |
| `gruas` | id, patente, descripcion, activa | |
| `corralones` | id, nombre, direccion, activo | |
| `duplas` | id, chofer, ayudante | |

> El `identificadorCompuesto` (patente + número de infracción) se usa como campo indexado con validación de unicidad en lógica de app. El document ID es siempre autogenerado por Firestore.

### Estados y transiciones

```
ENGANCHADO → EN_TRASLADO → DESENGANCHADO
     ↓               ↓
  ANULADO         ANULADO
```

---

## 6. Flujo de Pantallas — MVP

| Paso | Pantalla | Acciones |
|---|---|---|
| 1 | Inicio / Login | El chofer inicia sesión. Si tiene un servicio activo, redirige al estado correspondiente según `servicioActivoId`. |
| 2 | Carga de datos | Número de infracción, patente, selección de grúa, dupla, nombre de inspector. Confirmar datos. |
| 3 | Fotos de enganche | Flujo guiado: delantera → derecha → izquierda → trasera → observación general. Cada foto habilita la siguiente. Observación opcional por foto. Geo en la primera. Botón "Traslado" al finalizar. |
| 4 | En traslado | Pantalla de espera. Botón "Desenganche". |
| 5 | Llegada al corralón | Al presionar "Desenganche": geo + timestamp automáticos, selección de corralón. Luego habilita fotos. |
| 6 | Fotos de desenganche | Mismo flujo guiado de 4 fotos + observación general. Observación general del desenganche. Confirmar desenganche. |

---

## 7. Product Backlog

### MVP (alcance inicial)

| Historia | Prioridad |
|---|---|
| Como chofer, quiero iniciar un enganche cargando los datos del servicio. | Alta |
| Como chofer, quiero tomar las 4 fotos en orden guiado y que se registre la geo automáticamente. | Alta |
| Como chofer, quiero confirmar el traslado con un botón y que quede registrado el momento de salida. | Alta |
| Como chofer, quiero confirmar la llegada al corralón y que se registre geo y timestamp automáticamente. | Alta |
| Como chofer, quiero confirmar el desenganche con fotos. | Alta |
| Como chofer, no poder iniciar otro servicio si tengo uno abierto. | Alta |
| Como chofer, al abrir la app ser redirigido al estado actual de mi servicio. | Alta |
| Como chofer, quiero ver mis servicios anteriores. | Media |
| Como admin, quiero ver todos los servicios. | Alta |
| Como admin, quiero cerrar o anular un servicio manualmente. | Alta |
| Como admin, quiero gestionar usuarios, grúas, corralones y duplas. | Media |

### Post-MVP (backlog futuro)

| Historia | Comentario |
|---|---|
| Cronogramas de turno | Si se sabe el turno, el sistema puede pre-asignar grúa y confirmar dupla al inicio. |
| Inspector de tránsito como usuario del sistema | Hoy solo se guarda el nombre. En el futuro podría tener acceso. |
| Edición de datos de un servicio | Por ahora bloqueado. A definir qué campos y hasta cuándo. |
| Alertas al admin por servicios con demora | |
| Estadísticas y reportes | |
| Flujo guiado con validación de ángulo de foto | Hoy el orden es forzado por UI; en el futuro podría validarse con visión. |

---

## 8. Puntos Abiertos a Confirmar con el Cliente

| # | Pregunta | Impacto |
|---|---|---|
| 1 | Si el chofer saca mal una foto en el flujo guiado, ¿puede retroceder y repetirla o debe reiniciar el evento? | Define el comportamiento de la pantalla de fotos. |
| 2 | ¿El admin puede anular un servicio en cualquier estado (ENGANCHADO, EN_TRASLADO)? | Define las restricciones del RF-05. |
| 3 | ¿Existe un límite de tiempo entre el enganche y el desenganche que genere alguna alerta? | Post-MVP, pero conviene definir la expectativa ahora. |
