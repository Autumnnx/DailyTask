import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthConfig, RateLimitConfig } from "../config.ts";
import { AppError } from "../http/errors.ts";
import { rateLimitError } from "../http/rate-limit.ts";
import { cookieOptions } from "./cookies.ts";
import { makeRequireAuth } from "./guard.ts";
import { PasswordHasher } from "./password.ts";
import { findUserByUsername, insertUser, type PublicUser, updatePasswordHash } from "./repository.ts";
import { createSession, deleteExpiredSessions, revokeSession, SESSION_COOKIE } from "./sessions.ts";
import { isValidUsername, MESSAGES, normalizeUsername, type RegisterInput, validateRegister } from "./validation.ts";

export interface AuthRoutesOptions {
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
}

const USERNAME_TAKEN = "Ese nombre de usuario ya está en uso.";
const INVALID_CREDENTIALS = "Usuario o contraseña incorrectos.";

// Los esquemas solo fijan tipos, campos permitidos y topes defensivos de tamaño;
// las reglas con mensajes propios se aplican en validation.ts.
const userResponse = {
  type: "object",
  properties: {
    user: {
      type: "object",
      properties: { id: { type: "string" }, username: { type: "string" }, name: { type: "string" } },
      required: ["id", "username", "name"],
      additionalProperties: false,
    },
  },
  required: ["user"],
  additionalProperties: false,
} as const;

const registerBody = {
  type: "object",
  properties: {
    username: { type: "string", maxLength: 100 },
    name: { type: "string", maxLength: 300 },
    password: { type: "string", maxLength: 1024 },
  },
  required: ["username", "name", "password"],
  additionalProperties: false,
} as const;

const loginBody = {
  type: "object",
  properties: {
    username: { type: "string", maxLength: 100 },
    password: { type: "string", maxLength: 1024 },
  },
  required: ["username", "password"],
  additionalProperties: false,
} as const;

/** /api/auth/*: registro, inicio y cierre de sesión, usuario actual. */
export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { auth, rateLimit } = opts;
  const pool = () => app.db.pool;
  const hasher = new PasswordHasher(auth.argon2);
  const ttl = { idleMs: auth.sessionIdleTtlMs, absoluteMs: auth.sessionAbsoluteTtlMs };
  const requireAuth = makeRequireAuth(auth);

  /** Rota la sesión: revoca la que viniera en la cookie y crea una nueva. */
  async function startSession(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
    const previous = request.cookies[SESSION_COOKIE];
    if (previous) await revokeSession(pool(), previous);
    const session = await createSession(pool(), userId, ttl);
    reply.setCookie(SESSION_COOKIE, session.token, { ...cookieOptions(auth), expires: session.absoluteExpiresAt });
  }

  // Límite adicional de login por nombre de usuario normalizado (además del límite por IP de
  // `config.rateLimit`). Se usa `createRateLimit` porque `rateLimit()` se omite si ya se aplicó
  // otro límite a la misma petición.
  const checkLoginPerUsername = app.createRateLimit({
    max: rateLimit.loginPerUsernamePerMinute,
    timeWindow: 60_000,
    keyGenerator: (request) => {
      const raw = (request.body as { username?: unknown } | undefined)?.username;
      return `login-user:${typeof raw === "string" ? normalizeUsername(raw) : ""}`;
    },
  });
  async function loginPerUsername(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await checkLoginPerUsername(request);
    if (!result.isAllowed && result.isExceeded) {
      reply.header("retry-after", String(result.ttlInSeconds));
      throw rateLimitError(request, result);
    }
  }

  app.post<{ Body: RegisterInput }>(
    "/register",
    {
      schema: { body: registerBody, response: { 201: userResponse } },
      config: { rateLimit: { max: rateLimit.registerPerMinute, timeWindow: 60_000 } },
    },
    async (request, reply) => {
      const { value, fields } = validateRegister(request.body);
      if (Object.keys(fields).length > 0) throw new AppError(400, "VALIDATION_ERROR", "Revisa los campos marcados.", fields);

      const now = new Date();
      const user: PublicUser = { id: randomUUID(), username: value.username, name: value.name };
      const passwordHash = await hasher.hash(value.password);
      if ((await insertUser(pool(), { ...user, passwordHash }, now)) === "duplicate") {
        throw new AppError(409, "USERNAME_TAKEN", USERNAME_TAKEN, { username: USERNAME_TAKEN });
      }

      await startSession(request, reply, user.id);
      reply.status(201);
      return { user };
    },
  );

  app.post<{ Body: { username: string; password: string } }>(
    "/login",
    {
      schema: { body: loginBody, response: { 200: userResponse } },
      config: { rateLimit: { max: rateLimit.loginPerMinute, timeWindow: 60_000 } },
      preHandler: loginPerUsername,
    },
    async (request, reply) => {
      const username = normalizeUsername(request.body.username);
      const { password } = request.body;
      const fields: Record<string, string> = {};
      if (!username) fields.username = MESSAGES.loginUsername;
      if (!password) fields.password = MESSAGES.loginPassword;
      if (Object.keys(fields).length > 0) throw new AppError(400, "VALIDATION_ERROR", "Revisa los campos marcados.", fields);

      const found = isValidUsername(username) ? await findUserByUsername(pool(), username) : null;
      if (!found) {
        await hasher.verifyDummy(password);
        throw new AppError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
      }
      if (!(await hasher.verify(found.passwordHash, password))) {
        throw new AppError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
      }
      if (hasher.needsRehash(found.passwordHash)) {
        await updatePasswordHash(pool(), found.id, await hasher.hash(password), new Date());
      }

      await startSession(request, reply, found.id);
      return { user: { id: found.id, username: found.username, name: found.name } };
    },
  );

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await revokeSession(pool(), token);
    reply.clearCookie(SESSION_COOKIE, cookieOptions(auth));
    return reply.status(204).send();
  });

  app.get("/me", { schema: { response: { 200: userResponse } }, preHandler: requireAuth }, async (request) => {
    return { user: request.user! };
  });

  // Limpieza periódica de sesiones caducadas (temporizador sencillo, sin planificador externo).
  let timer: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    timer = setInterval(() => {
      deleteExpiredSessions(pool())
        .then((n) => n > 0 && app.log.info({ deleted: n }, "sesiones caducadas eliminadas"))
        .catch((error: unknown) => app.log.warn({ code: (error as { code?: string }).code }, "limpieza de sesiones fallida"));
    }, auth.sessionCleanupIntervalMs);
    timer.unref();
  });
  app.addHook("onClose", async () => clearInterval(timer));
}
