import { sep } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toErrorBody } from "./errors.ts";

/**
 * Servir el frontend compilado (dist/ de Vite) desde Fastify, en el mismo origen que /api.
 *
 * - Archivos de `assets/` (nombres con hash): caché de larga duración e inmutable.
 * - `index.html` y el resto (favicon…): `no-cache`, para que una nueva versión se cargue al momento.
 * - Rutas del SPA sin extensión (p. ej. /registro): se responde con index.html (fallback de React Router).
 * - /api/* nunca se sirve desde disco: las rutas inexistentes de la API siguen devolviendo JSON 404.
 * - Archivos ocultos (.env, .git…) ignorados; sin listado de carpetas; `send` impide salir de `root`.
 */

const ASSET_CACHE = "public, max-age=31536000, immutable";
const HTML_CACHE = "no-cache";

function pathOf(request: FastifyRequest): string {
  const raw = request.url.split("?")[0] ?? "/";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

export function registerStatic(app: FastifyInstance, root: string): void {
  const assetsDir = `${sep}assets${sep}`;
  app.register(fastifyStatic, {
    root,
    prefix: "/",
    wildcard: true,
    index: "index.html",
    list: false,
    dotfiles: "ignore",
    cacheControl: false, // lo fija setHeaders
    etag: true,
    lastModified: true,
    allowedPath: (pathName) => !isApiPath(pathName),
    setHeaders: (reply, filePath) => {
      reply.header("cache-control", filePath.includes(assetsDir) ? ASSET_CACHE : HTML_CACHE);
    },
  });
}

/**
 * Manejador de "no encontrado" cuando se sirve el frontend: GET/HEAD a rutas del SPA
 * (sin extensión y fuera de /api) devuelven index.html; todo lo demás, JSON 404.
 */
export function spaNotFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  const path = pathOf(request);
  const lastSegment = path.split("/").pop() ?? "";
  const isPage = (request.method === "GET" || request.method === "HEAD") && !isApiPath(path) && !lastSegment.includes(".");
  if (isPage) {
    reply.header("cache-control", HTML_CACHE);
    return reply.sendFile("index.html");
  }
  return reply.status(404).send(toErrorBody("NOT_FOUND", "Recurso no encontrado."));
}
