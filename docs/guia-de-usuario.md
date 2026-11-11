# Guía de usuario

## 1. Abrir la aplicación

Visita la [demo de DailyTask](https://dailytask-ww8p.onrender.com). La aplicación muestra el inicio de sesión si no hay una sesión guardada en ese navegador.

## 2. Crear una cuenta

1. En la pantalla de inicio de sesión, selecciona **Crea una cuenta**.
2. Escribe tu nombre, correo electrónico, contraseña y confirmación de contraseña.
3. Usa un nombre de al menos 2 caracteres, un correo con formato válido y una contraseña de al menos 6 caracteres.
4. Selecciona **Crear cuenta**. Si todo es válido, se crea la cuenta local y se abre el tablero.

No se permite registrar otra cuenta con el mismo correo dentro de los datos guardados en ese navegador. El correo se normaliza a minúsculas y se eliminan sus espacios al inicio y al final.

## 3. Iniciar y cerrar sesión

- En **Inicia sesión**, introduce el correo y la contraseña usados durante el registro.
- Un correo o contraseña incorrectos muestran un mensaje de error.
- **Cerrar sesión** termina la sesión guardada y devuelve las rutas privadas a la pantalla de acceso.
- Si ya tienes una sesión activa, las pantallas de registro e inicio de sesión te redirigen al tablero.

La sesión permanece en el navegador hasta que se cierre sesión o se borren los datos locales del sitio.

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
3. Selecciona **Crear tarea**.

Validaciones aplicadas:

- El título debe tener entre 3 y 80 caracteres, sin contar espacios al principio o al final.
- La descripción puede tener hasta 400 caracteres.
- Debe seleccionarse una fecha de vencimiento.
- La prioridad puede ser **Alta**, **Media** o **Baja**.

La fecha y prioridad iniciales son la fecha de hoy y **Media**. El estado inicial es **Pendiente**.

## 6. Editar, cambiar estado y eliminar

- Usa la acción de edición de la tarjeta para abrir el formulario con sus valores actuales; guarda los cambios con **Guardar cambios**.
- Cambia el estado de la tarea desde las acciones disponibles en la tarjeta.
- Usa la acción para eliminar y confirma en el diálogo. La eliminación es permanente en los datos locales de ese navegador.

Una tarea que pasa a **Completada** registra cuándo se completó. Si se edita sin salir de ese estado, se conserva esa fecha; si se mueve a otro estado, la fecha de finalización se elimina.

## 7. Buscar y filtrar

- Busca texto en el título o en la descripción. La búsqueda no distingue mayúsculas ni tildes.
- Filtra por estado, por prioridad o por ambos a la vez.
- **Limpiar filtros** restablece la búsqueda y ambos selectores.
- Si se elige un estado concreto, el tablero muestra únicamente la columna correspondiente.

El resumen de tareas corresponde a todas las tareas del usuario, no solamente a las visibles tras aplicar filtros.

## 8. Persistencia y datos entre dispositivos

Las cuentas, la sesión y las tareas se guardan en el almacenamiento local del navegador. La información no se comparte entre usuarios de distintos navegadores, perfiles o dispositivos y no existe recuperación de contraseña en un servidor. Para detalles y límites, consulta [Datos, privacidad y seguridad](datos-y-seguridad.md).
