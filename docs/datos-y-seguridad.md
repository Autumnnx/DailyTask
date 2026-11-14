# Datos, privacidad y seguridad

Resumen para usuarios y evaluadores. El detalle técnico está en [`backend-planning/SECURITY.md`](backend-planning/SECURITY.md) y [`backend-planning/DATABASE.md`](backend-planning/DATABASE.md).

## Dónde se guardan los datos

- Cuentas, sesiones y tareas se guardan en el **servidor**, en una base de datos MySQL 8.
- El navegador no guarda usuarios ni tareas: el frontend no usa `localStorage` ni `sessionStorage`.
- El único dato en el navegador es la cookie de sesión `dt_session`, que el servidor crea al iniciar sesión.
- Puedes entrar desde cualquier navegador o dispositivo con tu usuario y verás las mismas tareas.

## Contraseñas

- Solo se pide que tengan entre 6 y 128 caracteres; no hay reglas de complejidad. Usa una contraseña que no utilices en otros servicios.
- Nunca se guardan en texto plano: el servidor guarda un hash **Argon2id** con sal aleatoria.
- No hay recuperación de contraseña (la aplicación no pide correo electrónico).

## Sesión

- La cookie `dt_session` es `HttpOnly` (el código JavaScript de la página no puede leerla) y `SameSite=Lax`; en producción, además, `Secure` (solo HTTPS).
- En el servidor solo se guarda un resumen (SHA-256) del token, no el token.
- Caduca tras 7 días sin actividad o, en cualquier caso, a los 30 días. **Cerrar sesión** la revoca en el servidor.

## Separación entre usuarios

Cada usuario solo puede ver, modificar y eliminar sus propias tareas. El servidor identifica al usuario por la sesión, nunca por datos enviados desde el navegador, y una tarea ajena se responde como inexistente.

## Protección frente a abusos

- Límite de intentos de inicio de sesión (por dirección IP y por nombre de usuario) y de registros por IP, y un límite general de peticiones.
- Las peticiones que modifican datos solo se aceptan desde el origen de la aplicación (protección CSRF) y en formato JSON.
- Los mensajes de error no muestran detalles internos del servidor ni de la base de datos.

## Límites

- Máximo de 1.000 tareas por usuario.
- Proyecto académico, desplegado durante un periodo corto: no incluye copias de seguridad automáticas para usuarios, exportación de datos ni eliminación de cuenta desde la interfaz.
