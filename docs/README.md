# Documentación de DailyTask

Esta carpeta contiene las guías funcionales y técnicas del proyecto.

## Guías vigentes

| Documento | Contenido |
|---|---|
| [Guía de usuario](guia-de-usuario.md) | Registro, acceso, tablero, administración de tareas y filtros |
| [Arquitectura](arquitectura.md) | Visión general: frontend, API, MySQL, rutas, código y modelo de datos |
| [Desarrollo local](desarrollo-local.md) | Requisitos, puesta en marcha de frontend + API + MySQL, comandos y problemas frecuentes |
| [Datos y seguridad](datos-y-seguridad.md) | Dónde se guardan los datos, contraseñas, sesión y protecciones |
| [API del backend](../server/README.md) | Endpoints, configuración y comandos de la API; referencia completa en `/api-docs` (OpenAPI 3.1 en `/openapi.json`) |

## Documentos históricos

| Documento | Contenido |
|---|---|
| [Despliegue en Render](despliegue-render.md) | Despliegue de la versión anterior (solo frontend). Fuera del alcance actual |

## Resumen del producto

DailyTask es una aplicación de gestión de tareas: frontend React + TypeScript + Vite, API propia Fastify + TypeScript y base de datos MySQL 8. Cada usuario se registra con nombre de usuario y contraseña, y gestiona sus tareas (prioridades, fechas y estados) desde un tablero. Los datos se guardan en el servidor y la sesión se mantiene con una cookie `HttpOnly`.
