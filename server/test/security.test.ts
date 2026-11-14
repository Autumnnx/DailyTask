import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";
import { testApp, UNIT_DB_ENV } from "./helpers.ts";

const DEV_ORIGIN = "http://localhost:5173";

describe("verificación de Origin (CSRF)", () => {
  // POST /api/auth/logout sin cookie no toca la base: sirve para probar la verificación.
  const logout = (headers: Record<string, string>) =>
    testApp().inject({ method: "POST", url: "/api/auth/logout", headers });

  it("acepta orígenes permitidos (desarrollo: localhost:5173 y 127.0.0.1:5173)", async () => {
    assert.equal((await logout({ origin: DEV_ORIGIN })).statusCode, 204);
    assert.equal((await logout({ origin: "http://127.0.0.1:5173" })).statusCode, 204);
  });

  it("acepta peticiones sin Origin solo si Sec-Fetch-Site es same-origin", async () => {
    assert.equal((await logout({ "sec-fetch-site": "same-origin" })).statusCode, 204);
    assert.equal((await logout({ "sec-fetch-site": "cross-site" })).statusCode, 403);
  });

  it("rechaza con 403 FORBIDDEN_ORIGIN: sin Origin, Origin ajeno u Origin 'null'", async () => {
    const cases: Record<string, string>[] = [{}, { origin: "https://evil.example" }, { origin: "null" }, { origin: "http://localhost:5174" }];
    for (const headers of cases) {
      const res = await logout(headers);
      assert.equal(res.statusCode, 403, JSON.stringify(headers));
      assert.deepEqual(res.json(), { error: { code: "FORBIDDEN_ORIGIN", message: "Origen de la petición no permitido." } });
    }
  });

  it("no afecta a las peticiones de lectura", async () => {
    const res = await testApp().inject({ method: "GET", url: "/api/health", headers: { origin: "https://evil.example" } });
    assert.equal(res.statusCode, 200);
  });

  it("no se puede eludir con rutas codificadas o variantes de la URL (regresión Fase 6)", async () => {
    const app = testApp();
    for (const url of ["/%61pi/auth/logout", "/api/auth/%6Cogout", "/api//auth/logout", "/api/auth/logout/", "/%61pi/tasks"]) {
      const res = await app.inject({ method: "POST", url });
      assert.equal(res.statusCode, 403, url);
    }
    await app.close();
  });

  it("las respuestas de la API no se cachean aunque la URL venga codificada", async () => {
    const app = testApp();
    const res = await app.inject({ method: "GET", url: "/%61pi/health" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    await app.close();
  });

  it("usa PUBLIC_ORIGIN cuando está definido", async () => {
    const app = testApp({ PUBLIC_ORIGIN: "https://dailytask.example" });
    const ok = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: "https://dailytask.example" } });
    const ko = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: DEV_ORIGIN } });
    assert.equal(ok.statusCode, 204);
    assert.equal(ko.statusCode, 403);
  });
});

describe("límite global de peticiones", () => {
  it("responde 429 RATE_LIMITED con Retry-After al superar el límite por IP", async () => {
    const app = testApp({ RATE_LIMIT_GLOBAL_PER_MIN: "3" });
    for (let i = 0; i < 3; i++) assert.equal((await app.inject({ url: "/api/health" })).statusCode, 200);
    const res = await app.inject({ url: "/api/health" });
    assert.equal(res.statusCode, 429);
    assert.deepEqual(res.json(), {
      error: { code: "RATE_LIMITED", message: "Demasiadas peticiones. Inténtalo de nuevo en unos momentos." },
    });
    assert.ok(res.headers["retry-after"], "debe incluir Retry-After");
    await app.close();
  });

  it("sin TRUST_PROXY, X-Forwarded-For no permite eludir el límite", async () => {
    const app = testApp({ RATE_LIMIT_GLOBAL_PER_MIN: "2" });
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.inject({ url: "/api/health", headers: { "x-forwarded-for": `203.0.113.${i}` } })).statusCode);
    }
    assert.deepEqual(statuses, [200, 200, 429, 429]);
    await app.close();
  });

  it("con TRUST_PROXY, la IP real del cliente sale de X-Forwarded-For", async () => {
    const app = testApp({ RATE_LIMIT_GLOBAL_PER_MIN: "1", TRUST_PROXY: "127.0.0.1" });
    const a = await app.inject({ url: "/api/health", headers: { "x-forwarded-for": "203.0.113.1" } });
    const b = await app.inject({ url: "/api/health", headers: { "x-forwarded-for": "203.0.113.2" } });
    const a2 = await app.inject({ url: "/api/health", headers: { "x-forwarded-for": "203.0.113.1" } });
    assert.deepEqual([a.statusCode, b.statusCode, a2.statusCode], [200, 200, 429]);
    await app.close();
  });
});

describe("configuración de autenticación", () => {
  const prod = { ...UNIT_DB_ENV, NODE_ENV: "production", PUBLIC_ORIGIN: "https://dailytask.example" };

  it("valores por defecto: cookie no Secure fuera de producción, 7/30 días, límites 300/10/5/5", () => {
    const config = loadConfig({ ...UNIT_DB_ENV });
    assert.equal(config.auth.cookieSecure, false);
    assert.equal(config.auth.sessionIdleTtlMs, 7 * 24 * 3_600_000);
    assert.equal(config.auth.sessionAbsoluteTtlMs, 30 * 24 * 3_600_000);
    assert.deepEqual(config.rateLimit, { globalPerMinute: 300, loginPerMinute: 10, loginPerUsernamePerMinute: 5, registerPerMinute: 5 });
    assert.deepEqual(config.auth.argon2, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  });

  it("producción: cookie Secure por defecto, PUBLIC_ORIGIN https obligatoria, COOKIE_SECURE=false prohibido", () => {
    assert.equal(loadConfig(prod).auth.cookieSecure, true);
    assert.throws(() => loadConfig({ ...prod, PUBLIC_ORIGIN: "" }), ConfigError);
    assert.throws(() => loadConfig({ ...prod, PUBLIC_ORIGIN: "http://dailytask.example" }), ConfigError);
    assert.throws(() => loadConfig({ ...prod, COOKIE_SECURE: "false" }), ConfigError);
  });

  it("rechaza caducidad absoluta menor que la de inactividad y parámetros Argon2 por debajo del mínimo", () => {
    assert.throws(() => loadConfig({ ...UNIT_DB_ENV, SESSION_IDLE_TTL_HOURS: "48", SESSION_ABSOLUTE_TTL_HOURS: "24" }), ConfigError);
    assert.throws(() => loadConfig({ ...UNIT_DB_ENV, ARGON2_MEMORY_KIB: "1024" }), ConfigError);
  });

  it("los límites de peticiones son configurables", () => {
    const config = loadConfig({ ...UNIT_DB_ENV, RATE_LIMIT_LOGIN_PER_MIN: "20", RATE_LIMIT_REGISTER_PER_MIN: "2" });
    assert.equal(config.rateLimit.loginPerMinute, 20);
    assert.equal(config.rateLimit.registerPerMinute, 2);
  });
});
