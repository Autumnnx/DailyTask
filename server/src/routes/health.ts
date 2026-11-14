import type { FastifyInstance } from "fastify";
import { describeDbError } from "../db/pool.ts";
import { toErrorBody } from "../http/errors.ts";

/**
 * GET /api/health
 * 200 { status: "ok" } si el proceso responde y MySQL contesta a `SELECT 1`.
 * 503 UNAVAILABLE si MySQL no responde; el detalle (seguro) solo va al log.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string", const: "ok" } },
            required: ["status"],
            additionalProperties: false,
          },
          503: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: { code: { type: "string" }, message: { type: "string" } },
                required: ["code", "message"],
              },
            },
            required: ["error"],
          },
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      try {
        await app.db.ping();
      } catch (error) {
        request.log.warn({ db: describeDbError(error) }, "health: MySQL no disponible");
        return reply.status(503).send(toErrorBody("UNAVAILABLE", "Servicio no disponible temporalmente."));
      }
      return { status: "ok" as const };
    },
  );
}
