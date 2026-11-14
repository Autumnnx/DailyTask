import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { fakeDb, testApp } from "./helpers.ts";

describe("GET /api/health (sin MySQL real)", () => {
  const app = testApp();
  after(() => app.close());

  it("responde 200 con { status: 'ok' } si la base responde", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /^application\/json/);
    assert.deepEqual(res.json(), { status: "ok" });
  });

  it("incluye cabeceras de seguridad y no se cachea", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("devuelve 404 con el formato de error para rutas inexistentes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/no-existe" });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: { code: "NOT_FOUND", message: "Recurso no encontrado." } });
  });

  it("devuelve 404 para métodos no registrados en la ruta", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/health", headers: { origin: "http://localhost:5173" } });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, "NOT_FOUND");
  });
});

describe("GET /api/health con la base caída (simulada)", () => {
  it("responde 503 UNAVAILABLE sin revelar el error interno", async () => {
    const internal = Object.assign(new Error("Access denied for user 'dailytask_app'@'10.0.0.5' /run/mysqld.sock"), {
      code: "ER_ACCESS_DENIED_ERROR",
    });
    const app = testApp({}, { db: fakeDb({ failPing: internal }) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." } });
    assert.equal(res.headers["cache-control"], "no-store");
    for (const leak of ["Access denied", "dailytask_app", "mysqld.sock", "ER_ACCESS"]) {
      assert.ok(!res.body.includes(leak), `la respuesta contiene ${leak}`);
    }
  });

  it("app.close() cierra la base de datos", async () => {
    const db = fakeDb();
    const app = testApp({}, { db });
    await app.ready();
    await app.close();
    assert.equal(db.closed, true);
  });
});
