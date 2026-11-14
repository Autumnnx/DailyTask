# Guía de usuario

## 1. Abrir la aplicación

Abre la dirección donde esté desplegada DailyTask (en local, `http://localhost:5173`; ver [Desarrollo local](desarrollo-local.md)). Si no hay una sesión activa, se muestra el inicio de sesión. Mientras se comprueba la sesión aparece brevemente "Cargando…".

## 2. Crear una cuenta

1. En la pantalla de inicio de sesión, selecciona **Crea una cuenta**.
2. Escribe tu nombre, un nombre de usuario, una contraseña y su confirmación.
3. Reglas:
   - **Nombre:** entre 2 y 100 caracteres; es el que se muestra en la aplicación.
   - **Nombre de usuario:** entre 3 y 30 caracteres; letras, números, `.`, `-` o `_`, empezando y terminando con letra o número. Se guarda en minúsculas (`Ana.Dev` y `ana.dev` son el mismo usuario).
   - **Contraseña:** entre 6 y 128 caracteres. No hay otros requisitos.
4. Selecciona **Crear cuenta**. Si todo es válido, se crea la cuenta y se abre el tablero con la sesión iniciada.

No se pide correo electrónico. Si el nombre de usuario ya existe, se indica en el propio campo.

## 3. Iniciar y cerrar sesión

- En **Inicia sesión**, introduce tu nombre de usuario y tu contraseña.
- Si alguno es incorrecto se muestra "Usuario o contraseña incorrectos." (por seguridad no se indica cuál).
- Tras varios intentos fallidos seguidos, el servidor pide esperar un momento antes de volver a intentarlo.
- **Cerrar sesión** termina la sesión en el servidor y devuelve a la pantalla de acceso.
- Si ya tienes una sesión activa, las pantallas de registro e inicio de sesión te llevan al tablero.

La sesión se mantiene al recargar o cerrar el navegador durante 7 días sin actividad (30 días como máximo). Cuando caduca, la aplicación vuelve al inicio de sesión con el aviso "Tu sesión ha caducado".

## 4. Usar el tablero

El tablero muestra tus tareas en tres columnas:

| Estado | Significado |
|---|---|
| Pendiente | La tarea aún no se ha iniciado |
| En progreso | La tarea está en curso |
| Completada | La tarea se terminó |

Las tareas de cada columna se ordenan por fecha de vencimiento ascendente y, cuando hay empate, por prioridad (alta antes que media y baja). El resumen superior indica cuántas tareas se completaron, el porcentaje de avance y, cuando corresponda, cuántas tareas pendientes o en progreso están vencidas.

## 5. Crear una tarea

1. Selecciona **Nueva tarea** (o **Crear mi primera tarea** si la lista está vacía).
2. Completa el título, la descripción opcional, la fecha de vencimiento, la prioridad y el estado.
3. Selecciona **Crear tarea**. El botón muestra "Guardando…" hasta que el servidor responde.

Validaciones:

- El título debe tener entre 3 y 80 caracteres, sin contar espacios al principio o al final.
- La descripción puede tener hasta 400 caracteres.
- Debe seleccionarse una fecha de vencimiento válida.
- La prioridad puede ser **Alta**, **Media** o **Baja**.

La fecha y prioridad iniciales son la fecha de hoy y **Media**. El estado inicial es **Pendiente**.

Cada cuenta puede guardar hasta **1.000 tareas**. Al llegar al límite, el formulario lo indica y hay que eliminar alguna antes de crear otra.

Si algo falla (por ejemplo, el servidor no está disponible), el formulario sigue abierto con lo que escribiste y muestra el motivo.

## 6. Editar, cambiar estado y eliminar

- **Editar** abre el formulario con los valores actuales; guarda con **Guardar cambios**.
- El círculo de la tarjeta marca la tarea como completada o la reabre; el selector de la tarjeta permite elegir cualquier estado.
- **Eliminar** pide confirmación. La eliminación es permanente.

Una tarea que pasa a **Completada** registra cuándo se completó. Si se edita sin salir de ese estado, se conserva esa fecha; si se mueve a otro estado, la fecha de finalización se elimina.

## 7. Buscar y filtrar

- Busca texto en el título o en la descripción. La búsqueda no distingue mayúsculas ni tildes.
- Filtra por estado, por prioridad o por ambos a la vez.
- **Limpiar filtros** restablece la búsqueda y ambos selectores.
- Si se elige un estado concreto, el tablero muestra únicamente la columna correspondiente.

El resumen de tareas corresponde a todas tus tareas, no solamente a las visibles tras aplicar filtros.

## 8. Datos y dispositivos

Las cuentas y las tareas se guardan en el servidor (base de datos MySQL), así que puedes entrar con tu usuario desde cualquier navegador o dispositivo y verás las mismas tareas. Cada usuario solo puede ver y modificar sus propias tareas. No existe recuperación de contraseña (no se pide correo). Más detalles en [Datos, privacidad y seguridad](datos-y-seguridad.md).
