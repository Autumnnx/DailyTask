# DailyTask

Aplicación web para registrar, organizar y gestionar tareas diarias. Proyecto académico de la asignatura **Herramientas de Software** (Actividad 6: aplicación de un framework de frontend).

<p align="center">
  <a href="https://dailytask-ww8p.onrender.com">
    <img src="https://img.shields.io/badge/Ver%20demo-en%20vivo-0f766e?style=for-the-badge" alt="Ver demo en vivo de DailyTask" />
  </a>
</p>

Saludos cordiales al profesor Jeferson Urrego: muchas gracias por acompañarnos y guiarnos en este semestre académico.

## ¿Qué puedes hacer?

- Crear una cuenta e iniciar sesión en el mismo navegador.
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
| `localStorage` | Persistencia local de usuarios, sesión y tareas |

> **Alcance de la autenticación:** DailyTask es un proyecto exclusivamente frontend. El registro y el inicio de sesión son una simulación local, no una autenticación respaldada por un servidor. Los datos se guardan en el navegador y no se sincronizan entre dispositivos. Consulta [Datos y seguridad](docs/datos-y-seguridad.md) antes de usar información real.

## Inicio rápido

**Requisitos:** Node.js `^20.19.0` o `>=22.12.0` y npm. Estas versiones satisfacen el requisito de Vite 7.

```bash
npm install
npm run dev
```

Abre la dirección que indique Vite, normalmente `http://localhost:5173`.

| Comando | Resultado |
|---|---|
| `npm run dev` | Inicia el servidor de desarrollo |
| `npm run build` | Comprueba TypeScript y genera la aplicación en `dist/` |
| `npm run preview` | Sirve localmente la compilación de producción |
| `npm run typecheck` | Ejecuta la comprobación de TypeScript |

## Documentación

- [Índice de documentación](docs/README.md)
- [Guía de usuario](docs/guia-de-usuario.md)
- [Arquitectura y modelo de datos](docs/arquitectura.md)
- [Desarrollo local](docs/desarrollo-local.md)
- [Despliegue en Render](docs/despliegue-render.md)
- [Datos, privacidad y seguridad](docs/datos-y-seguridad.md)

## Estructura principal

```text
src/
├── components/    Componentes de interfaz reutilizables
├── context/       Estado global de autenticación
├── hooks/         Lógica de tareas
├── pages/         Pantallas y rutas
├── styles/        Estilos CSS
├── types/         Tipos de usuario, tarea y filtros
├── utils/         Persistencia, validaciones, fechas y utilidades
├── App.tsx        Definición de rutas
└── main.tsx       Punto de entrada
docs/              Guías y documentación del proyecto
render.yaml        Configuración declarativa de Render
```

## Despliegue

La demo está publicada en [dailytask-ww8p.onrender.com](https://dailytask-ww8p.onrender.com). Para desplegar una instancia propia en Render, consulta la [guía de despliegue](docs/despliegue-render.md).
