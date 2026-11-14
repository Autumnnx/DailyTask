# Despliegue en Render

> **Documento histórico.** Describe el despliegue de la versión anterior de DailyTask (solo frontend, datos en `localStorage`). La versión actual necesita la API y MySQL, y Render queda **fuera del alcance actual** del proyecto. El despliegue previsto se documentará en `backend-planning/` (Fase 7). `render.yaml` se conserva sin cambios.

DailyTask se compilaba como una aplicación frontend estática. No requiere un proceso de servidor Node.js en producción ni una base de datos para funcionar.

## Demo actual

La aplicación pública está disponible en [https://dailytask-ww8p.onrender.com](https://dailytask-ww8p.onrender.com).

## Despliegue mediante Blueprint (recomendado)

El repositorio incluye [`render.yaml`](../render.yaml), que define el servicio como sitio estático y especifica la compilación, el directorio publicado y la regla de rutas.

1. Confirma y sube a GitHub la rama que quieres desplegar.
2. En Render, selecciona **New + → Blueprint**.
3. Conecta `Autumnnx/DailyTask` y elige la rama adecuada.
4. Render detectará `render.yaml`; revisa el servicio `dailytask` y selecciona **Apply**.
5. Espera a que termine el build y abre la URL que Render asigna al servicio.

## Configuración manual

Si prefieres crear el servicio desde el panel de Render:

1. Selecciona **New + → Static Site** y conecta el repositorio.
2. Configura la rama y usa estos valores:

| Campo | Valor |
|---|---|
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

3. En las reglas de Redirects/Rewrites, añade una regla de tipo **Rewrite**:

| Campo | Valor |
|---|---|
| Source | `/*` |
| Destination | `/index.html` |
| Action | `Rewrite` |

La regla entrega el punto de entrada de la SPA para rutas de React Router al acceder directamente a una URL interna o recargarla.

## Qué configura `render.yaml`

- Tipo de servicio: sitio estático (`runtime: static`).
- Nombre: `dailytask`.
- Comando de compilación: `npm install && npm run build`.
- Directorio publicado: `./dist`.
- Rewrite de `/*` a `/index.html`.

No es necesario definir variables de entorno para las funciones actuales.

## Verificación después del despliegue

1. Confirma que el despliegue haya terminado con estado correcto en Render.
2. Abre la URL y comprueba el registro, el inicio de sesión y el tablero.
3. Crea una tarea, actualiza su estado y prueba búsqueda/filtros.
4. Recarga una ruta interna como `/login` para comprobar el rewrite de la SPA.
5. Recuerda que las cuentas y tareas creadas en esa visita se guardan en el navegador de cada visitante, no en el servicio de Render.

## Actualizar el sitio

Con despliegues automáticos activos, los cambios subidos a la rama configurada disparan un nuevo build. Antes de publicar, comprueba localmente:

```bash
npm run typecheck
npm run build
```

Si el build falla, abre el log de Render para localizar si el error corresponde a instalación o compilación. No cambies el directorio publicado: Vite genera los archivos de producción en `dist/`.
