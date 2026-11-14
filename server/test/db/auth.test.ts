import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp, type BuildAppOptions } from "../../src/app.ts";
import { hashToken, deleteExpiredSessions } from "../../src/auth/sessions.ts";
import { createDatabase } from "../../src/db/pool.ts";
import { testConfig } from "../helpers.ts";
import { appDbConfig, prepareSchema, rootPool } from "./env.ts";

const ORIGIN = "http://localhost:5173";
/** Límites altos para que las pruebas funcionales no choquen con el rate limiting. */
const RELAXED = {
  RATE_LIMIT_GLOBAL_PER_MIN: "10000",
  RATE_LIMIT_LOGIN_PER_MIN: "10000",
  RATE_LIMIT_LOGIN_USER_PER_MIN: "10000",
  RATE_LIMIT_REGISTER_PER_MIN: "10000",
};

function makeApp(env: Record<string, string> = RELAXED, options: Partial<BuildAppOptions> = {}): FastifyInstance {
  return buildApp(testConfig(env), { db: createDatabase(appDbConfig()), ...options });
}

function sessionCookie(res: LightMyRequestResponse) {
  return res.cookies.find((c) => c.name === "dt_session");
}

function post(app: FastifyInstance, url: string, payload?: object, cookie?: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: ORIGIN, ...(cookie ? { cookie: `dt_session=${cookie}` } : {}) },
    ...(payload ? { payload } : {}),
  });
}

function me(app: FastifyInstance, cookie?: string) {
  return app.inject({ method: "GET", url: "/api/auth/me", headers: cookie ? { cookie: `dt_session=${cookie}` } : {} });
}

async function register(app: FastifyInstance, username: string, password = "secreto1", name = "Usuario Prueba") {
  return post(app, "/api/auth/register", { username, name, password });
}

async function login(app: FastifyInstance, username: string, password: string, cookie?: string) {
  return post(app, "/api/auth/login", { username, password }, cookie);
}

async function query<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const root = rootPool();
  try {
    const [rows] = await root.query<T[]>(sql, params);
    return rows;
  } finally {
    await root.end();
  }
}

async function sessionCount(): Promise<number> {
  return (await query<RowDataPacket & { n: number }>("SELECT COUNT(*) AS n FROM sessions"))[0]!.n;
}

describe("registro", () => {
  const app = makeApp();
  before(prepareSchema);
  after(() => app.close());

  it("1. crea el usuario, inicia sesión y devuelve una cookie segura", async () => {
    const res = await register(app, "registro1");
    assert.equal(res.statusCode, 201, res.body);
    const body = res.json();
    assert.deepEqual(Object.keys(body.user).sort(), ["id", "name", "username"]);
    assert.equal(body.user.username, "registro1");
    assert.match(body.user.id, /^[0-9a-f-]{36}$/);

    const cookie = sessionCookie(res);
    assert.ok(cookie, "falta la cookie dt_session");
    assert.match(cookie.value, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, "/");
    assert.equal(cookie.secure, undefined, "en desarrollo/pruebas no lleva Secure");
    const days = (new Date(cookie.expires!).getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30, `caducidad de la cookie: ${days} días`);
    assert.equal((await me(app, cookie.value)).statusCode, 200);
  });

  it("2. rechaza un username duplicado con 409 USERNAME_TAKEN", async () => {
    await register(app, "duplicado");
    const res = await register(app, "duplicado");
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, "USERNAME_TAKEN");
    assert.equal(sessionCookie(res), undefined);
  });

  it("3. normaliza mayúsculas y espacios; la unicidad no distingue mayúsculas", async () => {
    const res = await register(app, "  KoRi.Dev ");
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().user.username, "kori.dev");
    assert.equal((await register(app, "KORI.DEV")).statusCode, 409);
    assert.equal((await login(app, "Kori.DEV", "secreto1")).statusCode, 200);
  });

  it("4. rechaza usernames inválidos con un mensaje por campo", async () => {
    for (const username of ["ab", "_abc", "abc-", "con espacio", "ñandú", "a".repeat(31), "user@mail"]) {
      const res = await register(app, username);
      assert.equal(res.statusCode, 400, username);
      assert.equal(res.json().error.code, "VALIDATION_ERROR");
      assert.ok(res.json().error.fields.username, username);
    }
  });

  it("5. rechaza nombres fuera de 2–100 caracteres", async () => {
    for (const name of ["A", "   ", "x".repeat(101)]) {
      const res = await register(app, "nombres", "secreto1", name);
      assert.equal(res.statusCode, 400, name);
      assert.ok(res.json().error.fields.name);
    }
    const ok = await register(app, "nombres", "secreto1", "  Jo  ");
    assert.equal(ok.statusCode, 201);
    assert.equal(ok.json().user.name, "Jo");
  });

  it("6. rechaza una contraseña de 5 caracteres", async () => {
    const res = await register(app, "corta5", "00000");
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.fields.password, "La contraseña debe tener entre 6 y 128 caracteres.");
  });

  it("7. acepta contraseñas de 6 caracteres sin complejidad (000000, 123456, aaaaaa, abc123)", async () => {
    for (const [i, password] of ["000000", "123456", "aaaaaa", "abc123"].entries()) {
      const res = await register(app, `simple${i}`, password);
      assert.equal(res.statusCode, 201, password);
      assert.equal((await login(app, `simple${i}`, password)).statusCode, 200, password);
    }
  });

  it("8. acepta una contraseña de 128 caracteres", async () => {
    const password = "p".repeat(128);
    assert.equal((await register(app, "larga128", password)).statusCode, 201);
    assert.equal((await login(app, "larga128", password)).statusCode, 200);
  });

  it("9. rechaza una contraseña de 129 caracteres", async () => {
    const res = await register(app, "larga129", "p".repeat(129));
    assert.equal(res.statusCode, 400);
    assert.ok(res.json().error.fields.password);
  });

  it("10. guarda un hash Argon2id (PHC) y nunca la contraseña", async () => {
    await register(app, "hashcheck", "MiClave-Unica-42");
    const [row] = await query<RowDataPacket>("SELECT * FROM users WHERE username = 'hashcheck'");
    assert.match(row!.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    assert.ok(!JSON.stringify(row).includes("MiClave-Unica-42"));
  });

  it("no aplica trim a la contraseña", async () => {
    await register(app, "espacios", "  clave  ");
    assert.equal((await login(app, "espacios", "  clave  ")).statusCode, 200);
    assert.equal((await login(app, "espacios", "clave")).statusCode, 401);
  });

  it("23. rechaza campos adicionales (p. ej. email o id)", async () => {
    const extra = await post(app, "/api/auth/register", { username: "extra1", name: "Extra", password: "secreto1", email: "a@b.c" });
    assert.equal(extra.statusCode, 400);
    assert.equal(extra.json().error.fields.email, "Este campo no está permitido.");
    const loginExtra = await post(app, "/api/auth/login", { username: "extra1", password: "secreto1", remember: true });
    assert.equal(loginExtra.statusCode, 400);
    const wrongType = await post(app, "/api/auth/register", { username: 123, name: "X", password: "secreto1" });
    assert.equal(wrongType.statusCode, 400);
  });
});

describe("inicio de sesión, /me y cierre de sesión", () => {
  const app = makeApp();
  before(async () => {
    await prepareSchema();
    await register(app, "ana", "clave-ana");
  });
  after(() => app.close());

  it("11. login correcto → 200, usuario y cookie nueva", async () => {
    const res = await login(app, "ana", "clave-ana");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.json().user).sort(), ["id", "name", "username"]);
    assert.ok(sessionCookie(res));
  });

  it("12–13. contraseña incorrecta y usuario inexistente → mismo 401 genérico", async () => {
    const wrong = await login(app, "ana", "otra-clave");
    const missing = await login(app, "noexiste", "otra-clave");
    const invalidFormat = await login(app, "_x_", "otra-clave");
    for (const res of [wrong, missing, invalidFormat]) {
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.json(), { error: { code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos." } });
      assert.equal(sessionCookie(res), undefined);
    }
  });

  it("login con campos vacíos → 400", async () => {
    const res = await login(app, "", "");
    assert.equal(res.statusCode, 400);
    assert.deepEqual(Object.keys(res.json().error.fields).sort(), ["password", "username"]);
  });

  it("14. /me con sesión válida devuelve el usuario", async () => {
    const cookie = sessionCookie(await login(app, "ana", "clave-ana"))!.value;
    const res = await me(app, cookie);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().user.username, "ana");
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("15. /me sin sesión o con cookie inválida → 401 UNAUTHENTICATED (y borra la cookie inválida)", async () => {
    const none = await me(app);
    assert.equal(none.statusCode, 401);
    assert.equal(none.json().error.code, "UNAUTHENTICATED");
    const garbage = await me(app, "x".repeat(43));
    assert.equal(garbage.statusCode, 401);
    const cleared = sessionCookie(garbage);
    assert.ok(cleared && cleared.value === "", "debe borrar la cookie");
  });

  it("16. logout revoca la sesión en MySQL y borra la cookie", async () => {
    const cookie = sessionCookie(await login(app, "ana", "clave-ana"))!.value;
    const res = await post(app, "/api/auth/logout", undefined, cookie);
    assert.equal(res.statusCode, 204);
    assert.equal(sessionCookie(res)?.value, "");
    assert.equal((await me(app, cookie)).statusCode, 401);
    const rows = await query<RowDataPacket>("SELECT 1 FROM sessions WHERE token_hash = ?", [hashToken(cookie)]);
    assert.equal(rows.length, 0);
    assert.equal((await post(app, "/api/auth/logout")).statusCode, 204, "logout sin sesión es idempotente");
  });

  it("20. login y registro rotan la sesión: la anterior queda revocada", async () => {
    const first = sessionCookie(await login(app, "ana", "clave-ana"))!.value;
    const second = sessionCookie(await login(app, "ana", "clave-ana", first))!.value;
    assert.notEqual(first, second);
    assert.equal((await me(app, first)).statusCode, 401);
    assert.equal((await me(app, second)).statusCode, 200);

    const third = sessionCookie(await post(app, "/api/auth/register", { username: "rota", name: "Rota", password: "secreto1" }, second))!.value;
    assert.equal((await me(app, second)).statusCode, 401, "registrarse revoca la sesión previa");
    assert.equal((await me(app, third)).json().user.username, "rota");
  });

  it("22. Origin ajeno o ausente → 403, y no se cierra la sesión", async () => {
    const cookie = sessionCookie(await login(app, "ana", "clave-ana"))!.value;
    const evil = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: "https://evil.example", cookie: `dt_session=${cookie}` },
    });
    assert.equal(evil.statusCode, 403);
    assert.equal((await me(app, cookie)).statusCode, 200);
    const noOrigin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "ana", password: "clave-ana" } });
    assert.equal(noOrigin.statusCode, 403);
  });

  it("rehash: un hash con parámetros antiguos se actualiza al iniciar sesión", async () => {
    const weak = await hash("clave-vieja", { memoryCost: 8_192, timeCost: 1, parallelism: 1 });
    const root = rootPool();
    await root.query("UPDATE users SET password_hash = ? WHERE username = 'ana'", [weak]);
    await root.end();
    assert.equal((await login(app, "ana", "clave-vieja")).statusCode, 200);
    const [row] = await query<RowDataPacket>("SELECT password_hash FROM users WHERE username = 'ana'");
    assert.match(row!.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    const root2 = rootPool();
    await root2.query("UPDATE users SET password_hash = ? WHERE username = 'ana'", [await hash("clave-ana")]);
    await root2.end();
  });
});

describe("caducidad y persistencia de sesiones", () => {
  let cookie: string;
  const app = makeApp();
  before(prepareSchema);
  beforeEach(async () => {
    const res = await register(app, `cad${Date.now() % 1_000_000}`);
    cookie = sessionCookie(res)!.value;
  });
  after(() => app.close());

  async function setSession(sql: string) {
    const root = rootPool();
    await root.query(`UPDATE sessions SET ${sql} WHERE token_hash = ?`, [hashToken(cookie)]);
    await root.end();
  }

  it("17. la sesión sobrevive a un reinicio de la API (nuevo proceso de app y nuevo pool)", async () => {
    const second = makeApp();
    const res = await me(second, cookie);
    await second.close();
    assert.equal(res.statusCode, 200);
  });

  it("la caducidad inicial es 7 días (inactividad) y 30 días (absoluta)", async () => {
    const [row] = await query<RowDataPacket>(
      "SELECT TIMESTAMPDIFF(HOUR, created_at, idle_expires_at) AS idle, TIMESTAMPDIFF(HOUR, created_at, absolute_expires_at) AS abs FROM sessions WHERE token_hash = ?",
      [hashToken(cookie)],
    );
    assert.equal(row!.idle, 168);
    assert.equal(row!.abs, 720);
  });

  it("18. caduca por inactividad: 401 y la fila se borra", async () => {
    await setSession("idle_expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    assert.equal((await me(app, cookie)).statusCode, 401);
    const rows = await query<RowDataPacket>("SELECT 1 FROM sessions WHERE token_hash = ?", [hashToken(cookie)]);
    assert.equal(rows.length, 0);
  });

  it("la actividad renueva la caducidad por inactividad, sin superar la absoluta", async () => {
    await setSession(
      "last_seen_at = UTC_TIMESTAMP(3) - INTERVAL 1 DAY, idle_expires_at = UTC_TIMESTAMP(3) + INTERVAL 1 HOUR, absolute_expires_at = UTC_TIMESTAMP(3) + INTERVAL 2 DAY",
    );
    assert.equal((await me(app, cookie)).statusCode, 200);
    const [row] = await query<RowDataPacket>(
      "SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(3), idle_expires_at) AS idle, idle_expires_at = absolute_expires_at AS capped FROM sessions WHERE token_hash = ?",
      [hashToken(cookie)],
    );
    assert.equal(row!.capped, 1, "idle_expires_at queda limitada por absolute_expires_at");
    assert.ok(row!.idle > 47 * 60);
  });

  it("19. caduca por duración absoluta aunque haya actividad reciente", async () => {
    await setSession("absolute_expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND");
    assert.equal((await me(app, cookie)).statusCode, 401);
  });

  it("la limpieza elimina solo las sesiones caducadas", async () => {
    await setSession("idle_expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE");
    const other = sessionCookie(await register(app, `viva${Date.now() % 1_000_000}`))!.value;
    const before = await sessionCount();
    const deleted = await deleteExpiredSessions(app.db.pool);
    assert.ok(deleted >= 1);
    assert.equal(await sessionCount(), before - deleted);
    assert.equal((await me(app, other)).statusCode, 200);
  });
});

describe("21. límites de peticiones de autenticación", () => {
  before(prepareSchema);

  it("registro: 5 por minuto por IP; el sexto → 429", async () => {
    const app = makeApp({});
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await register(app, `limite${i}`)).statusCode);
    await app.close();
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  });

  it("login: 5 por minuto por username normalizado (aunque cambie el formato)", async () => {
    const app = makeApp({ RATE_LIMIT_REGISTER_PER_MIN: "100" });
    await register(app, "objetivo", "clave-real");
    const variants = ["objetivo", "OBJETIVO", " Objetivo ", "objetivo", "ObJeTiVo", "objetivo"];
    const statuses = [];
    for (const u of variants) statuses.push((await login(app, u, "mala-clave")).statusCode);
    const correct = await login(app, "objetivo", "clave-real");
    const otherUser = await login(app, "otro", "mala-clave");
    await app.close();
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    assert.equal(correct.statusCode, 429, "durante la ventana también se limita el intento correcto");
    assert.equal(correct.json().error.code, "RATE_LIMITED");
    assert.equal(otherUser.statusCode, 401, "otros usernames no se ven afectados");
  });

  it("login: 10 por minuto por IP aunque se cambie de username", async () => {
    const app = makeApp({});
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await login(app, `ip${i}`, "x123456")).statusCode);
    await app.close();
    assert.deepEqual(statuses, [...Array(10).fill(401), 429]);
  });
});

describe("24. logs sin secretos", () => {
  before(prepareSchema);

  it("ni contraseñas, ni tokens, ni hashes, ni cookies aparecen en los logs", async () => {
    const lines: string[] = [];
    const app = makeApp({ ...RELAXED, LOG_LEVEL: "trace" }, { logStream: { write: (m) => void lines.push(m) } });
    const password = "Clave-Secreta-En-Log-77";
    const reg = await register(app, "logger", password);
    const token = sessionCookie(reg)!.value;
    await login(app, "logger", "Clave-Equivocada-88");
    await me(app, token);
    await post(app, "/api/auth/logout", undefined, token);
    const [row] = await query<RowDataPacket>("SELECT password_hash FROM users WHERE username = 'logger'");
    await app.close();

    const output = lines.join("");
    assert.ok(output.length > 0);
    for (const secret of [password, "Clave-Equivocada-88", token, row!.password_hash]) {
      assert.ok(!output.includes(secret), "un secreto aparece en los logs");
    }
  });
});

describe("25. MySQL no disponible", () => {
  it("registro, login y /me responden 503 UNAVAILABLE sin detalles internos", async () => {
    const down = createDatabase({ ...appDbConfig(), port: 1, connectTimeoutMs: 1000 });
    const app = buildApp(testConfig(RELAXED), { db: down });
    const responses = [
      await register(app, "caido"),
      await login(app, "caido", "secreto1"),
      await me(app, "a".repeat(43)),
    ];
    await app.close();
    for (const res of responses) {
      assert.equal(res.statusCode, 503, res.body);
      assert.deepEqual(res.json(), { error: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." } });
      assert.ok(!res.body.includes("ECONNREFUSED") && !res.body.includes("3306"));
    }
  });
});
