import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { describeDbError, isDbUnavailable } from "../db/pool.ts";

/**
 * Formato único de error de la API (ver docs/backend-planning/API.md §1.1):
 *   { "error": { "code": "...", "message": "...", "fields"?: { campo: mensaje } } }
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "USERNAME_TAKEN"
  | "TASK_LIMIT_REACHED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "REQUEST_TIMEOUT"
  | "INTERNAL"
  | "UNAVAILABLE";

export interface ErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

/** Error esperado de la aplicación: se devuelve tal cual al cliente. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;
  /** Datos adicionales seguros dentro de `error` (p. ej. `{ limit: 1000 }`). */
  readonly extra: Record<string, number | string> | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>,
    extra?: Record<string, number | string>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    this.extra = extra;
  }
}

const GENERIC: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: "BAD_REQUEST", message: "La petición no es válida." },
  404: { code: "NOT_FOUND", message: "Recurso no encontrado." },
  405: { code: "METHOD_NOT_ALLOWED", message: "Método no permitido." },
  408: { code: "REQUEST_TIMEOUT", message: "La petición tardó demasiado." },
  413: { code: "PAYLOAD_TOO_LARGE", message: "La petición es demasiado grande." },
  415: { code: "UNSUPPORTED_MEDIA_TYPE", message: "El contenido debe enviarse como JSON." },
  429: { code: "RATE_LIMITED", message: "Demasiadas peticiones. Inténtalo de nuevo en unos momentos." },
  503: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." },
};

const INTERNAL = { code: "INTERNAL" as const, message: "Ha ocurrido un error inesperado." };

type ValidationIssue = NonNullable<FastifyError["validation"]>[number];

function fieldName(issue: ValidationIssue): string {
  const params = issue.params as Record<string, unknown>;
  if (issue.keyword === "required" && typeof params.missingProperty === "string") return params.missingProperty;
  if (issue.keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
    return params.additionalProperty;
  }
  const path = issue.instancePath.replace(/^\//, "").replace(/\//g, ".");
  return path || "_";
}

function fieldMessage(issue: ValidationIssue): string {
  if (issue.keyword === "required") return "Este campo es obligatorio.";
  if (issue.keyword === "additionalProperties") return "Este campo no está permitido.";
  return "Valor no válido.";
}

export function toErrorBody(code: ErrorCode, message: string, fields?: Record<string, string>): ErrorBody {
  return fields && Object.keys(fields).length > 0 ? { error: { code, message, fields } } : { error: { code, message } };
}

function handleError(error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    const body = toErrorBody(error.code, error.message, error.fields);
    if (error.extra) Object.assign(body.error, error.extra);
    return reply.status(error.statusCode).send(body);
  }

  const fastifyError = error as FastifyError;

  if (fastifyError.validation) {
    const fields: Record<string, string> = {};
    for (const issue of fastifyError.validation) {
      const name = fieldName(issue);
      fields[name] ??= fieldMessage(issue);
    }
    return reply.status(400).send(toErrorBody("VALIDATION_ERROR", "Revisa los campos marcados.", fields));
  }

  const status = typeof fastifyError.statusCode === "number" ? fastifyError.statusCode : 500;

  if (status >= 400 && status < 500) {
    const generic = GENERIC[status] ?? GENERIC[400]!;
    request.log.info({ code: fastifyError.code, statusCode: status }, "petición rechazada");
    if (status === 429 && reply.getHeader("retry-after") === undefined) reply.header("retry-after", "60");
    return reply.status(status).send(toErrorBody(generic.code, generic.message));
  }

  if (isDbUnavailable(error)) {
    request.log.warn({ db: describeDbError(error) }, "MySQL no disponible");
    return reply.status(503).send(toErrorBody(GENERIC[503]!.code, GENERIC[503]!.message));
  }

  // 5xx o desconocido: detalle solo en el log, respuesta genérica.
  request.log.error({ err: error }, "error no controlado");
  const body = status === 503 ? GENERIC[503]! : INTERNAL;
  return reply.status(status === 503 ? 503 : 500).send(toErrorBody(body.code, body.message));
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(toErrorBody("NOT_FOUND", GENERIC[404]!.message));
  });
}
