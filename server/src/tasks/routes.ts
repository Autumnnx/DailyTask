import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { makeRequireAuth } from "../auth/guard.ts";
import type { AuthConfig } from "../config.ts";
import { AppError } from "../http/errors.ts";
import {
  changeTaskStatus,
  createTaskWithLimit,
  deleteTask,
  getTask,
  listTasks,
  type TaskFilters,
  updateTask,
} from "./repository.ts";
import { PRIORITIES, type Status, STATUSES, type TaskInput, UUID_PATTERN, validateTaskInput } from "./validation.ts";

export interface TaskRoutesOptions {
  auth: AuthConfig;
  maxPerUser: number;
}

type TaskBody = Omit<TaskInput, "description"> & { description?: string };

const NOT_FOUND = "Tarea no encontrada.";

const taskSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    dueDate: { type: "string" },
    priority: { type: "string" },
    status: { type: "string" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    completedAt: { type: ["string", "null"] },
  },
  required: ["id", "title", "description", "dueDate", "priority", "status", "createdAt", "updatedAt", "completedAt"],
  additionalProperties: false,
} as const;

const taskResponse = {
  type: "object",
  properties: { task: taskSchema },
  required: ["task"],
  additionalProperties: false,
} as const;

// Tipos, campos permitidos y topes defensivos; las reglas con mensaje propio están en validation.ts.
const taskBody = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 1000 },
    description: { type: "string", maxLength: 4000 },
    dueDate: { type: "string", maxLength: 32 },
    priority: { type: "string", enum: PRIORITIES },
    status: { type: "string", enum: STATUSES },
  },
  required: ["title", "dueDate", "priority", "status"],
  additionalProperties: false,
} as const;

const idParams = {
  type: "object",
  properties: { id: { type: "string", maxLength: 64 } },
  required: ["id"],
  additionalProperties: false,
} as const;

/** /api/tasks/*: CRUD de tareas del usuario autenticado. */
export async function taskRoutes(app: FastifyInstance, opts: TaskRoutesOptions): Promise<void> {
  const pool = () => app.db.pool;

  // Todas las rutas requieren sesión; el usuario sale siempre de la sesión, nunca del cliente.
  // En preValidation: sin sesión se responde 401 antes de validar (y revelar) nada del cuerpo.
  app.addHook("preValidation", makeRequireAuth(opts.auth));

  function validId(id: string): string {
    if (!UUID_PATTERN.test(id)) throw new AppError(404, "NOT_FOUND", NOT_FOUND);
    return id;
  }

  function validInput(body: TaskBody): TaskInput {
    const { value, fields } = validateTaskInput(body);
    if (Object.keys(fields).length > 0) throw new AppError(400, "VALIDATION_ERROR", "Revisa los campos marcados.", fields);
    return value;
  }

  async function loadOrNotFound(userId: string, id: string) {
    const task = await getTask(pool(), userId, id);
    if (!task) throw new AppError(404, "NOT_FOUND", NOT_FOUND);
    return task;
  }

  app.get<{ Querystring: TaskFilters }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: STATUSES },
            priority: { type: "string", enum: PRIORITIES },
            q: { type: "string", maxLength: 100 },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: "object", properties: { tasks: { type: "array", items: taskSchema } }, required: ["tasks"], additionalProperties: false },
        },
      },
    },
    async (request) => {
      const { status, priority } = request.query;
      const q = request.query.q?.trim();
      const filters: TaskFilters = {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(q ? { q } : {}),
      };
      return { tasks: await listTasks(pool(), request.user!.id, filters) };
    },
  );

  app.post<{ Body: TaskBody }>(
    "/",
    { schema: { body: taskBody, response: { 201: taskResponse } } },
    async (request, reply) => {
      const input = validInput(request.body);
      const result = await createTaskWithLimit(pool(), request.user!.id, randomUUID(), input, new Date(), opts.maxPerUser);
      if (!result.ok) {
        if (result.reason === "no_user") throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
        throw new AppError(
          409,
          "TASK_LIMIT_REACHED",
          `Has alcanzado el máximo de ${opts.maxPerUser} tareas. Elimina alguna para crear una nueva.`,
          undefined,
          { limit: opts.maxPerUser },
        );
      }
      reply.status(201).header("location", `/api/tasks/${result.task.id}`);
      return { task: result.task };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id",
    { schema: { params: idParams, response: { 200: taskResponse } } },
    async (request) => ({ task: await loadOrNotFound(request.user!.id, validId(request.params.id)) }),
  );

  app.put<{ Params: { id: string }; Body: TaskBody }>(
    "/:id",
    { schema: { params: idParams, body: taskBody, response: { 200: taskResponse } } },
    async (request) => {
      const id = validId(request.params.id);
      const input = validInput(request.body);
      if (!(await updateTask(pool(), request.user!.id, id, input, new Date()))) throw new AppError(404, "NOT_FOUND", NOT_FOUND);
      return { task: await loadOrNotFound(request.user!.id, id) };
    },
  );

  app.patch<{ Params: { id: string }; Body: { status: Status } }>(
    "/:id/status",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          properties: { status: { type: "string", enum: STATUSES } },
          required: ["status"],
          additionalProperties: false,
        },
        response: { 200: taskResponse },
      },
    },
    async (request) => {
      const id = validId(request.params.id);
      if (!(await changeTaskStatus(pool(), request.user!.id, id, request.body.status, new Date()))) {
        throw new AppError(404, "NOT_FOUND", NOT_FOUND);
      }
      return { task: await loadOrNotFound(request.user!.id, id) };
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", { schema: { params: idParams } }, async (request, reply) => {
    const id = validId(request.params.id);
    if (!(await deleteTask(pool(), request.user!.id, id))) throw new AppError(404, "NOT_FOUND", NOT_FOUND);
    return reply.status(204).send();
  });
}
