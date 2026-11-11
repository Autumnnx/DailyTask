# Desarrollo local

## Requisitos

- Git para clonar el repositorio.
- Node.js `^20.19.0` o `>=22.12.0`.
- npm, incluido con Node.js.

La versión mínima de Node.js es importante porque Vite 7 no es compatible con Node.js 18.

## Obtener el código

```bash
git clone https://github.com/Autumnnx/DailyTask.git
cd DailyTask
```

## Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre la URL que muestre Vite (habitualmente `http://localhost:5173`). La aplicación se recarga al guardar cambios en el código.

## Comandos disponibles

```bash
npm run dev        # servidor de desarrollo Vite
npm run typecheck  # comprobación de TypeScript
npm run build      # comprobación de TypeScript y compilación de producción
npm run preview    # vista local de la compilación ya generada
```

`npm run build` genera los archivos estáticos en `dist/`. Para probar esa compilación:

```bash
npm run build
npm run preview
```

## Áreas de trabajo habituales

- Cambios de pantallas: `src/pages/`.
- Componentes visuales: `src/components/`.
- Reglas de tareas: `src/hooks/useTasks.ts` y `src/utils/taskUtils.ts`.
- Tipos: `src/types/index.ts`.
- Validaciones: `src/utils/validators.ts`.
- Claves y operaciones de almacenamiento: `src/utils/storage.ts`.
- Estilos: `src/styles/`.
- Ajustes de compilación: `vite.config.ts` y archivos `tsconfig*.json`.
- Despliegue automático de Render: `render.yaml`.

Más detalles del flujo de componentes y almacenamiento están en [Arquitectura](arquitectura.md).

## Solución de problemas

### La compilación indica que Node.js no es compatible

Comprueba `node --version`. Vite 7 requiere Node.js `^20.19.0` o `>=22.12.0`; actualiza Node y vuelve a ejecutar `npm install`.

### `npm run dev` no abre la aplicación

Lee la URL y los errores impresos en la terminal. Si el puerto predeterminado está ocupado, Vite puede seleccionar otro puerto y mostrar la dirección correcta.

### No aparecen los datos de otro equipo o navegador

Es el comportamiento previsto: la persistencia se realiza con `localStorage` en el navegador actual, no en un servidor. Consulta [Datos, privacidad y seguridad](datos-y-seguridad.md).

### El contenido de la demo no refleja el último cambio

La demo pública se actualiza al desplegar los cambios del repositorio conectado a Render. Revisa el último despliegue y sus logs en Render. Para probar una compilación local, utiliza `npm run build` y `npm run preview`.

## Dependencias

Las versiones y scripts se declaran en `package.json`; `package-lock.json` registra la resolución de npm. Si se cambia una dependencia, actualiza ambos según corresponda y verifica al menos `npm run build`.
