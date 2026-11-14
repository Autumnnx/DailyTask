import scalarApiReference from "@scalar/fastify-api-reference";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { openApiDocument } from "./openapi.ts";

/**
 * Documentación pública de la API (solo consulta):
 * - GET /openapi.json            Especificación OpenAPI 3.1.
 * - GET /api-docs  → 301 /api-docs/ (redirección relativa: correcta detrás del proxy HTTPS).
 * - GET /api-docs/               Página de Scalar (HTML propio, sin scripts en línea).
 * - GET /api-docs/js/scalar.js   Bundle de Scalar servido desde el propio servidor (sin CDN).
 * - GET /api-docs/theme.css      Tema oscuro acorde con DailyTask.
 *
 * Seguridad: el cliente interactivo y los botones de prueba están desactivados, así que
 * desde la documentación no se envían peticiones a la API. La única excepción de CSP es
 * `style-src 'unsafe-inline'` SOLO en la página /api-docs/: Scalar inyecta varios <style>
 * (solo uno admite nonce) y atributos style que ninguna nonce/hash cubre. Los scripts siguen
 * limitados a 'self' (sin código en línea ni eval) y la página no muestra contenido de usuarios.
 * No se usa nonce: con un nonce presente, los navegadores ignoran 'unsafe-inline'.
 * El resto de la aplicación mantiene su CSP sin cambios.
 */

const DOCS_PREFIX = "/api-docs";

/** Configuración de Scalar: consulta, tema oscuro y sin servicios externos. */
const SCALAR_CONFIGURATION = {
  url: "/openapi.json",
  theme: "none",
  forceDarkModeState: "dark",
  hideDarkModeToggle: true,
  hideTestRequestButton: true,
  hideClientButton: true,
  showDeveloperTools: "never",
  telemetry: false,
  withDefaultFonts: false,
  persistAuth: false,
  documentDownloadType: "json",
  hideModels: false,
  operationTitleSource: "summary",
  defaultOpenAllTags: true,
  agent: { disabled: true },
  mcp: { disabled: true },
  localization: { locale: "es" },
  metaData: { title: "DailyTask — API Docs" },
};

/** CSP de la página de documentación: igual que la general salvo los estilos en línea de Scalar. */
export const DOCS_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML de la página: la configuración va en un atributo data-* (no ejecutable), sin scripts en línea. */
const DOCS_PAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>DailyTask — API Docs</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="${DOCS_PREFIX}/theme.css" />
  </head>
  <body>
    <script id="api-reference" type="application/json" data-configuration="${escapeAttribute(JSON.stringify(SCALAR_CONFIGURATION))}"></script>
    <script src="${DOCS_PREFIX}/js/scalar.js"></script>
  </body>
</html>
`;

/** Tema oscuro con la paleta de DailyTask y bordes finos (variables de Scalar). */
const THEME_CSS = `/* DailyTask — tema de la documentación de la API */
.dark-mode.dark-mode {
  --scalar-background-1: #14172c;
  --scalar-background-2: #1b1f3b;
  --scalar-background-3: #232847;
  --scalar-background-accent: rgba(91, 91, 214, 0.16);
  --scalar-color-1: #eef0fa;
  --scalar-color-2: #b9bfdc;
  --scalar-color-3: #8a90b0;
  --scalar-color-accent: #8f8ff0;
  --scalar-border-color: rgba(223, 227, 241, 0.12);
  --scalar-color-green: #2ec4a6;
  --scalar-color-red: #f0686d;
  --scalar-color-yellow: #e7b14a;
  --scalar-color-blue: #6aa6e8;
  --scalar-color-orange: #e8935a;
  --scalar-color-purple: #a8a2f0;
  --scalar-button-1: #5b5bd6;
  --scalar-button-1-hover: #4747b8;
  --scalar-button-1-color: #ffffff;
  --scalar-sidebar-background-1: #1b1f3b;
  --scalar-sidebar-color-1: #eef0fa;
  --scalar-sidebar-color-2: #b9bfdc;
  --scalar-sidebar-border-color: rgba(223, 227, 241, 0.12);
  --scalar-sidebar-item-hover-background: #232847;
  --scalar-sidebar-item-active-background: rgba(91, 91, 214, 0.22);
  --scalar-sidebar-color-active: #ffffff;
  --scalar-sidebar-search-background: #14172c;
  --scalar-sidebar-search-border-color: rgba(223, 227, 241, 0.14);
  --scalar-border-width: 1px;
  --scalar-radius: 8px;
  --scalar-radius-lg: 12px;
  --scalar-font: "Segoe UI", system-ui, -apple-system, sans-serif;
  --scalar-font-code: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
`;

function isDocsPage(request: FastifyRequest): "redirect" | "page" | null {
  const path = request.url.split("?")[0];
  if (path === DOCS_PREFIX) return "redirect";
  if (path === `${DOCS_PREFIX}/`) return "page";
  return null;
}

/**
 * onRequest para las rutas del plugin: sustituye su página (que usa un script en línea)
 * y su redirección (que construye una URL absoluta con el protocolo interno, http
 * detrás de Caddy) por versiones propias. El bundle JS lo sirve el plugin con caché de 1 día.
 */
async function docsOnRequest(request: FastifyRequest, reply: FastifyReply) {
  const kind = isDocsPage(request);
  if (kind === "redirect") return reply.redirect(`${DOCS_PREFIX}/`, 301);
  if (kind === "page") {
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .header("cache-control", "no-cache")
      .header("content-security-policy", DOCS_CONTENT_SECURITY_POLICY)
      .send(DOCS_PAGE);
  }
  reply.header("cache-control", "public, max-age=86400");
  return undefined;
}

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/openapi.json", async (_request, reply) => {
    reply.header("cache-control", "no-cache");
    return openApiDocument;
  });

  app.get(`${DOCS_PREFIX}/theme.css`, async (_request, reply) => {
    reply.header("content-type", "text/css; charset=utf-8").header("cache-control", "public, max-age=86400");
    return THEME_CSS;
  });

  await app.register(scalarApiReference, {
    routePrefix: DOCS_PREFIX,
    configuration: { url: "/openapi.json" },
    hooks: { onRequest: docsOnRequest },
    logLevel: "warn",
  });
}
