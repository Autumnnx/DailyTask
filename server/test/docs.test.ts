import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { CONTENT_SECURITY_POLICY } from "../src/app.ts";
import { openApiDocument } from "../src/docs/openapi.ts";
import { DOCS_CONTENT_SECURITY_POLICY } from "../src/docs/routes.ts";
import { PRIORITIES, STATUSES } from "../src/tasks/validation.ts";
import { testApp } from "./helpers.ts";

const spec = openApiDocument as unknown as {
  openapi: string;
  paths: Record<string, Record<string, { security?: object[]; operationId?: string; tags?: string[]; responses?: object }>>;
  components: Record<string, Record<string, unknown>>;
  tags: { name: string }[];
};
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const NOT_API = (url: string) => url === "/openapi.json" || url.startsWith("/api-docs") || url === "/*";

function documentedOperations(): string[] {
  const ops: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) if (HTTP_METHODS.has(method)) ops.push(`${method.toUpperCase()} ${path}`);
  }
  return ops.sort();
}

describe("especificación OpenAPI fiel al código", () => {
  let routes: string[] = [];

  before(async () => {
    const app = testApp();
    const found: string[] = [];
    app.addHook("onRoute", (route) => {
      for (const method of ([] as string[]).concat(route.method as string)) {
        if (method === "HEAD" || NOT_API(route.url)) continue;
        found.push(`${method} ${route.url.replace(/:(\w+)/g, "{$1}")}`);
      }
    });
    await app.ready();
    await app.close();
    routes = found.sort();
  });

  it("documenta exactamente las rutas registradas en Fastify (11)", () => {
    assert.equal(routes.length, 11, routes.join("\n"));
    assert.deepEqual(documentedOperations(), routes);
  });

  it("marca con sesión exactamente las rutas que la exigen", () => {
    const requiresSession = (sec?: object[]) => Array.isArray(sec) && sec.length > 0 && !sec.some((s) => Object.keys(s).length === 0);
    const protectedOps = documentedOperations().filter((op) => {
      const [method, path] = op.split(" ");
      return requiresSession(spec.paths[path!]![method!.toLowerCase()]!.security);
    });
    assert.deepEqual(protectedOps, [
      "DELETE /api/tasks/{id}",
      "GET /api/auth/me",
      "GET /api/tasks",
      "GET /api/tasks/{id}",
      "PATCH /api/tasks/{id}/status",
      "POST /api/tasks",
      "PUT /api/tasks/{id}",
    ]);
  });

  it("las rutas marcadas con sesión responden 401 sin cookie", async () => {
    const app = testApp();
    const id = "00000000-0000-4000-8000-000000000000";
    const checks: [string, string][] = [
      ["GET", "/api/auth/me"],
      ["GET", "/api/tasks"],
      ["POST", "/api/tasks"],
      ["GET", `/api/tasks/${id}`],
      ["PUT", `/api/tasks/${id}`],
      ["PATCH", `/api/tasks/${id}/status`],
      ["DELETE", `/api/tasks/${id}`],
    ];
    for (const [method, url] of checks) {
      const res = await app.inject({ method: method as "GET", url, headers: { origin: "http://localhost:5173" }, ...(method === "GET" || method === "DELETE" ? {} : { payload: {} }) });
      assert.equal(res.statusCode, 401, `${method} ${url}`);
    }
    await app.close();
  });

  it("los enums documentados coinciden con los del código", () => {
    const schemas = spec.components.schemas as Record<string, { enum?: string[] }>;
    assert.deepEqual(schemas.Priority!.enum, [...PRIORITIES]);
    assert.deepEqual(schemas.Status!.enum, [...STATUSES]);
  });

  it("es OpenAPI 3.1 coherente: operationId únicos, etiquetas existentes y todas las $ref resuelven", () => {
    assert.equal(spec.openapi, "3.1.0");
    const ids = new Set<string>();
    const tagNames = new Set(spec.tags.map((t) => t.name));
    for (const item of Object.values(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (!HTTP_METHODS.has(method)) continue;
        assert.ok(op.operationId && !ids.has(op.operationId), `operationId repetido o ausente: ${op.operationId}`);
        ids.add(op.operationId!);
        assert.ok(op.tags?.every((t) => tagNames.has(t)));
        assert.ok(op.responses && Object.keys(op.responses).length > 0);
      }
    }
    const refs = JSON.stringify(spec).match(/"\$ref":"#\/[^"]+"/g) ?? [];
    assert.ok(refs.length > 0);
    for (const raw of refs) {
      const path = raw.slice(9, -1).split("/").slice(1);
      let node: unknown = spec;
      for (const key of path) node = (node as Record<string, unknown>)?.[key];
      assert.ok(node !== undefined, `referencia rota: ${raw}`);
    }
  });

  it("no contiene datos internos (conexión, rutas del servidor, infraestructura)", () => {
    const text = JSON.stringify(spec).toLowerCase();
    for (const fragment of ["192.168", "100.84", "mysql", "password_hash", "/srv", "/opt", "/home", "db_", "tailscale", "8088", "nixos", "localhost:3000"]) {
      assert.ok(!text.includes(fragment), `la especificación contiene "${fragment}"`);
    }
  });
});

describe("rutas de documentación", () => {
  let app: FastifyInstance;
  before(() => {
    app = testApp();
  });
  after(() => app.close());

  it("/openapi.json sirve la especificación como JSON con la CSP general", async () => {
    const res = await app.inject({ url: "/openapi.json" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /^application\/json/);
    assert.deepEqual(res.json(), JSON.parse(JSON.stringify(openApiDocument)));
    assert.equal(res.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
    assert.equal(res.headers["access-control-allow-origin"], undefined, "sin CORS");
  });

  it("/api-docs redirige con una URL relativa (correcta detrás del proxy HTTPS)", async () => {
    const res = await app.inject({ url: "/api-docs", headers: { host: "dailytask.korikashi.uk" } });
    assert.equal(res.statusCode, 301);
    assert.equal(res.headers.location, "/api-docs/");
  });

  it("/api-docs/ sirve la página sin scripts en línea; la única excepción de CSP son los estilos", async () => {
    const a = await app.inject({ url: "/api-docs/" });
    assert.equal(a.statusCode, 200);
    assert.match(String(a.headers["content-type"]), /^text\/html/);
    const csp = String(a.headers["content-security-policy"]);
    assert.equal(csp, DOCS_CONTENT_SECURITY_POLICY);
    // Scripts: solo 'self', sin 'unsafe-inline' ni 'unsafe-eval'. Estilos: 'unsafe-inline' (Scalar).
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /style-src 'self' 'unsafe-inline';/);
    assert.ok(!csp.includes("unsafe-eval") && !csp.includes("nonce-"));
    assert.equal(csp.match(/unsafe-inline/g)?.length, 1);
    // Fuera de la excepción de estilos, la política coincide con la general.
    const strip = (p: string) => p.split("; ").filter((d) => !d.startsWith("style-src") && !d.startsWith("font-src") && !d.startsWith("form-action"));
    assert.deepEqual(strip(csp), strip(CONTENT_SECURITY_POLICY));
    for (const tag of a.body.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? []) {
      const executable = !/type="application\/json"/.test(tag);
      const inlineCode = tag.replace(/<script[^>]*>|<\/script>/g, "").trim();
      assert.ok(!executable || (/src="/.test(tag) && inlineCode === ""), `script en línea: ${tag.slice(0, 80)}`);
    }
    assert.equal(a.headers["x-frame-options"], "DENY");
    assert.equal(a.headers["cache-control"], "no-cache");
  });

  it("la configuración de Scalar desactiva el cliente, los botones de prueba y servicios externos", async () => {
    const res = await app.inject({ url: "/api-docs/" });
    const raw = /data-configuration="([^"]*)"/.exec(res.body)?.[1] ?? "";
    const config = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    assert.equal(config.url, "/openapi.json");
    assert.equal(config.hideTestRequestButton, true);
    assert.equal(config.hideClientButton, true);
    assert.equal(config.telemetry, false);
    assert.equal(config.withDefaultFonts, false);
    assert.equal(config.showDeveloperTools, "never");
    assert.equal(config.forceDarkModeState, "dark");
    assert.deepEqual(config.agent, { disabled: true });
  });

  it("el bundle de Scalar y el tema se sirven desde el propio servidor", async () => {
    const js = await app.inject({ url: "/api-docs/js/scalar.js" });
    assert.equal(js.statusCode, 200);
    assert.match(String(js.headers["content-type"]), /javascript/);
    assert.equal(js.headers["cache-control"], "public, max-age=86400");
    assert.ok(js.body.length > 100_000);
    const css = await app.inject({ url: "/api-docs/theme.css" });
    assert.equal(css.statusCode, 200);
    assert.match(String(css.headers["content-type"]), /^text\/css/);
  });

  it("el resto de la aplicación conserva la CSP general", async () => {
    const res = await app.inject({ url: "/api/health" });
    assert.equal(res.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
  });
});

describe("documentación junto al frontend servido (STATIC_DIR)", () => {
  it("/api-docs/ y /openapi.json no caen en el fallback del SPA", async () => {
    const dist = join(mkdtempSync(join(tmpdir(), "dailytask-docs-")), "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>SPA</title>");
    const app = testApp({ STATIC_DIR: dist });
    const docs = await app.inject({ url: "/api-docs/" });
    const spec = await app.inject({ url: "/openapi.json" });
    const page = await app.inject({ url: "/registro" });
    await app.close();
    assert.ok(docs.body.includes("api-reference") && !docs.body.includes("<title>SPA</title>"));
    assert.match(String(spec.headers["content-type"]), /^application\/json/);
    assert.ok(page.body.includes("<title>SPA</title>"));
  });
});
