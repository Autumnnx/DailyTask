import type { FastifyInstance } from "fastify";

/**
 * GET /api/health
 * Fase 1: solo indica que el proceso responde. En la Fase 2 se añadirá la
 * comprobación de MySQL (503 si la base no responde), sin detalles internos.
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
        },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "no-store");
      return { status: "ok" as const };
    },
  );
}
