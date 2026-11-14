import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { CONTENT_SECURITY_POLICY } from "../src/app.ts";
import { ConfigError, loadConfig } from "../src/config.ts";
import { testApp, UNIT_DB_ENV } from "./helpers.ts";

/** dist/ de prueba con un .env dentro y un secreto fuera de la raíz. */
function makeDist(): string {
  const base = mkdtempSync(join(tmpdir(), "dailytask-static-"));
  const dist = join(base, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>DailyTask</title><div id=root></div>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log('app')");
  writeFileSync(join(dist, "assets", "index-abc123.css"), "body{}");
  writeFileSync(join(dist, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dist, ".env"), "DB_PASSWORD=no-debe-verse");
  writeFileSync(join(base, "secreto.txt"), "fuera-de-la-raiz");
  return dist;
}

const ORIGIN = { origin: "http://localhost:5173" };

describe("frontend servido por Fastify (STATIC_DIR)", () => {
  let app: FastifyInstance;
  before(() => {
    app = testApp({ STATIC_DIR: makeDist() });
  });
  after(() => app.close());

  it("/ devuelve index.html sin caché de larga duración y con cabeceras de seguridad", async () => {
    const res = await app.inject({ url: "/" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /^text\/html/);
    assert.match(res.body, /DailyTask/);
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.equal(res.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["referrer-policy"], "same-origin");
  });

  it("las rutas del SPA (React Router) devuelven index.html, también con HEAD", async () => {
    for (const url of ["/registro", "/login", "/una/ruta/profunda", "/registro?x=1"]) {
      const res = await app.inject({ url });
      assert.equal(res.statusCode, 200, url);
      assert.match(String(res.headers["content-type"]), /^text\/html/, url);
      assert.equal(res.headers["cache-control"], "no-cache", url);
    }
    assert.equal((await app.inject({ method: "HEAD", url: "/registro" })).statusCode, 200);
  });

  it("los recursos con hash tienen tipo MIME correcto y caché inmutable", async () => {
    const js = await app.inject({ url: "/assets/index-abc123.js" });
    assert.equal(js.statusCode, 200);
    assert.match(String(js.headers["content-type"]), /javascript/);
    assert.equal(js.headers["cache-control"], "public, max-age=31536000, immutable");
    const css = await app.inject({ url: "/assets/index-abc123.css" });
    assert.match(String(css.headers["content-type"]), /^text\/css/);
    const svg = await app.inject({ url: "/favicon.svg" });
    assert.match(String(svg.headers["content-type"]), /^image\/svg\+xml/);
    assert.equal(svg.headers["cache-control"], "no-cache");
  });

  it("la API sigue funcionando y sus rutas inexistentes devuelven JSON, no HTML", async () => {
    const health = await app.inject({ url: "/api/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok" });
    assert.equal(health.headers["cache-control"], "no-store");
    for (const url of ["/api/no-existe", "/api", "/%61pi/no-existe", "/api/tasks/x/y/z"]) {
      const res = await app.inject({ url });
      assert.equal(res.statusCode, 404, url);
      assert.match(String(res.headers["content-type"]), /^application\/json/, url);
      assert.equal(res.json().error.code, "NOT_FOUND", url);
    }
  });

  it("un recurso inexistente con extensión da 404 (no index.html)", async () => {
    const res = await app.inject({ url: "/assets/no-existe.js" });
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers["content-type"]), /^application\/json/);
  });

  it("no expone archivos ocultos ni sale de la raíz (directory traversal)", async () => {
    for (const url of ["/.env", "/assets/../.env", "/../secreto.txt", "/%2e%2e/secreto.txt", "/assets/%2e%2e/%2e%2e/secreto.txt", "/..%2fsecreto.txt"]) {
      const res = await app.inject({ url });
      assert.notEqual(res.statusCode, 200, url);
      assert.ok(!res.body.includes("no-debe-verse") && !res.body.includes("fuera-de-la-raiz"), url);
    }
  });

  it("no lista carpetas", async () => {
    const res = await app.inject({ url: "/assets/" });
    assert.ok(!res.body.includes("index-abc123.js"));
  });

  it("las peticiones que modifican datos a rutas del SPA dan JSON 404 (y siguen exigiendo Origin)", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/registro" })).statusCode, 403);
    const res = await app.inject({ method: "POST", url: "/registro", headers: ORIGIN });
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers["content-type"]), /^application\/json/);
  });
});

describe("modo solo API (sin STATIC_DIR)", () => {
  it("/ responde JSON 404 y no hay frontend", async () => {
    const app = testApp();
    const res = await app.inject({ url: "/" });
    await app.close();
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers["content-type"]), /^application\/json/);
  });
});

describe("configuración de STATIC_DIR y cabeceras de producción", () => {
  it("rechaza carpetas inexistentes o sin index.html, sin mostrar la ruta", () => {
    const empty = mkdtempSync(join(tmpdir(), "dailytask-empty-"));
    for (const dir of ["/no/existe/dailytask", empty]) {
      try {
        loadConfig({ ...UNIT_DB_ENV, STATIC_DIR: dir });
        assert.fail("debía lanzar ConfigError");
      } catch (error) {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /STATIC_DIR/);
        assert.ok(!error.message.includes(dir));
      }
    }
  });

  it("en producción se envía HSTS; en desarrollo no", async () => {
    const prod = testApp({ NODE_ENV: "production", PUBLIC_ORIGIN: "https://dailytask.korikashi.uk" });
    const dev = testApp();
    const p = await prod.inject({ url: "/api/health" });
    const d = await dev.inject({ url: "/api/health" });
    await prod.close();
    await dev.close();
    assert.equal(p.headers["strict-transport-security"], "max-age=31536000");
    assert.equal(d.headers["strict-transport-security"], undefined);
  });
});
