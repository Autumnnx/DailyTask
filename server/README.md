# DailyTask — API (server/)

API REST de DailyTask. Paquete independiente del frontend (`../src/`), con su propio `package.json`.

## Endpoints

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| GET | `/api/health` | — | 200 si MySQL responde; 503 si no |
| POST | `/api/auth/register` | — | `{ username, name, password }` → 201 `{ user }` + cookie `dt_session` |
| POST | `/api/auth/login` | — | `{ username, password }` → 200 `{ user }` + cookie |
| POST | `/api/auth/logout` | opcional | 204, revoca la sesión |
| GET | `/api/auth/me` | cookie | 200 `{ user }` o 401 |
| GET | `/api/tasks?status=&priority=&q=` | cookie | 200 `{ tasks }` (filtros opcionales) |
| POST | `/api/tasks` | cookie | `{ title, description?, dueDate, priority, status }` → 201 `{ task }`; 409 al superar 1.000 |
| GET | `/api/tasks/:id` | cookie | 200 `{ task }` o 404 |
| PUT | `/api/tasks/:id` | cookie | Edición completa → 200 `{ task }` |
| PATCH | `/api/tasks/:id/status` | cookie | `{ status }` (completar/reabrir) → 200 `{ task }` |
| DELETE | `/api/tasks/:id` | cookie | 204 |
| GET | `/openapi.json` | — | Especificación OpenAPI 3.1 de los endpoints anteriores |
| GET | `/api-docs` | — | Documentación de consulta (Scalar, tema oscuro). No ejecuta peticiones |

Contrato completo (esquemas, validaciones, errores y ejemplos) en la documentación de consulta `/api-docs`, generada a partir de la especificación OpenAPI 3.1 que se sirve en `/openapi.json`. Las peticiones que modifican datos necesitan `Content-Type: application/json` (si llevan cuerpo) y un `Origin` permitido. Flujo: login (o registro) una vez y después la cookie identifica al usuario:

```bash
J=(-H 'content-type: application/json' -H 'origin: http://localhost:5173')
curl -c /tmp/dt.jar "${J[@]}" -d '{"username":"kori","name":"Kori","password":"000000"}' http://127.0.0.1:3000/api/auth/register
curl -b /tmp/dt.jar "${J[@]}" -d '{"title":"Estudiar","dueDate":"2026-12-01","priority":"alta","status":"pendiente"}' http://127.0.0.1:3000/api/tasks
curl -b /tmp/dt.jar "http://127.0.0.1:3000/api/tasks?q=estudiar"
```

Reglas: `username` 3–30 (se normaliza a minúsculas; letras ASCII, números, `.`, `-`, `_`, sin símbolo al inicio o al final), `name` 2–100, contraseña **solo** 6–128 caracteres (sin reglas de complejidad). Tareas: título 3–80, descripción ≤ 400, `dueDate` fecha real `YYYY-MM-DD`, `priority` `alta|media|baja`, `status` `pendiente|en_progreso|completada`. Cada usuario solo ve y modifica sus tareas (las ajenas dan 404).

## Requisitos

- Node.js **≥ 22.18** (ejecuta TypeScript de forma nativa en desarrollo y pruebas). Probado con Node 26.13.1.
- Para desarrollo y pruebas de BD: Docker **o** Podman (solo para un MySQL 8.4 local).
- Producción: MySQL 8 nativo (sin contenedores).

## Puesta en marcha (desarrollo)

```bash
cd server
npm ci
cp .env.example .env          # valores de desarrollo; .env no se versiona
npm run db:dev up             # MySQL 8.4 local en 127.0.0.1:3307 (bases dailytask_dev y dailytask_test)
npm run db:init               # crea las tablas que falten en dailytask_dev
npm run dev                   # API en http://127.0.0.1:3000
curl -i http://127.0.0.1:3000/api/health   # 200 {"status":"ok"}
```

## MySQL de desarrollo (`dev/mysql.sh`)

| Comando | Qué hace |
|---|---|
| `npm run db:dev up` | Crea (la primera vez) y arranca `dailytask-dev-mysql`; crea bases y usuarios de desarrollo (idempotente) |
| `npm run db:dev down` | Lo detiene; los datos se conservan en el volumen `dailytask-dev-mysql-data` |
| `npm run db:dev status` / `logs` | Estado / últimas líneas del log |
| `npm run db:dev sql` | Cliente `mysql` como root dentro del contenedor |
| `npm run db:dev -- destroy --yes` | Elimina **solo** el contenedor y el volumen del proyecto |

- Motor: Docker si su daemon responde; si no, **Podman sin root** con un almacén propio en `~/.local/share/dailytask-dev/containers` (no toca la configuración ni los contenedores del usuario). Forzar con `CONTAINER_ENGINE=docker|podman`.
- Usa la red del host con MySQL escuchando **solo en 127.0.0.1:3307** (`DEV_MYSQL_PORT` para cambiarlo).
- Credenciales fijas **de desarrollo** (sobrescribibles con `DEV_MYSQL_*_PASSWORD`): root `dailytask-dev-root`, app `dailytask_app`/`dailytask-dev-app`, inicialización `dailytask_migrator`/`dailytask-dev-migrator`.
- Limpieza total de Podman (si ya no se necesita): `npm run db:dev -- destroy --yes` y borrar `~/.local/share/dailytask-dev/`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca `src/server.ts` con recarga; carga `server/.env` si existe |
| `npm run db:init` | Crea las tablas que falten y verifica el esquema (cuenta `DB_INIT_*`) |
| `npm test` | Pruebas unitarias (sin MySQL); incluye la prueba del cliente HTTP del frontend (`test/frontend-api-client.test.ts`) |
| `npm run test:db` | Pruebas contra el MySQL **local** (`dailytask_test`); requiere `db:dev up` |
| `npm run test:all` | Ambas |
| `npm run typecheck` | Tipos de `src/` y `test/` |
| `npm run build` / `npm start` | Compila a `dist/` / ejecuta la versión compilada (producción) |
| `npm run db:init:prod` | `db:init` sobre la versión compilada |

Las pruebas de BD se niegan a ejecutarse si la base no termina en `_test` o el host no es local.

## Configuración

Variables de entorno (ver `.env.example`). Una configuración inválida detiene el arranque con código 1 y un mensaje que nombra la variable **sin mostrar su valor**.

| Variable | Por defecto | Notas |
|---|---|---|
| `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL` | `development`, `127.0.0.1`, `3000`, `info` | |
| `TRUST_PROXY` | vacío | IPs/CIDR del proxy; `true` se rechaza |
| `BODY_LIMIT_BYTES`, `REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS` | `16384`, `15000`, `10000` | |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | TCP (desarrollo) |
| `DB_SOCKET_PATH` | — | Socket Unix (producción); excluyente con `DB_HOST` |
| `DB_NAME`, `DB_USER` | **obligatorias** | |
| `DB_PASSWORD` o `DB_PASSWORD_FILE` | — | Solo una; el fichero admite secretos de systemd |
| `DB_POOL_SIZE` | `5` | 1–20 |
| `DB_CONNECT_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS` | `5000`, `3000` | El segundo limita health y comprobaciones |
| `DB_INIT_USER`, `DB_INIT_PASSWORD[_FILE]` | — | Solo para `db:init` |
| `PUBLIC_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Orígenes permitidos en POST/PUT/PATCH/DELETE; obligatorio (https) en producción |
| `COOKIE_SECURE` | `false` (`true` en producción, obligatorio allí) | Atributo `Secure` de `dt_session` |
| `SESSION_IDLE_TTL_HOURS`, `SESSION_ABSOLUTE_TTL_HOURS` | `168`, `720` | 7 días de inactividad, 30 días máximo |
| `SESSION_CLEANUP_INTERVAL_MINUTES` | `60` | Borrado de sesiones caducadas |
| `ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM` | `19456`, `2`, `1` | Mínimos OWASP |
| `RATE_LIMIT_GLOBAL_PER_MIN` | `300` | Por IP, toda la API |
| `RATE_LIMIT_LOGIN_PER_MIN`, `RATE_LIMIT_LOGIN_USER_PER_MIN` | `10`, `5` | Login por IP y por username |
| `RATE_LIMIT_REGISTER_PER_MIN` | `5` | Registro por IP |
| `MAX_TASKS_PER_USER` | `1000` | Máximo de tareas almacenadas por usuario |
| `STATIC_DIR` | vacío | Carpeta `dist/` del frontend compilado: Fastify sirve la app React en el mismo origen (fallback a `index.html` para las rutas del SPA). Vacío = solo API |

`DB_PASSWORD_FILE` (y `DB_INIT_PASSWORD_FILE`) admiten una ruta relativa que se busca en `$CREDENTIALS_DIRECTORY` (systemd `LoadCredential`).

## Producción

Un único proceso sirve la API, el frontend compilado (`STATIC_DIR`) y la documentación, detrás de un proxy HTTPS. Se ejecuta la versión compilada (`node dist/server.js`), nunca `npm run dev`, con las variables de entorno definidas por el gestor de servicios (no se usa `.env`): `NODE_ENV=production`, `PUBLIC_ORIGIN` con https, `TRUST_PROXY` con la IP del proxy y las contraseñas mediante `*_PASSWORD_FILE`.

Con `STATIC_DIR` todas las respuestas llevan cabeceras de seguridad (CSP compatible con la app y Google Fonts, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, y HSTS con `NODE_ENV=production`). Los recursos de `assets/` se sirven con caché inmutable y `index.html` con `no-cache`.

## Arranque y salud

- Al arrancar, la API comprueba la conexión y el esquema. Si MySQL no responde o faltan tablas, **no arranca** (código 1) y explica la causa (p. ej. "ejecuta `npm run db:init`"), sin credenciales.
- `GET /api/health`: 200 si MySQL responde a `SELECT 1`; 503 `UNAVAILABLE` si no. Si MySQL vuelve, el pool se recupera solo.
- SIGTERM/SIGINT: cierre ordenado del servidor y del pool.

## Estructura

```text
server/
├── src/
│   ├── server.ts         Entrada: config → comprobación de BD → listen → cierre ordenado
│   ├── app.ts            buildApp(config, { db }): Fastify, límites, logs, rutas /api
│   ├── config.ts         Variables de entorno (API y db:init)
│   ├── db/pool.ts        Pool mysql2, ping con tiempo límite, errores seguros
│   ├── db/schema.ts      DDL, verificación de estructura, ensureSchema
│   ├── db/verify.ts      Comprobación de arranque
│   ├── db/init.ts        CLI db:init
│   ├── auth/             Registro, login, logout, /me, Argon2id, sesiones, guard
│   ├── tasks/            CRUD de tareas, validación, SQL con user_id y límite transaccional
│   ├── http/errors.ts    AppError y formato único de error (MySQL caído → 503)
│   ├── http/origin.ts    Verificación de Origin (CSRF)
│   ├── http/rate-limit.ts Límite global y respuesta 429
│   ├── http/static.ts    Frontend compilado (STATIC_DIR) y fallback del SPA
│   ├── docs/openapi.ts   Especificación OpenAPI 3.1 (se comprueba contra las rutas en test/docs.test.ts)
│   ├── docs/routes.ts    /openapi.json y /api-docs (Scalar servido localmente, sin CDN)
│   └── routes/health.ts  GET /api/health
├── dev/mysql.sh          MySQL de desarrollo (Docker/Podman)
├── provision/provision.sql.example   Aprovisionamiento de producción (plantilla)
└── test/                 Unitarias (test/*.test.ts) y de BD (test/db/*.test.ts)
```
