import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import { registerErrorHandling } from "./http/errors.ts";
import { healthRoutes } from "./routes/health.ts";

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

export interface BuildAppOptions {
  /** Destino alternativo de los logs (las pruebas lo usan para inspeccionarlos). */
  logStream?: { write(msg: string): void };
}

/**
 * Construye la aplicación Fastify sin ponerla a escuchar.
 * Las pruebas la usan con `app.inject()`; `server.ts` la arranca.
 */
export function buildApp(config: Config, options: BuildAppOptions = {}): FastifyInstance {
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

  // Solo se aceptan cuerpos JSON: se elimina el parser de texto plano que Fastify trae por defecto.
  app.removeContentTypeParser("text/plain");

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    if (request.url.startsWith("/api") && !reply.hasHeader("cache-control")) {
      reply.header("cache-control", "no-store");
    }
  });

  registerErrorHandling(app);

  app.register(
    async (api) => {
      await api.register(healthRoutes);
      // Fases posteriores: auth (Fase 3) y tasks (Fase 4) se registran aquí.
    },
    { prefix: "/api" },
  );

  return app;
}
