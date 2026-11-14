import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { testApp } from "./helpers.ts";

describe("GET /api/health", () => {
  const app = testApp();
  after(() => app.close());

  it("responde 200 con { status: 'ok' }", async () => {
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
    const res = await app.inject({ method: "DELETE", url: "/api/health" });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, "NOT_FOUND");
  });
});
