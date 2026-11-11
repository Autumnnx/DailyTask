# Datos, privacidad y seguridad

## Alcance

DailyTask es una demostración académica de frontend. No cuenta con una API, una base de datos remota, un proveedor de identidad ni controles de acceso en un servidor. La pantalla de inicio de sesión y sus protecciones son funcionalidad local del navegador; no deben considerarse un mecanismo de seguridad para datos sensibles.

## Dónde se guardan los datos

La aplicación utiliza `localStorage` bajo el origen del sitio abierto. Las claves son:

| Clave | Información |
|---|---|
| `dailytask.users` | Cuentas creadas en ese navegador |
| `dailytask.session` | ID de la sesión local actual |
| `dailytask.tasks` | Tareas creadas en ese navegador |

Esto significa que:

- Los datos persisten al cerrar o recargar la página, mientras no se borren los datos del sitio.
- Cada navegador, perfil de navegador, dispositivo y origen mantiene su propio almacenamiento.
- Crear una tarea en la demo no la guarda en Render ni la hace visible para otros dispositivos.
- No existe sincronización, recuperación de cuenta ni copia de seguridad automática.
- Quien tenga acceso al perfil del navegador puede inspeccionar o modificar el almacenamiento local.

## Contraseñas

En el flujo habitual, el registro crea una sal aleatoria y calcula un hash SHA-256 en el navegador. El código guarda el hash y la sal, no la contraseña en texto plano; la interfaz usa un objeto de sesión sin esos campos.

**Esto no convierte la autenticación en segura para producción.** SHA-256 es una función rápida y no está diseñada para almacenar contraseñas; además, todo el estado y la lógica residen bajo el control del navegador. El código incluye también una alternativa de hash simple para contextos donde no está disponible `crypto.subtle`, la cual no debe considerarse criptográfica. No reutilices contraseñas reales ni guardes información confidencial en esta demo.

Una aplicación de producción debería delegar la autenticación y autorización a un servicio backend o proveedor de identidad, almacenar contraseñas con un algoritmo apropiado para contraseñas y mantener los datos protegidos del lado del servidor.

## Aislamiento de tareas

El código filtra y modifica tareas por el `userId` local para que la interfaz de cada cuenta muestre sus propias tareas. Como no existe backend, esto es separación lógica del lado del cliente y no una barrera de seguridad: los datos del almacenamiento pueden manipularse desde el navegador.

## Almacenamiento limitado o no disponible

`src/utils/storage.ts` centraliza las operaciones de lectura y escritura. Las lecturas inválidas devuelven un valor inicial y algunos errores de acceso/escritura se manejan para permitir que la interfaz siga funcionando en memoria. Si el navegador bloquea el almacenamiento o alcanza su cuota, los cambios podrían no persistir después de recargar.

## Borrar los datos locales

Para borrar los datos de DailyTask, elimina los datos del sitio desde la configuración del navegador para el origen correspondiente. Esto puede cerrar la sesión y eliminar de forma permanente las cuentas y tareas guardadas localmente. No hay un mecanismo de recuperación desde Render.

## Recomendaciones de uso

- Usa datos de prueba y una contraseña única para la demostración.
- No almacenes información personal, financiera, académica sensible ni secretos.
- Cierra la sesión cuando compartas el mismo perfil del navegador.
- Para un despliegue con usuarios reales, implementa autenticación, autorización, persistencia y validaciones en un backend antes de usar datos reales.
