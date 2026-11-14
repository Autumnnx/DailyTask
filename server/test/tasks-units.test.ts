import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeLike, isValidCalendarDate, validateTaskInput } from "../src/tasks/validation.ts";
import { testApp } from "./helpers.ts";

describe("validación de tareas", () => {
  it("dueDate: solo fechas de calendario reales en formato YYYY-MM-DD", () => {
    for (const ok of ["2026-03-01", "2024-02-29", "2026-12-31", "1970-01-01", "9999-12-31", "2020-01-15"]) {
      assert.ok(isValidCalendarDate(ok), ok);
    }
    for (const ko of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-3-1", "01-03-2026", "1969-12-31", "", "2026-03-01T00:00"]) {
      assert.ok(!isValidCalendarDate(ko), ko);
    }
  });

  it("título 3–80 y descripción ≤ 400 tras recortar; mensajes como en el frontend", () => {
    const base = { dueDate: "2026-03-01", priority: "media" as const, status: "pendiente" as const };
    assert.equal(validateTaskInput({ ...base, title: "  ab  " }).fields.title, "El título necesita al menos 3 caracteres.");
    assert.equal(validateTaskInput({ ...base, title: "x".repeat(81) }).fields.title, "El título no puede superar 80 caracteres.");
    assert.ok(validateTaskInput({ ...base, title: "Tarea", description: "d".repeat(401) }).fields.description);
    const ok = validateTaskInput({ ...base, title: "  Tarea  ", description: "  nota  " });
    assert.deepEqual(ok.fields, {});
    assert.equal(ok.value.title, "Tarea");
    assert.equal(ok.value.description, "nota");
    assert.equal(validateTaskInput({ ...base, title: "Sin descripción" }).value.description, "");
  });

  it("escapa los comodines de LIKE", () => {
    assert.equal(escapeLike("50% _a! b\\c"), "50!% !_a!! b\\c");
  });
});

describe("rutas de tareas sin sesión", () => {
  it("todas responden 401 UNAUTHENTICATED", async () => {
    const app = testApp();
    const origin = { origin: "http://localhost:5173" };
    const id = "00000000-0000-4000-8000-000000000000";
    const requests = [
      { method: "GET" as const, url: "/api/tasks" },
      { method: "POST" as const, url: "/api/tasks", headers: origin, payload: {} },
      { method: "GET" as const, url: `/api/tasks/${id}` },
      { method: "PUT" as const, url: `/api/tasks/${id}`, headers: origin, payload: {} },
      { method: "PATCH" as const, url: `/api/tasks/${id}/status`, headers: origin, payload: {} },
      { method: "DELETE" as const, url: `/api/tasks/${id}`, headers: origin },
    ];
    for (const req of requests) {
      const res = await app.inject(req);
      assert.equal(res.statusCode, 401, `${req.method} ${req.url}`);
      assert.equal(res.json().error.code, "UNAUTHENTICATED");
    }
    await app.close();
  });
});
