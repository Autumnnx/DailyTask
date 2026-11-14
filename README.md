# DailyTask

Aplicación web para registrar, organizar y gestionar tareas diarias. Proyecto académico de la asignatura **Herramientas de Software** (Actividad 6: aplicación de un framework de frontend).

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

> El frontend no guarda usuarios ni tareas en el navegador: todo pasa por la API (`/api`) y se almacena en MySQL. La sesión es una cookie `HttpOnly` (`dt_session`) que gestiona el servidor; el frontend no guarda tokens.

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
| `npm run preview` | Sirve la compilación de producción en `:4173` (también con proxy `/api`; ver [Desarrollo local](docs/desarrollo-local.md) para permitir ese origen) |
| `npm run typecheck` | Ejecuta la comprobación de TypeScript |

## Documentación

- [Índice de documentación](docs/README.md)
- [Guía de usuario](docs/guia-de-usuario.md)
- [Arquitectura y modelo de datos](docs/arquitectura.md)
- [Desarrollo local](docs/desarrollo-local.md)
- [Datos, privacidad y seguridad](docs/datos-y-seguridad.md)
- [Documentación técnica del backend](docs/backend-planning/HANDOFF.md) y [`server/README.md`](server/README.md)

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
server/            API REST (Fastify + MySQL); en producción sirve también el frontend
deploy/            Despliegue en NixOS: módulo, ejemplo y manual
docs/              Guías y documentación del proyecto
render.yaml        Despliegue anterior (solo frontend); fuera del alcance actual
```

## Despliegue

Producción: `https://dailytask.korikashi.uk`. Caddy (VPS Oracle) hace de proxy HTTPS por Tailscale hacia un único proceso Fastify en el HomeLab NixOS (puerto 8088), que sirve la API y el frontend compilado, con MySQL 8.4 nativo. El despliegue es manual: [`deploy/README.md`](deploy/README.md). El despliegue anterior en Render, solo frontend, está fuera del alcance actual ([documento histórico](docs/despliegue-render.md)).
