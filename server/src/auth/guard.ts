import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthConfig } from "../config.ts";
import { AppError } from "../http/errors.ts";
import { cookieOptions } from "./cookies.ts";
import { resolveSession, SESSION_COOKIE } from "./sessions.ts";

/**
 * preHandler para rutas protegidas: resuelve la cookie de sesión y deja el
 * usuario en `request.user`. Sin sesión válida → 401 UNAUTHENTICATED (y se
 * borra la cookie inválida o caducada).
 */
export function makeRequireAuth(auth: AuthConfig) {
  const ttl = { idleMs: auth.sessionIdleTtlMs, absoluteMs: auth.sessionAbsoluteTtlMs };

  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[SESSION_COOKIE];
    const user = token ? await resolveSession(request.server.db.pool, token, ttl) : null;
    if (!user) {
      if (token) reply.clearCookie(SESSION_COOKIE, cookieOptions(auth));
      throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
    }
    request.user = user;
  };
}
