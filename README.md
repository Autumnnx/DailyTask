# DailyTask

Aplicación web para **registrar, organizar y gestionar tareas diarias**. Proyecto de la asignatura Herramientas de Software (Actividad 6: aplicación de un framework de frontend).

## Tecnologías

| Herramienta | Uso |
|---|---|
| React 19 | Framework de frontend (componentes + hooks) |
| TypeScript | Lenguaje: tipado estático para evitar errores |
| Vite | Servidor de desarrollo y empaquetado |
| React Router | Navegación entre login, registro y panel |
| CSS propio | Estilos con variables (sin librerías externas) |
| localStorage | Persistencia de usuarios, sesión y tareas |

> **Nota sobre la autenticación:** el caso de estudio pide solo frontend, por lo que el registro y el inicio de sesión se simulan en el navegador. Las contraseñas se guardan con hash SHA-256 y sal, nunca en texto plano. En un sistema real esta parte la haría un backend.

## Funcionalidades

- Registro e inicio de sesión (rutas protegidas, cada usuario ve solo sus tareas).
- Crear tareas con título, descripción, fecha de vencimiento y prioridad.
- Tablero con tres columnas por estado: pendiente, en progreso y completada.
- Editar y eliminar tareas (con confirmación).
- Marcar tareas como completadas con un clic.
- Buscar por título o descripción y filtrar por estado o prioridad.
- Diseño responsive (escritorio, tableta y móvil).

## Ejecutar en local

Requisitos: Node.js 18 o superior.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera la carpeta dist/
npm run preview    # prueba la versión de producción
```

## Estructura del proyecto

```
src/
├── components/    Piezas reutilizables de la interfaz
├── context/       AuthContext: estado global de autenticación
├── hooks/         useTasks: lógica de las tareas (CRUD)
├── pages/         Pantallas: Login, Registro, Dashboard, 404
├── styles/        variables, base, componentes y páginas
├── types/         Tipos de TypeScript (User, Task, filtros)
├── utils/         Fechas, validaciones, filtrado, hash, almacenamiento
├── App.tsx        Definición de rutas
└── main.tsx       Punto de entrada
```

## Despliegue en Render (Static Site)

1. Sube el proyecto a GitHub.
2. En Render: **New → Static Site** y conecta el repositorio.
3. Build Command: `npm install && npm run build`
4. Publish Directory: `dist`
5. En **Redirects/Rewrites** agrega: Source `/*` → Destination `/index.html` → Action `Rewrite`.

(El archivo `render.yaml` ya incluye esta configuración.)
