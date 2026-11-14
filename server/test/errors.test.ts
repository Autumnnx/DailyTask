import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppError } from "../src/http/errors.ts";
import { testApp } from "./helpers.ts";

describe("manejo centralizado de errores", () => {
  const app = testApp({ BODY_LIMIT_BYTES: "1024" });

  before(async () => {
    // Rutas solo de prueba, registradas sobre la app real antes de inicializarla.
    app.get("/__test/app-error", async () => {
      throw new AppError(409, "USERNAME_TAKEN", "Ese nombre de usuario ya está en uso.");
    });
    app.get("/__test/app-error-fields", async () => {
      throw new AppError(400, "VALIDATION_ERROR", "Revisa los campos marcados.", { title: "Muy corto." });
    });
    app.get("/__test/crash", async () => {
      throw new Error("detalle interno: password=hunter2 en db.example");
    });
    app.post(
      "/__test/echo",
      {
        schema: {
          body: {
            type: "object",
            properties: { title: { type: "string", minLength: 3 }, count: { type: "integer" } },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      async (request) => request.body,
    );
    await app.ready();
  });

  after(() => app.close());

  it("serializa AppError con su código y estado", async () => {
    const res = await app.inject({ method: "GET", url: "/__test/app-error" });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), {
      error: { code: "USERNAME_TAKEN", message: "Ese nombre de usuario ya está en uso." },
    });
  });

  it("incluye fields cuando AppError los trae", async () => {
    const res = await app.inject({ method: "GET", url: "/__test/app-error-fields" });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().error.fields, { title: "Muy corto." });
  });

  it("oculta los detalles de errores inesperados (500 genérico)", async () => {
    const res = await app.inject({ method: "GET", url: "/__test/crash" });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json(), { error: { code: "INTERNAL", message: "Ha ocurrido un error inesperado." } });
    assert.ok(!res.body.includes("hunter2"));
    assert.ok(!res.body.includes("stack"));
  });

  it("convierte errores de validación en VALIDATION_ERROR con fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/__test/echo",
      payload: { count: "x", extra: true },
    });
    assert.equal(res.statusCode, 400);
    const { error } = res.json();
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.ok(error.fields, "debe incluir fields");
  });

  it("rechaza propiedades no permitidas", async () => {
    const res = await app.inject({ method: "POST", url: "/__test/echo", payload: { title: "Hola", userId: "x" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.fields.userId, "Este campo no está permitido.");
  });

  it("no convierte tipos implícitamente", async () => {
    const res = await app.inject({ method: "POST", url: "/__test/echo", payload: { title: "Hola", count: "2" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.fields.count, "Valor no válido.");
  });

  it("señala campos obligatorios ausentes", async () => {
    const res = await app.inject({ method: "POST", url: "/__test/echo", payload: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.fields.title, "Este campo es obligatorio.");
  });

  it("acepta un cuerpo válido", async () => {
    const res = await app.inject({ method: "POST", url: "/__test/echo", payload: { title: "Hola", count: 2 } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { title: "Hola", count: 2 });
  });

  it("devuelve 413 si el cuerpo supera el límite", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/__test/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ title: "x".repeat(2048) }),
    });
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error.code, "PAYLOAD_TOO_LARGE");
  });

  it("devuelve 415 si el cuerpo no es JSON (text/plain incluido)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/__test/echo",
      headers: { "content-type": "text/plain" },
      payload: "title=Hola",
    });
    assert.equal(res.statusCode, 415);
    assert.equal(res.json().error.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("devuelve 400 genérico ante JSON mal formado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/__test/echo",
      headers: { "content-type": "application/json" },
      payload: '{"title": ',
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, "BAD_REQUEST");
  });
});
