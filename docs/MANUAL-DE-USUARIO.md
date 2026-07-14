# Manual de Usuario — Sistema Operacional Grúas BACAR

Última actualización: 2 de julio de 2026

Este manual explica cómo usar la aplicación según el rol de cada usuario. Está organizado en cuatro partes:

1. [Acceso al sistema (todos los roles)](#1-acceso-al-sistema)
2. [Manual del Operador (Enganchador / Chofer)](#2-manual-del-operador-enganchador--chofer)
3. [Manual del Supervisor](#3-manual-del-supervisor)
4. [Manual del Administrador y Super Admin](#4-manual-del-administrador-y-super-admin)

Al final hay una sección de [Preguntas frecuentes y problemas comunes](#5-preguntas-frecuentes-y-problemas-comunes).

---

## Roles del sistema

| Rol | Quién es | Qué hace en la app |
|---|---|---|
| **Enganchador / Chofer** | Operador de campo | Registra enganches, traslados y desenganches desde el celular. Ve sus propias actas. |
| **Supervisor** | Supervisión de flota | Monitorea la operación, consulta el historial completo, carga actas manuales, ve reportes, edita y anula actas. No opera enganches ni configura la flota. |
| **Administrador** | Administración de BACAR | Todo lo del supervisor + configuración de grúas, corralones, duplas, usuarios y turnos. |
| **Super Admin** | Administración del sistema | Todo lo del administrador + gestión de otros administradores. Es el único que puede crear usuarios Super Admin. |

El indicador del rol activo aparece en la esquina superior derecha de la pantalla (por ejemplo: "Enganchador", "Supervisor", "Administrador", "Super Admin").

---

# 1. Acceso al sistema

## 1.1 Ingresar a la aplicación

**Descripción**

La aplicación es una app web que funciona en el navegador del celular o de la computadora. No se descarga de ninguna tienda de aplicaciones.

**Ubicación en el sistema**

`https://gruasbacar.web.app`

**Procedimiento**

1. Abrir el navegador (Chrome recomendado) e ingresar a `https://gruasbacar.web.app`.
2. Completar el campo **Correo Electrónico**.
3. Completar el campo **Contraseña**. El ícono del ojo permite ver lo que se está escribiendo.
4. Presionar **"Ingresar"**.
5. El sistema abre automáticamente la pantalla de inicio que corresponde al rol del usuario.

**Consideraciones**

- **No existe el registro por cuenta propia.** Las cuentas las crea el administrador. Si necesitás una cuenta, contactá al administrador del sistema.
- **Si olvidaste tu contraseña**, contactá al administrador para que te la restablezca.
- Si aparece el mensaje *"Error al iniciar sesión. Verifique sus credenciales."*, revisá que el correo y la contraseña estén bien escritos.

## 1.2 Instalar la app en el celular (recomendado para operadores)

**Procedimiento**

1. Abrir `https://gruasbacar.web.app` en Chrome desde el celular.
2. Tocar el menú del navegador (⋮) y elegir **"Agregar a la pantalla de inicio"** (o "Instalar aplicación").
3. Confirmar. La app queda con su ícono en la pantalla del celular y se abre a pantalla completa, como una app nativa.

**Consideraciones**

- La primera vez que se usa la cámara o el GPS, el navegador pide permiso. **Aceptar siempre los permisos de cámara y ubicación** — sin ellos no se pueden registrar las fotos ni la posición del enganche.

## 1.3 Cerrar sesión

En la barra superior, presionar el botón **"Salir"**. En el celular, primero abrir el menú (≡).

---

# 2. Manual del Operador (Enganchador / Chofer)

El operador ejecuta el ciclo completo de un servicio: **configurar el turno → enganche → traslado → desenganche**. Todo se hace desde el celular, en el lugar de los hechos.

## 2.1 Pantalla de inicio

**Descripción**

Es la pantalla principal del operador. Muestra el saludo con tu nombre, la fecha y hora actual, el turno del día y el acceso para iniciar un nuevo servicio.

**Ubicación en el sistema**

`Inicio` (se abre automáticamente al ingresar)

**Elementos principales**

- **Turno de hoy:** tarjeta con el tipo de operación (Tránsito o Transporte), la grúa asignada y la dupla. El botón **"Cambiar"** permite reconfigurarlo.
- **Botón "NUEVO ENGANCHE"** (naranja): inicia el registro de un servicio.
- **Botón "Ver mis actas"**: abre el historial personal.
- **Servicio Activo Detectado:** si quedó un servicio en proceso, aparece una tarjeta azul con la patente y el estado, y dos opciones:
  - **"Reanudar Proceso"** — continúa el servicio desde el paso donde quedó.
  - **"Liberar Grúa"** — cancela el servicio activo (pide confirmación) y deja la grúa libre para un nuevo enganche.

**Consideraciones**

- Solo se puede tener **un servicio activo a la vez**. Hasta que no se cierre (o se libere), no se puede iniciar otro enganche.
- Si aparece el aviso **"Turno no coincide con tu usuario"**, significa que la dupla del turno guardado no corresponde a tu usuario. Presioná **"Configurar turno de hoy"** para corregirlo, o pedile al administrador que actualice la dupla.

## 2.2 Configurar el turno del día

**Descripción**

Al inicio de cada jornada, el operador indica con qué grúa va a trabajar. La dupla (chofer + enganchador) la asigna el administrador y se muestra de forma automática. Esta configuración se autocompleta después en cada enganche, para no cargar los mismos datos en cada servicio.

**Ubicación en el sistema**

`Inicio → Configurá tu turno de hoy` (el formulario se abre solo si todavía no configuraste el turno; también desde el botón "Cambiar" de la tarjeta "Turno de hoy")

**Procedimiento**

1. Elegir el **tipo de operación**: **"TRANSITO"** o **"TRANSPORTE"**. Según lo elegido, solo se muestran grúas de ese tipo.
2. Seleccionar la **grúa asignada** del desplegable.
3. Verificar la **dupla de trabajo** que muestra el sistema (chofer + enganchador). Este dato no se edita acá: lo asigna el administrador.
4. Presionar **"Confirmar turno del día"**.

**Consideraciones**

- El turno **vence a las 8 horas** de confirmado. Pasado ese tiempo, el sistema vuelve a pedir la configuración.
- Si aparece *"No tenés una dupla asignada..."* o *"No hay grúas o duplas habilitadas de tipo..."*, contactá al administrador para que configure los recursos.
- Se puede posponer con **"Configurar más tarde"**: en ese caso, el sistema pedirá el turno al iniciar el primer enganche.

## 2.3 Registrar un enganche

**Descripción**

El enganche es el inicio del servicio: se registra el vehículo infractor, se confirman los datos y se documenta el estado del vehículo con fotos. El número de acta **lo genera el sistema automáticamente** — no hay que tipearlo.

**Ubicación en el sistema**

`Inicio → NUEVO ENGANCHE`

El flujo tiene 3 pasos, indicados arriba de la pantalla: **Datos → Firma → Fotos**.

### Paso 1 — Carga de Datos

1. Verificar la tarjeta **"ASIGNACIONES DE SERVICIO"** (chofer, enganchador y grúa del turno). Estos datos no son editables acá.
2. Escribir la **Patente / Dominio** del vehículo infractor. Formatos válidos: `AAA123` (formato viejo), `AA123BB` (Mercosur) o **`S/N`** si el vehículo no tiene patente legible.
3. Cuando la patente es válida aparece una tilde verde. Presionar **"Siguiente Paso"**.

### Paso 2 — Verificar Datos

1. Revisar el resumen: patente, grúa, chofer y enganchador.
2. Si algo está mal, presionar **"Volver a editar"**.
3. Si está todo bien, presionar **"Confirmar Enganche"**. En este momento el servicio queda registrado en el sistema con fecha, hora y ubicación GPS.

### Paso 3 — Fotos del enganche

1. Tocar el botón principal de fotos: el sistema **guía la captura en orden**: delantera → copiloto → trasera → piloto (**4 fotos obligatorias**).
2. Opcionalmente, agregar **hasta 3 fotos adicionales** (por ejemplo, de un daño preexistente).
3. Opcionalmente, escribir un comentario.
4. Presionar **"Confirmar Fotos"**. El sistema sube las fotos e inicia el traslado automáticamente.

**Consideraciones**

- Las fotos se sacan **solo con la cámara** — no se puede elegir de la galería. Esto garantiza que las fotos sean del momento del enganche.
- **Si se recarga la página o se cierra el navegador durante la captura, las fotos no se pierden**: al volver al paso de fotos se restauran automáticamente (se conservan hasta 24 horas).
- Si no hay señal, el sistema muestra *"Sin conexión a internet. Verificá tu señal e intentá de nuevo."* — las fotos y los datos **no se pierden**; reintentá cuando vuelva la señal.
- La ubicación GPS se captura sola. Si el GPS no responde (por ejemplo en un lugar cerrado), el enganche **no se bloquea** — se registra igual.

## 2.4 Traslado

**Descripción**

Pantalla de espera mientras el vehículo viaja al corralón. Muestra la patente bajo custodia, la hora de inicio, la grúa activa, la dupla y el punto GPS de origen.

**Procedimiento**

1. Trasladar el vehículo al corralón de destino.
2. Al llegar, **estacionar la grúa** (la pantalla lo recuerda: *"ESTACIONAR GRÚA ANTES DE INICIAR EL REGISTRO FOTOGRÁFICO"*).
3. Presionar **"Proceder al Desenganche"**.

## 2.5 Registrar el desenganche

**Descripción**

Cierra el servicio: se registra el corralón de entrega, se documenta el estado del vehículo con fotos y se firma el acta. El flujo tiene 3 pasos: **Ubicación → Fotos → Acta**.

### Paso 1 — Ubicación del desenganche

1. Seleccionar el **"Corralón de entrega"** del desplegable. El sistema muestra la dirección de descarga del corralón elegido.
2. Presionar **"Confirmar llegada"**. Se registra la hora y la ubicación GPS de llegada.

### Paso 2 — Fotos del desenganche

1. Igual que en el enganche: **4 fotos obligatorias** guiadas (delantera, copiloto, trasera, piloto) + **hasta 3 adicionales**.
2. Opcionalmente, escribir un comentario (por ejemplo: *"entrega con llaves, daño preexistente..."*).
3. Presionar **"Confirmar Fotos"**.

### Paso 3 — Confirmación del Desenganche

1. Revisar el resumen: lugar de depósito y grilla de fotos capturadas.
2. Opcionalmente, completar **"Observaciones generales de la entrega"**.
3. Presionar **"Cerrar acta"**.
4. El sistema confirma el cierre y libera la grúa. Vuelve a la pantalla de inicio, listo para un nuevo servicio.

## 2.6 Mis Actas

**Descripción**

Historial personal del operador: todos los servicios que registró, con su estado, fotos y detalle completo.

**Ubicación en el sistema**

`Menú → Mis Actas` (o botón "Ver mis actas" en el inicio)

**Funcionalidad**

- **Buscar** por patente del vehículo o de la grúa.
- Cada acta muestra: patente, estado (**"ENTREGADA"** en verde o **"EN CURSO"** en ámbar), grúa, fecha, corralón y cantidad de fotos.
- Al tocar un acta se abre el **detalle completo**: datos generales, evento de enganche (lugar, fotos, observaciones) y evento de desenganche (corralón, lugar, fotos, observaciones).

**Consideraciones**

- Acá se ven solo las actas propias. Las actas anuladas no aparecen en esta vista.
- El operador **no puede editar** un acta cerrada. Si hay un error en los datos, avisar al supervisor o administrador para que lo corrija.

## 2.7 Qué tener en cuenta en campo (resumen para el operador)

- **Configurá el turno al empezar la jornada** — dura 8 horas.
- **Aceptá los permisos de cámara y GPS** la primera vez que la app los pida.
- **Un solo servicio a la vez**: cerrá o liberá el activo antes de iniciar otro.
- **El número de acta lo pone el sistema** — no hace falta ningún dato del acta en papel.
- **Vehículo sin patente:** escribí `S/N` en el campo de patente.
- **Sin señal:** no cierres la app; los datos y fotos quedan guardados y podés reintentar cuando vuelva la conexión.
- **Batería o recarga accidental:** las fotos sacadas se restauran solas al volver a entrar.
- **Cargá las fotos con buena luz y el vehículo completo en cuadro** — son la evidencia del estado del vehículo al momento del enganche y de la entrega.

---

# 3. Manual del Supervisor

El supervisor monitorea la operación y audita las actas. No opera enganches ni configura la flota.

## 3.1 Dashboard de supervisión

**Descripción**

Pantalla de inicio del supervisor. Muestra los indicadores del día (actas registradas, actas en curso, grúas en operación) y los accesos a sus herramientas.

**Ubicación en el sistema**

`Menú → Dashboard` (se abre automáticamente al ingresar)

**Accesos desde el menú:** "Dashboard", "Cargar acta manual", "Historial", "Reportes".

## 3.2 Historial de Actas

**Descripción**

Listado completo de todas las actas del sistema, con filtros, detalle, edición, anulación y exportación a PDF.

**Ubicación en el sistema**

`Menú → Historial`

**Funcionalidad**

- **Pestañas:** "General" (todas, incluidas anuladas), "Activas" (sin anuladas), "Anulados" (solo anuladas).
- **Filtros:** búsqueda por texto (patente, grúa), estado, tipo de flota, dupla, corralón y rango de fechas. El botón **"Limpiar filtros"** los resetea.
- Al tocar un acta se abre el **detalle completo** con las mismas secciones que ve el operador, más las acciones de gestión.

**Procedimiento — Editar un acta**

1. Abrir el acta desde el historial.
2. Presionar **"Editar acta"**.
3. Corregir los campos necesarios: patente, número de infracción, grúa, corralón, chofer, enganchador, tipo de flota.
4. Presionar **"Guardar cambios"**.

**Procedimiento — Anular un acta**

1. Abrir el acta y presionar **"Anular acta"**.
2. Completar el **motivo de anulación** (obligatorio).
3. Confirmar con **"Anular acta"**.

**Procedimiento — Exportar a PDF**

1. Abrir el acta y presionar **"Exportar PDF"**. Se descarga el acta con sus datos y fotos.

**Consideraciones**

- **Las actas no se borran nunca**: la anulación las marca como anuladas pero quedan visibles (pestaña "Anulados") con su motivo, quién anuló y cuándo.
- Cada edición queda registrada en el **historial de versiones** del acta (auditoría): se puede consultar qué se cambió, quién y cuándo.
- La edición corrige **datos**, no el estado: un acta no puede "volver atrás" de estado manualmente.

## 3.3 Cargar acta manual

**Descripción**

Permite registrar un servicio completo que ocurrió fuera de la app (por ejemplo, si el operador no pudo usar el sistema en campo). Es un respaldo operativo — el flujo normal es que el operador registre el servicio en el momento.

**Ubicación en el sistema**

`Menú → Cargar acta manual`

**Procedimiento**

1. **Datos básicos:** patente del infractor, grúa, corralón, chofer y enganchador (el legajo se completa solo al elegir el enganchador).
2. **Ubicaciones:** lugar del enganche y lugar de llegada al corralón (texto libre o link de Google Maps).
3. **Fotos del enganche:** 4 obligatorias + hasta 3 adicionales.
4. **Fotos del desenganche (opcional):** marcar la casilla si se incluyen y cargar el lote.
5. **Observaciones generales** (opcional).
6. Presionar **"Guardar acta manual"**.

**Consideraciones**

- El número de acta también se genera automáticamente en la carga manual.
- Las actas manuales quedan marcadas como de **origen manual** para la auditoría.

## 3.4 Reportes

**Descripción**

Análisis de la operación con indicadores, gráficos y exportación de datos.

**Ubicación en el sistema**

`Menú → Reportes`

**Procedimiento**

1. Elegir los **filtros**: rango de fechas, dupla, grúa, corralón, estado, tipo de flota, operario.
2. Presionar **"Generar reporte"**.
3. Revisar los resultados:
   - **Indicadores:** total de actas, duración promedio, completadas, en proceso.
   - **Gráficos:** actas por día, por dupla, por corralón y por tipo de flota.
   - **Tabla de detalle** por acta.
4. Opcionalmente, presionar **"Exportar CSV"** para descargar los datos (se abren con Excel).

---

# 4. Manual del Administrador y Super Admin

El administrador tiene todas las herramientas del supervisor (historial, actas manuales, reportes) **más** la configuración del sistema: flota, corralones, duplas, usuarios y turnos.

## 4.1 Dashboard de Administración

**Descripción**

Pantalla de inicio del administrador. Muestra los indicadores generales: **Actas este mes** (con acceso directo a Reportes), **Actas en Enganche**, **Actas en Traslado**, **Actas Finalizadas** y **Grúas en operación**.

**Ubicación en el sistema**

`Menú → Dashboard Admin`

## 4.2 Configuración (Grúas, Corralones, Duplas, Usuarios)

**Ubicación en el sistema**

`Menú → Configuración` — panel con cuatro pestañas: **Duplas**, **Grúas**, **Corralones**, **Usuarios**. Desde la barra lateral de este panel también se accede a **Turnos**.

En todas las pestañas el esquema es el mismo: un formulario de alta arriba y la lista abajo, con búsqueda y filtros por estado. Cada registro tiene acciones de **Editar**, **Desactivar/Activar** y **Eliminar**.

> **Recomendación general:** ante la duda, **desactivar en vez de eliminar**. Un recurso desactivado deja de aparecer en los selectores del operador pero conserva su historial.

### Grúas

**Procedimiento — Crear una grúa**

1. Completar **Patente** (en mayúsculas, ej.: `ABC123`).
2. Completar **Descripción** (opcional, ej.: "Grúa 4 - Plancha").
3. Elegir el **Tipo**: Tránsito o Transporte.
4. Presionar **"Crear grúa"**.

Si la patente ya existe, el sistema avisa: *"Ya existe una grúa con esa patente."*

### Corralones

**Procedimiento — Crear un corralón**

1. Completar **Nombre** y **Dirección**.
2. Opcionalmente, pegar un **link de mapa** (Google Maps).
3. Presionar **"Crear corralón"**.

### Duplas

**Descripción**

La dupla es el par operativo **chofer + enganchador** que trabaja con una grúa. El sistema la vincula a los usuarios por legajo, por lo que primero deben existir los usuarios.

**Procedimiento — Crear una dupla**

1. Elegir el **Chofer** (usuarios con rol Chofer).
2. Elegir el **Enganchador** (usuarios con rol Enganchador).
3. Elegir el **Tipo**: Tránsito o Transporte.
4. Opcionalmente, asignar la **Grúa habitual** (filtrada por tipo).
5. Presionar **"Crear dupla"**.

**Import masivo:** el botón **"Import masivo"** permite cargar varias duplas de una vez.

**Consideraciones**

- La dupla que ve el operador en su turno **sale de esta configuración**. Si un operador reporta el aviso *"Turno no coincide con tu usuario"*, revisar acá que su dupla esté bien armada.

### Usuarios

**Procedimiento — Crear un usuario**

1. Completar **Email** (va a ser su usuario de ingreso), **Contraseña** inicial y **Nombre** completo.
2. Elegir los **Roles**. Un usuario puede tener más de uno (ej.: Admin + Enganchador).
3. Completar el **Legajo** — obligatorio para operadores (se usa para organizar las fotos y vincular las duplas).
4. Presionar **"Crear usuario"**.

**Consideraciones**

- **Entregar el email y la contraseña inicial al usuario personalmente.** El usuario no puede cambiar su contraseña desde la app: si necesita cambiarla, la restablece el administrador.
- El email **no se puede editar** después de creado.
- Para dar de baja a alguien, usar **Desactivar** — la cuenta deja de poder ingresar pero su historial de actas se conserva.
- El rol **Super Admin solo puede asignarlo otro Super Admin** (la opción no aparece para administradores comunes).

## 4.3 Turnos

**Descripción**

Administración de las asignaciones diarias de los operadores: qué grúa y qué dupla tiene cada uno en su jornada.

**Ubicación en el sistema**

`Configuración → barra lateral → Turnos`

**Consideraciones**

- El turno del operador **vence a las 8 horas**; después de eso debe reconfigurarlo.
- Si una dupla cambia (rotación mensual), actualizarla en la pestaña Duplas para que el turno del operador tome los datos correctos.

## 4.4 Historial, actas manuales y reportes

El administrador usa las mismas pantallas que el supervisor:

- **Historial** — ver [sección 3.2](#32-historial-de-actas) (editar, anular, exportar PDF).
- **Cargar acta manual** — ver [sección 3.3](#33-cargar-acta-manual).
- **Reportes** — ver [sección 3.4](#34-reportes).

## 4.5 Super Admin

El Super Admin usa la app exactamente igual que un administrador, con dos diferencias:

- Puede **crear y editar usuarios con rol Super Admin** (opción invisible para admins comunes).
- Es el nivel máximo de permisos: pasa todas las verificaciones de administrador del sistema.

**Recomendación:** mantener la menor cantidad posible de cuentas Super Admin (idealmente una o dos) y usar cuentas Admin para la gestión diaria.

---

# 5. Preguntas frecuentes y problemas comunes

**No puedo iniciar sesión.**
Verificá el correo y la contraseña. Si el problema persiste, tu cuenta puede estar desactivada o la contraseña necesita restablecerse — contactá al administrador.

**¿Dónde ingreso el número de acta?**
En ningún lado: el sistema lo genera automáticamente al confirmar el enganche (o al guardar un acta manual). Aparece en el detalle del acta.

**El vehículo no tiene patente.**
Escribí `S/N` en el campo de patente.

**Me quedé sin señal en medio de un enganche.**
No cierres la app. El sistema avisa *"Sin conexión a internet..."* y conserva los datos y las fotos. Cuando vuelva la señal, volvé a presionar el botón de confirmación.

**Se me cerró el navegador mientras sacaba las fotos.**
Al volver a entrar y reanudar el servicio, las fotos ya sacadas se restauran solas (se conservan hasta 24 horas).

**Quedó un servicio "colgado" y no puedo iniciar uno nuevo.**
En la pantalla de inicio, en la tarjeta "Servicio Activo Detectado", usá **"Reanudar Proceso"** para continuarlo o **"Liberar Grúa"** para cancelarlo. Si no aparece la opción, un supervisor o administrador puede anular el acta desde el Historial.

**El turno me pide configurarse de nuevo.**
Es normal: la asignación diaria vence a las 8 horas de confirmada. Configurala de nuevo al inicio de cada jornada.

**Aparece "Turno no coincide con tu usuario".**
La dupla guardada en el turno no corresponde a tu usuario. Reconfigurá el turno con **"Configurar turno de hoy"**; si la dupla que muestra el sistema es incorrecta, pedile al administrador que la actualice en Configuración → Duplas.

**No aparece mi grúa / mi dupla en el selector.**
El selector filtra por el tipo de operación elegido (Tránsito/Transporte) y muestra solo recursos activos. Verificá el tipo elegido; si sigue sin aparecer, el administrador debe activar o crear el recurso.

**Cargué mal un dato en un acta ya cerrada.**
El operador no puede editar actas. Avisá a un supervisor o administrador: ellos corrigen los datos desde el Historial (la corrección queda registrada en el historial de versiones del acta).

**¿Puedo borrar un acta?**
No. Las actas nunca se borran: se **anulan** con un motivo y quedan visibles en la pestaña "Anulados" del Historial.

**La cámara ofrece la galería en vez de abrir la cámara directa.**
Algunos celulares muestran un selector. Elegí siempre la opción de **cámara** — el registro debe ser del momento.

**El GPS tarda o falla.**
En interiores o con señal débil el GPS puede no responder. El flujo no se bloquea: el servicio se registra igual y podés continuar.
