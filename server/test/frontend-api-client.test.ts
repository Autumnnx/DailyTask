/**
 * Prueba del cliente HTTP del FRONTEND (`../../src/utils/api.ts`).
 * El frontend no tiene framework de pruebas; este archivo usa `node:test` del backend
 * y un `fetch` simulado, sin dependencias nuevas. `api.ts` no importa nada, así que
 * Node lo ejecuta directamente.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, api, errorMessage, setSessionExpiredHandler } from "../../src/utils/api.ts";

const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];

function mockFetch(response: Response | Error) {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionExpiredHandler(null);
});

describe("cliente HTTP del frontend (src/utils/api.ts)", () => {
  it("usa rutas relativas /api, cookies del mismo origen y JSON", async () => {
    mockFetch(json(201, { task: { id: "1" } }));
    const res = await api.post<{ task: { id: string } }>("/tasks", { title: "x" });
    assert.deepEqual(res, { task: { id: "1" } });
    assert.equal(calls[0]!.url, "/api/tasks");
    assert.equal(calls[0]!.init.credentials, "same-origin");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.equal(calls[0]!.init.body, JSON.stringify({ title: "x" }));
  });

  it("GET sin cuerpo no envía Content-Type", async () => {
    mockFetch(json(200, { tasks: [] }));
    await api.get("/tasks");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["Content-Type"], undefined);
    assert.equal(calls[0]!.init.body, undefined);
  });

  it("204 sin cuerpo se resuelve sin error", async () => {
    mockFetch(new Response(null, { status: 204 }));
    assert.equal(await api.delete("/tasks/1"), undefined);
  });

  it("convierte { error: { code, message, fields } } en ApiError con los datos del servidor", async () => {
    mockFetch(json(409, { error: { code: "USERNAME_TAKEN", message: "Ese nombre de usuario ya está en uso.", fields: { username: "En uso" } } }));
    const error = await api.post("/auth/register", {}).catch((e: unknown) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "USERNAME_TAKEN");
    assert.equal(error.message, "Ese nombre de usuario ya está en uso.");
    assert.deepEqual(error.fields, { username: "En uso" });
  });

  it("409 TASK_LIMIT_REACHED conserva el mensaje del servidor", async () => {
    const message = "Has alcanzado el máximo de 1000 tareas. Elimina alguna para crear una nueva.";
    mockFetch(json(409, { error: { code: "TASK_LIMIT_REACHED", message, limit: 1000 } }));
    const error = await api.post("/tasks", {}).catch((e: unknown) => e);
    assert.equal(errorMessage(error), message);
  });

  it("401 UNAUTHENTICATED avisa de sesión caducada, salvo en peticiones silenciosas", async () => {
    let expired = 0;
    setSessionExpiredHandler(() => expired++);
    mockFetch(json(401, { error: { code: "UNAUTHENTICATED", message: "Inicia sesión para continuar." } }));
    await api.get("/tasks").catch(() => undefined);
    assert.equal(expired, 1);
    mockFetch(json(401, { error: { code: "UNAUTHENTICATED", message: "Inicia sesión para continuar." } }));
    await api.get("/auth/me", { silentUnauthenticated: true }).catch(() => undefined);
    assert.equal(expired, 1, "la comprobación inicial no debe disparar el aviso");
    mockFetch(json(401, { error: { code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos." } }));
    await api.post("/auth/login", {}).catch(() => undefined);
    assert.equal(expired, 1, "credenciales incorrectas no es sesión caducada");
  });

  it("503 de la API y 5xx sin JSON (proxy sin API) → 'servicio no disponible', sin detalles internos", async () => {
    for (const response of [
      json(503, { error: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." } }),
      new Response("Internal Server Error <html>ECONNREFUSED 127.0.0.1:3000</html>", { status: 500 }),
      new Response("", { status: 502 }),
    ]) {
      mockFetch(response);
      const error = await api.get("/tasks").catch((e: unknown) => e);
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /no está disponible/);
      assert.ok(!error.message.includes("ECONNREFUSED"));
    }
  });

  it("500 INTERNAL de la API → mensaje genérico", async () => {
    mockFetch(json(500, { error: { code: "INTERNAL", message: "Ha ocurrido un error inesperado." } }));
    const error = await api.get("/tasks").catch((e: unknown) => e);
    assert.equal(errorMessage(error), "Ha ocurrido un error inesperado. Inténtalo de nuevo.");
  });

  it("error de red → NETWORK_ERROR con mensaje comprensible", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    const error = await api.get("/tasks").catch((e: unknown) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.match(error.message, /No se pudo conectar/);
  });

  it("errorMessage de un error que no es ApiError → genérico", () => {
    assert.equal(errorMessage(new Error("detalle interno")), "Ha ocurrido un error inesperado. Inténtalo de nuevo.");
  });
});
