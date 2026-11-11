# Documentación de DailyTask

Esta carpeta contiene las guías funcionales y técnicas del proyecto. Está dirigida tanto a las personas que usan la aplicación como a quienes necesitan instalarla, mantenerla o desplegarla.

## Guías

| Documento | Contenido |
|---|---|
| [Guía de usuario](guia-de-usuario.md) | Registro, acceso, tablero, administración de tareas y filtros |
| [Arquitectura](arquitectura.md) | Tecnologías, rutas, componentes, flujo de datos y modelo de tarea |
| [Desarrollo local](desarrollo-local.md) | Requisitos, instalación, comandos y solución de problemas |
| [Despliegue en Render](despliegue-render.md) | Publicación como sitio estático, configuración y comprobaciones |
| [Datos y seguridad](datos-y-seguridad.md) | Persistencia, privacidad, límites de la autenticación y almacenamiento |

## Resumen del producto

DailyTask es una aplicación de gestión de tareas construida con React, TypeScript y Vite. Permite registrar tareas personales, establecer prioridades y fechas, moverlas entre estados y consultar el avance desde un tablero.

La aplicación no incluye API, servidor de autenticación ni base de datos. El navegador guarda los datos con `localStorage`; por ello, cada navegador y perfil mantiene su propia información. Esta decisión es adecuada para el alcance didáctico del proyecto, pero no ofrece sincronización ni controles de seguridad de servidor.

## Demo

[Abrir DailyTask](https://dailytask-ww8p.onrender.com)
