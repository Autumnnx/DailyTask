import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import type { RateLimitConfig } from "../config.ts";
import { AppError } from "./errors.ts";

/** Respuesta 429 con el formato de error de la API (el plugin añade Retry-After). */
export function rateLimitError(_request: FastifyRequest, _context: unknown): AppError {
  return new AppError(429, "RATE_LIMITED", "Demasiadas peticiones. Inténtalo de nuevo en unos momentos.");
}

/**
 * Límite global por IP, en memoria (una sola instancia de la API). La IP sale de
 * `request.ip`, que solo usa X-Forwarded-For si el proxy está en TRUST_PROXY.
 * Las rutas pueden fijar su propio límite con `config.rateLimit`.
 */
export function rateLimitOptions(config: RateLimitConfig): RateLimitPluginOptions {
  return {
    global: true,
    max: config.globalPerMinute,
    timeWindow: 60_000,
    errorResponseBuilder: rateLimitError,
  };
}
