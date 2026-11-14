import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { PublicUser } from "./auth/repository.ts";
import { authRoutes } from "./auth/routes.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/pool.ts";
import { registerErrorHandling } from "./http/errors.ts";
import { registerOriginCheck } from "./http/origin.ts";
import { rateLimitOptions } from "./http/rate-limit.ts";
import { registerStatic, spaNotFoundHandler } from "./http/static.ts";
import { healthRoutes } from "./routes/health.ts";
import { taskRoutes } from "./tasks/routes.ts";

declare module "fastify" {
  interface FastifyInstance {
    /** Acceso a MySQL (pool compartido). Las rutas lo usan como `app.db.pool`. */
    db: Database;
  }
  interface FastifyRequest {
    /** Usuario autenticado; lo rellena el preHandler `requireAuth`. */
    user: PublicUser | null;
  }
}

/** Campos que nunca deben aparecer en los logs. */
export const REDACTED_LOG_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "token",
  "*.token",
  "passwordHash",
  "*.passwordHash",
];

/**
 * Política de contenido compatible con la aplicación real: scripts y estilos propios
 * (Vite no genera código en línea), Google Fonts (index.html), fetch solo al mismo origen.
 * React aplica los estilos dinámicos por CSSOM, que la CSP no bloquea.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Cabeceras de seguridad para todas las respuestas (API, HTML y recursos estáticos). */
function buildSecurityHeaders(production: boolean): [string, string][] {
  const headers: [string, string][] = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "same-origin"],
    ["cross-origin-opener-policy", "same-origin"],
    ["content-security-policy", CONTENT_SECURITY_POLICY],
  ];
  // HSTS solo en producción (detrás de HTTPS); sin includeSubDomains para no afectar a otros subdominios.
  if (production) headers.push(["strict-transport-security", "max-age=31536000"]);
  return headers;
}

export interface BuildAppOptions {
  /** Acceso a MySQL. La app cierra el pool al cerrarse (`app.close()`). */
  db: Database;
  /** Destino alternativo de los logs (las pruebas lo usan para inspeccionarlos). */
  logStream?: { write(msg: string): void };
}

/**
 * Construye la aplicación Fastify sin ponerla a escuchar.
 * Las pruebas la usan con `app.inject()`; `server.ts` la arranca.
 */
export function buildApp(config: Config, options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: { paths: REDACTED_LOG_PATHS, censor: "[REDACTED]" },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
    trustProxy: config.trustProxy,
    bodyLimit: config.bodyLimit,
    requestTimeout: config.requestTimeoutMs,
    return503OnClosing: true,
    ajv: {
      // Validación estricta: por defecto Fastify elimina en silencio las propiedades
      // extra y convierte tipos ("2" → 2). Aquí se rechazan con 400.
      customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false },
    },
  });

  app.decorate("db", options.db);
  app.decorateRequest("user", null);
  app.addHook("onClose", async () => {
    await options.db.close();
  });

  const securityHeaders = buildSecurityHeaders(config.nodeEnv === "production");

  // Solo se aceptan cuerpos JSON: se elimina el parser de texto plano que Fastify trae por defecto.
  app.removeContentTypeParser("text/plain");

  app.addHook("onSend", async (request, reply) => {
    for (const [name, value] of securityHeaders) reply.header(name, value);
    // Ruta normalizada del enrutador (no el texto de la URL, que puede venir codificado);
    // sin ruta (404) también se marca como no cacheable.
    const route = request.routeOptions.url;
    if ((route === undefined || route.startsWith("/api")) && !reply.hasHeader("cache-control")) {
      reply.header("cache-control", "no-store");
    }
  });

  registerErrorHandling(app, config.staticDir ? spaNotFoundHandler : undefined);
  registerOriginCheck(app, config.auth.allowedOrigins);
  app.register(cookie);
  app.register(rateLimit, rateLimitOptions(config.rateLimit));

  app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: "/auth", auth: config.auth, rateLimit: config.rateLimit });
      await api.register(taskRoutes, { prefix: "/tasks", auth: config.auth, maxPerUser: config.tasks.maxPerUser });
    },
    { prefix: "/api" },
  );

  // Frontend compilado en el mismo origen (producción). Sin STATIC_DIR, solo API (desarrollo con Vite).
  if (config.staticDir) registerStatic(app, config.staticDir);

  return app;
}
