# Sistema de Control de Enganches de Grúas
**Análisis y Definición de Requerimientos — MVP**

---

## 1. Contexto del Proyecto

Sistema web responsivo (mobile + desktop) para registrar y controlar el ciclo de vida de enganches de autos mal estacionados. Las grúas y choferes son de BACAR. La base de datos es Firebase/Firestore.

El objetivo de medición principal es conocer cuánto demora cada etapa del servicio (enganche → traslado → desenganche). Los timestamps de cada transición son datos analíticos críticos y no deben ser manipulables por el chofer.

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
| RF-04 | Bloquear al chofer para no iniciar un nuevo servicio si tiene uno abierto. | Se desbloquea solo al confirmar el desenganche. Al abrir la app, redirigir al estado actual según `servicioActivoId`. |
| RF-05 | Permitir que el admin anule un servicio manualmente, excepto servicios cuya fecha de creación sea el día actual. | Un servicio siempre empieza y termina el mismo día. Esto evita anulaciones accidentales de operativos en curso. El servicio anulado queda visible en historial con estado ANULADO. |
| RF-06 | Flujo de fotos guiado y en orden forzado: delantera → lado derecho → lado izquierdo → trasera → observación general. | Solo desde cámara, sin galería. Aplica en enganche y desenganche. |
| RF-07 | Después de cada foto, preguntar "¿Subir esta foto?" Si el chofer dice no, habilitar nueva toma. | Sin límite de reintentos por foto. |
| RF-08 | Capturar geolocalización automáticamente en la primera foto del enganche. | |
| RF-09 | Permitir agregar observación opcional por foto en el enganche. | |
| RF-10 | Al completar las fotos del enganche, mostrar botón "Traslado". Al presionarlo, registrar timestamp de salida automáticamente. | Timestamp generado por servidor, no por cliente. |
| RF-11 | Al presionar "Desenganche", registrar automáticamente geo y timestamp de llegada al corralón, y solicitar selección de corralón. | Timestamp generado por servidor. |
| RF-12 | Completar desenganche con flujo guiado de fotos + observación general. Confirmar desenganche. | Si no pudo confirmar en el momento, puede retomarlo después o el admin lo completa. |

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
| RNF-06 | Los timestamps de transición de estado se generan en el servidor (Firebase Functions o Firestore server timestamp). | No pueden ser manipulados por el cliente. Crítico para la medición de tiempos. |
| RNF-07 | Escalabilidad a cronogramas de turno (futuro). | El modelo de datos debe contemplar la relación grúa-turno. |

---

## 5. Modelo de Datos Firestore (Propuesto)

| Colección | Campos clave | Notas |
|---|---|---|
| `servicios` | id (auto), patente, numeroInfraccion, identificadorCompuesto, estado, grua, corralon, creadoPor, dupla: {chofer, ayudante, inspector} | estado: `ENGANCHADO` \| `EN_TRASLADO` \| `DESENGANCHADO` \| `ANULADO` |
| `servicios/{id}/eventos` | tipo (ENGANCHE\|TRASLADO\|DESENGANCHE), timestamp (server), geo: {lat,lng}, fotos: [{url, etiqueta, observacion}], observacionGeneral | Timestamps generados por servidor. Geo en ENGANCHE (primera foto) y TRASLADO (llegada). |
| `usuarios` | uid, nombre, rol (ADMIN\|CHOFER), servicioActivoId | servicioActivoId = null si no hay servicio abierto. |
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

> Admin solo puede anular servicios cuya fecha de creación no sea el día actual. Un servicio siempre empieza y termina el mismo día.

---

## 6. Flujo de Pantallas — MVP

| Paso | Pantalla | Acciones |
|---|---|---|
| 1 | Inicio / Login | El chofer inicia sesión. Si tiene un servicio activo, redirige al estado correspondiente. |
| 2 | Carga de datos | Número de infracción, patente, grúa, dupla, inspector. Confirmar datos. |
| 3 | Fotos de enganche | Flujo guiado: delantera → derecha → izquierda → trasera → observación general. Confirmación por foto. Observación opcional. Geo en la primera. Botón "Traslado" al finalizar. |
| 4 | En traslado | Pantalla de espera con botón "Desenganche". |
| 5 | Llegada al corralón | Geo + timestamp automáticos al presionar "Desenganche". Selección de corralón. Habilita fotos. |
| 6 | Fotos de desenganche | Mismo flujo guiado de 4 fotos + observación general. Observación general. Confirmar desenganche. |

---

## 7. Product Backlog

### MVP (alcance inicial)

| Historia | Prioridad |
|---|---|
| Como chofer, quiero iniciar un enganche cargando los datos del servicio. | Alta |
| Como chofer, quiero tomar las 4 fotos en orden guiado con confirmación por foto. | Alta |
| Como chofer, quiero confirmar el traslado y que se registre el timestamp automáticamente. | Alta |
| Como chofer, quiero confirmar la llegada al corralón y que se registre geo y timestamp. | Alta |
| Como chofer, quiero confirmar el desenganche con fotos. | Alta |
| Como chofer, no poder iniciar otro servicio si tengo uno abierto. | Alta |
| Como chofer, al abrir la app ser redirigido al estado actual de mi servicio. | Alta |
| Como chofer, quiero ver mis servicios anteriores. | Media |
| Como admin, quiero ver todos los servicios con sus timestamps de cada etapa. | Alta |
| Como admin, quiero anular un servicio (solo si no es del día actual). | Alta |
| Como admin, quiero gestionar usuarios, grúas, corralones y duplas. | Media |

### Post-MVP (backlog futuro)

| Historia | Comentario |
|---|---|
| Reportes de tiempos por etapa, grúa, chofer o corralón. | El objetivo de medición del sistema abre esto naturalmente. |
| Cronogramas de turno. | Pre-asignación de grúa y dupla al inicio del turno. |
| Inspector de tránsito como usuario del sistema. | Hoy solo se guarda el nombre. |
| Edición de datos de un servicio. | A definir qué campos y hasta cuándo. |
| Alertas al admin por servicios con demora inusual. | |
| Validación de ángulo de foto con visión. | |