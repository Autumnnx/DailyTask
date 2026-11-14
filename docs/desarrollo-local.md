# Desarrollo local

DailyTask tiene dos partes que se ejecutan por separado en desarrollo:

| Parte | Carpeta | Puerto |
|---|---|---|
| Frontend (React + Vite) | raíz del repositorio | `5173` |
| API (Fastify + TypeScript) | `server/` | `3000` |
| MySQL 8.4 de desarrollo (contenedor) | `server/dev/mysql.sh` | `3307` (solo `127.0.0.1`) |

Vite reenvía las peticiones `/api` a la API, de modo que el navegador ve un solo origen y la cookie de sesión funciona sin CORS.

## Requisitos

- Git.
- Node.js `>=22.18` y npm.
- Podman o Docker (solo para el MySQL de desarrollo).

## Obtener el código

```bash
git clone https://github.com/Autumnnx/DailyTask.git
cd DailyTask
```

## Puesta en marcha

```bash
# Terminal 1 — API y base de datos
cd server
npm ci
cp .env.example .env     # valores solo de desarrollo
npm run db:dev up        # crea/arranca el contenedor MySQL y las bases dailytask_dev y dailytask_test
npm run db:init          # crea las tablas (idempotente)
npm run dev              # API en http://127.0.0.1:3000

# Terminal 2 — frontend (raíz del repositorio)
npm ci
npm run dev              # http://localhost:5173
```

Detener: `Ctrl+C` en cada terminal y `npm run db:dev down` (en `server/`) para parar MySQL conservando los datos. Más opciones del contenedor en [`server/README.md`](../server/README.md).

## Comandos

Frontend (raíz):

```bash
npm run dev        # Vite con proxy /api → 127.0.0.1:3000
npm run typecheck  # comprobación de TypeScript
npm run build      # TypeScript + compilación de producción en dist/
npm run preview    # sirve dist/ en :4173, también con proxy /api
```

Para que `npm run preview` pueda crear o modificar datos, arranca la API con ese origen permitido, por ejemplo `PUBLIC_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173` en `server/.env`.

API (`server/`): `npm test` (pruebas sin base de datos), `npm run test:db` (pruebas contra el MySQL local), `npm run typecheck`, `npm run build`. Lista completa en [`server/README.md`](../server/README.md).

## Áreas de trabajo habituales

- Pantallas: `src/pages/`. Componentes: `src/components/`. Estilos: `src/styles/`.
- Sesión del frontend: `src/context/AuthContext.tsx`. Cliente HTTP: `src/utils/api.ts`.
- Tareas en el frontend: `src/hooks/useTasks.ts`; filtros y orden: `src/utils/taskUtils.ts`.
- Validaciones del frontend: `src/utils/validators.ts` (mismas reglas que el servidor).
- API: `server/src/` (`auth/`, `tasks/`, `db/`, `http/`).

## Solución de problemas

### La compilación indica que Node.js no es compatible

Comprueba `node --version` (se necesita `>=22.18`).

### La aplicación muestra "El servicio no está disponible"

La API o MySQL no responden. Comprueba que `npm run dev` sigue activo en `server/` y que `npm run db:dev status` muestra el contenedor en marcha; `curl http://127.0.0.1:3000/api/health` debe devolver `{"status":"ok"}`.

### La API no arranca y pide ejecutar `npm run db:init`

Las tablas no existen en la base configurada. Ejecuta `npm run db:init` en `server/`.

### Las peticiones que guardan datos devuelven 403

El origen del navegador no está en `PUBLIC_ORIGIN` (ver la nota sobre `npm run preview`).
