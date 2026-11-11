# Arquitectura y modelo de datos

## Visión general

DailyTask es una aplicación de una sola página (SPA) que se ejecuta en el navegador. Vite compila el código TypeScript y React renderiza las pantallas. React Router gestiona las rutas; el estado de usuario y tareas se conserva en `localStorage`.

```text
Navegador
├── React + React Router
│   ├── AuthProvider ── sesión y operaciones de cuenta
│   ├── Páginas ─────── registro, acceso y tablero
│   └── Componentes ── formularios, filtros, columnas y tarjetas
├── Hooks ───────────── lógica de tareas
├── Utilidades ──────── validación, hash, fechas y almacenamiento
└── localStorage ────── cuentas, sesión y tareas de este origen
```

No hay backend ni llamadas a una API remota para las funciones de autenticación o gestión de tareas.

## Tecnologías y herramientas

- **React 19:** composición de la interfaz con componentes y hooks.
- **TypeScript 5:** tipos de datos y comprobación estática.
- **Vite 7:** desarrollo local y compilación de producción.
- **React Router 7:** navegación cliente entre las vistas.
- **CSS:** estilos propios, separados en variables, estilos base, componentes y páginas.
- **Web Storage API:** persistencia local en `localStorage`.

## Rutas y control de navegación

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/login` | Inicio de sesión | Solo sin sesión activa |
| `/registro` | Registro | Solo sin sesión activa |
| `/` | Tablero | Requiere usuario local autenticado |
| Cualquier otra ruta | Página no encontrada | Pública |

`ProtectedRoute` redirige al acceso si no encuentra un usuario en el contexto. `PublicOnlyRoute` evita que un usuario con sesión activa vuelva a registro o acceso. Estas reglas controlan la navegación de la interfaz, no sustituyen autorización de backend.

## Organización del código

| Ruta | Responsabilidad |
|---|---|
| `src/main.tsx` | Monta React, `BrowserRouter`, `AuthProvider` y estilos globales |
| `src/App.tsx` | Declara rutas y restricciones de acceso |
| `src/pages/` | Pantallas de acceso, registro, tablero y página no encontrada |
| `src/components/` | Navbar, formularios, tarjetas, tablero, filtros, estadísticas y diálogos |
| `src/context/AuthContext.tsx` | Registro, acceso, salida y usuario activo |
| `src/hooks/useTasks.ts` | Consultas y operaciones CRUD de tareas |
| `src/types/index.ts` | Tipos `User`, `SessionUser`, `Task`, prioridades y estados |
| `src/utils/storage.ts` | Lectura, escritura y eliminación de datos locales |
| `src/utils/crypto.ts` | Identificadores, sal y cálculo del hash de contraseña |
| `src/utils/validators.ts` | Validación de formularios |
| `src/utils/taskUtils.ts` | Búsqueda, filtrado y ordenamiento |
| `src/utils/dates.ts` | Cálculos y formato de fechas |
| `src/styles/` | Variables, estilos base, componentes y páginas |

## Flujo de autenticación

1. `AuthProvider` carga el identificador de sesión de `localStorage` y busca el usuario local correspondiente.
2. Al registrar, valida los campos, normaliza el correo, genera una sal y calcula el hash de contraseña.
3. Guarda el usuario y el identificador de sesión; la interfaz recibe un `SessionUser` que excluye el hash y la sal.
4. Al iniciar sesión, busca el correo y vuelve a calcular el hash con la sal guardada para comparar.
5. Al cerrar sesión, elimina la clave de sesión y limpia el estado React del usuario actual.

Esta es una simulación local. El flujo no envía credenciales a un servidor ni proporciona identidad o autorización confiable.

## Flujo de tareas

`DashboardPage` obtiene el usuario del contexto y pasa su identificador a `useTasks`. El hook:

- carga la lista almacenada y guarda las actualizaciones en `localStorage`;
- filtra la lista visible por `userId`;
- crea tareas con identificador y marcas de tiempo;
- actualiza tareas únicamente si coinciden tanto el identificador como el usuario actual;
- cambia el estado o elimina únicamente las tareas de ese usuario.

La página combina las tareas con los filtros de búsqueda/estado/prioridad. `TaskBoard` agrupa y ordena las tareas visibles por vencimiento y luego por prioridad. Los controles del tablero delegan las ediciones al hook.

## Modelo de datos

### Usuario

| Campo | Descripción |
|---|---|
| `id` | Identificador único |
| `name` | Nombre mostrado en la interfaz |
| `email` | Correo normalizado a minúsculas |
| `passwordHash` | Hash calculado en el navegador |
| `salt` | Sal asociada al hash |
| `createdAt` | Fecha de creación en formato ISO |

La interfaz utiliza `SessionUser` (`id`, `name`, `email`), que no incluye hash ni sal.

### Tarea

| Campo | Descripción |
|---|---|
| `id` | Identificador único |
| `userId` | Identificador del propietario local |
| `title` | Título de 3 a 80 caracteres tras eliminar espacios extremos |
| `description` | Descripción opcional de hasta 400 caracteres |
| `dueDate` | Fecha de vencimiento `YYYY-MM-DD` |
| `priority` | `alta`, `media` o `baja` |
| `status` | `pendiente`, `en_progreso` o `completada` |
| `createdAt`, `updatedAt` | Marcas de tiempo ISO |
| `completedAt` | Marca ISO opcional al completar la tarea |

## Persistencia

Se usan tres claves de almacenamiento por origen:

| Clave | Contenido |
|---|---|
| `dailytask.users` | Lista de cuentas locales |
| `dailytask.session` | Identificador del usuario conectado |
| `dailytask.tasks` | Lista de tareas de las cuentas locales |

Las claves existen en el navegador del usuario y no en Render. Borrar los datos del sitio elimina la información persistida.
