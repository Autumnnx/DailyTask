import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Protección CSRF para TODAS las peticiones que modifican datos (POST, PUT, PATCH, DELETE):
 * - Con cabecera `Origin`: debe estar en la lista permitida (PUBLIC_ORIGIN).
 * - Sin `Origin`: solo se acepta si el navegador declara `Sec-Fetch-Site: same-origin`.
 * Todo lo demás → 403 FORBIDDEN_ORIGIN. Complementa a SameSite=Lax y a la
 * exigencia de JSON (los formularios HTML de otros sitios no pueden enviar JSON).
 *
 * No se filtra por el texto de la URL: el enrutador decodifica la ruta (`/%61pi/...`
 * llega a `/api/...`), así que comprobar `request.url` permitiría eludir la verificación.
 * La aplicación no tiene rutas de escritura fuera de /api.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins);

  app.addHook("onRequest", async (request) => {
    if (!MUTATING.has(request.method)) return;

    const origin = request.headers.origin;
    if (typeof origin === "string" && origin !== "null") {
      if (allowed.has(origin)) return;
    } else if (origin === undefined && request.headers["sec-fetch-site"] === "same-origin") {
      return;
    }
    throw new AppError(403, "FORBIDDEN_ORIGIN", "Origen de la petición no permitido.");
  });
}
