# Arquitectura y modelo de datos

Visión general para orientarse en el código. La arquitectura detallada (decisiones, conexión con MySQL, plan de despliegue) está en [`backend-planning/ARCHITECTURE.md`](backend-planning/ARCHITECTURE.md) y el contrato de la API en [`backend-planning/API.md`](backend-planning/API.md).

## Visión general

```text
Navegador (React SPA)
└── fetch('/api/...')  — cookie HttpOnly dt_session (mismo origen)
        │
        ▼
API Fastify (server/)  — validación, autenticación, autorización, límites
        │  mysql2, consultas parametrizadas
        ▼
MySQL 8  — users · tasks · sessions
```

En desarrollo, Vite (`:5173`) reenvía `/api` a la API (`:3000`). En producción se servirán bajo el mismo dominio (pendiente de la fase de despliegue).

## Tecnologías

| Parte | Tecnologías |
|---|---|
| Frontend | React 19, TypeScript 5, Vite 7, React Router 7, CSS propio |
| API | Node.js, Fastify 5, TypeScript, `@fastify/cookie`, `@fastify/rate-limit`, `@node-rs/argon2` |
| Datos | MySQL 8 (`mysql2/promise`) |

## Rutas del frontend

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/login` | Inicio de sesión | Solo sin sesión |
| `/registro` | Registro | Solo sin sesión |
| `/` | Tablero | Requiere sesión |
| `*` | Página no encontrada | Libre |

`ProtectedRoute` y `PublicOnlyRoute` esperan a que termine la comprobación inicial de la sesión (`GET /api/auth/me`) antes de redirigir.

## Organización del código

```text
src/
├── context/AuthContext.tsx   Sesión: /api/auth/me al cargar, login, registro, logout
├── hooks/useTasks.ts         Tareas: carga y operaciones contra /api/tasks
├── utils/api.ts              Cliente fetch común (errores, sesión caducada)
├── utils/validators.ts       Validaciones (mismas reglas que el servidor)
├── utils/taskUtils.ts        Búsqueda, filtros y orden en el cliente
├── pages/, components/       Pantallas y componentes visuales
└── types/index.ts            SessionUser, Task, TaskInput, TaskFilters
server/src/
├── auth/                     Registro, login, logout, /me, sesiones, Argon2id
├── tasks/                    CRUD, estados, búsqueda, límite de 1.000 tareas
├── db/                       Pool MySQL, esquema e inicialización
└── http/                     Errores, verificación de Origin, límites de peticiones
```

## Flujo de autenticación

1. Registro o login → la API valida, crea una sesión y responde con la cookie `dt_session`.
2. El navegador envía la cookie en cada petición; la API identifica al usuario por ella.
3. Si la sesión caduca o se revoca, la API responde 401 y el frontend vuelve al login.

## Flujo de tareas

El tablero carga todas las tareas del usuario (`GET /api/tasks`). Crear, editar, cambiar estado y eliminar llaman a la API y el estado de la pantalla solo cambia con la respuesta confirmada del servidor. La búsqueda, los filtros, el orden y las estadísticas se calculan en el navegador sobre esa lista.

## Modelo de datos

### Usuario (`SessionUser`)

| Campo | Descripción |
|---|---|
| `id` | UUID generado por el servidor |
| `username` | 3–30 caracteres, en minúsculas, único |
| `name` | Nombre visible (2–100) |

En la base de datos se guarda además el hash Argon2id de la contraseña, que nunca sale del servidor.

### Tarea (`Task`)

| Campo | Descripción |
|---|---|
| `id` | UUID generado por el servidor |
| `title` | 3–80 caracteres |
| `description` | Hasta 400 caracteres (opcional) |
| `dueDate` | Fecha `YYYY-MM-DD` |
| `priority` | `alta`, `media` o `baja` |
| `status` | `pendiente`, `en_progreso` o `completada` |
| `createdAt`, `updatedAt` | Marcas de tiempo ISO 8601 (UTC) del servidor |
| `completedAt` | Fecha de finalización o `null` |

Esquema MySQL completo en [`backend-planning/DATABASE.md`](backend-planning/DATABASE.md).
