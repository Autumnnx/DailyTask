# DailyTask

Aplicación web para registrar, organizar y gestionar tareas diarias. Proyecto académico de la asignatura **Herramientas de Software** (Actividad 6: aplicación de un framework de frontend).

<p align="center">
  <a href="https://dailytask-ww8p.onrender.com">
    <img src="https://img.shields.io/badge/Ver%20demo-en%20vivo-0f766e?style=for-the-badge" alt="Ver demo en vivo de DailyTask" />
  </a>
</p>

Saludos cordiales al profesor Jeferson Urrego: muchas gracias por acompañarnos y guiarnos en este semestre académico.

## ¿Qué puedes hacer?

- Crear una cuenta (nombre de usuario, nombre visible y contraseña) e iniciar sesión desde cualquier navegador.
- Crear, editar, eliminar y cambiar el estado de tus tareas.
- Asignar fecha de vencimiento, prioridad y estado.
- Organizar las tareas en un tablero de tres columnas.
- Buscar por título o descripción y filtrar por estado y prioridad.
- Consultar el porcentaje de tareas completadas y las tareas vencidas.
- Usar la interfaz en escritorio, tableta o móvil.

## Tecnologías

| Tecnología | Uso |
|---|---|
| React 19 | Interfaz basada en componentes y hooks |
| TypeScript 5 | Tipado estático |
| Vite 7 | Servidor de desarrollo y compilación |
| React Router 7 | Rutas y navegación |
| CSS propio | Estilos y diseño adaptable |
| API propia (`server/`) | Fastify 5 + TypeScript: autenticación, sesiones y tareas |
| MySQL 8 | Persistencia de usuarios, sesiones y tareas |

> **Rama `backend`:** el frontend ya no guarda usuarios ni tareas en el navegador. Todo pasa por la API (`/api`) y se almacena en MySQL. La sesión es una cookie `HttpOnly` (`dt_session`) que gestiona el servidor; el frontend no guarda tokens. La demo publicada en Render corresponde a la versión anterior, solo frontend.

## Inicio rápido (frontend + API + MySQL local)

**Requisitos:** Node.js `>=22.18` y npm; Podman o Docker para el MySQL de desarrollo.

```bash
# 1. API y base de datos (en server/)
cd server
npm ci
cp .env.example .env
npm run db:dev up      # MySQL 8.4 local en 127.0.0.1:3307
npm run db:init        # crea las tablas
npm run dev            # API en http://127.0.0.1:3000

# 2. Frontend (en otra terminal, en la raíz del repositorio)
npm ci
npm run dev            # http://localhost:5173 — /api se reenvía a la API
```

Detalles de la API en [`server/README.md`](server/README.md).

| Comando (raíz) | Resultado |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite con proxy `/api` → `127.0.0.1:3000` |
| `npm run build` | Comprueba TypeScript y genera la aplicación en `dist/` |
| `npm run preview` | Sirve la compilación de producción (también con proxy `/api`) |
| `npm run typecheck` | Ejecuta la comprobación de TypeScript |

## Documentación

- [Índice de documentación](docs/README.md)
- [Guía de usuario](docs/guia-de-usuario.md)
- [Arquitectura y modelo de datos](docs/arquitectura.md)
- [Desarrollo local](docs/desarrollo-local.md)
- [Despliegue en Render](docs/despliegue-render.md)
- [Datos, privacidad y seguridad](docs/datos-y-seguridad.md)
- [Planificación del backend y estado actual](docs/backend-planning/HANDOFF.md)

> Las guías de `docs/*.md` (usuario, arquitectura, datos, desarrollo local, despliegue) describen todavía la versión anterior con `localStorage`; se actualizarán antes del despliegue real. La documentación vigente del backend está en `docs/backend-planning/` y `server/README.md`.

## Estructura principal

```text
src/
├── components/    Componentes de interfaz reutilizables
├── context/       Estado global de autenticación
├── hooks/         Lógica de tareas
├── pages/         Pantallas y rutas
├── styles/        Estilos CSS
├── types/         Tipos de usuario, tarea y filtros
├── utils/         Cliente de la API (api.ts), validaciones, fechas y utilidades
├── App.tsx        Definición de rutas
└── main.tsx       Punto de entrada
server/            API REST (Fastify + MySQL)
docs/              Guías y documentación del proyecto
render.yaml        Configuración de Render del despliegue anterior (solo frontend)
```

## Despliegue

La demo publicada en [dailytask-ww8p.onrender.com](https://dailytask-ww8p.onrender.com) es la versión anterior, solo frontend ([guía de despliegue](docs/despliegue-render.md)). La versión con API y MySQL necesita un servidor Node y una base de datos; su despliegue está pendiente (ver `docs/backend-planning/ROADMAP.md`).
