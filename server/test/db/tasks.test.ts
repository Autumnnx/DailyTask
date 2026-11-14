import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/pool.ts";
import { createTaskWithLimit } from "../../src/tasks/repository.ts";
import { testConfig } from "../helpers.ts";
import { appDbConfig, prepareSchema, rootPool } from "./env.ts";

const ORIGIN = "http://localhost:5173";
const RELAXED = {
  RATE_LIMIT_GLOBAL_PER_MIN: "100000",
  RATE_LIMIT_LOGIN_PER_MIN: "10000",
  RATE_LIMIT_LOGIN_USER_PER_MIN: "10000",
  RATE_LIMIT_REGISTER_PER_MIN: "10000",
};

interface Session {
  id: string;
  cookie: string;
}

function makeApp(env: Record<string, string> = {}): FastifyInstance {
  return buildApp(testConfig({ ...RELAXED, ...env }), { db: createDatabase(appDbConfig()) });
}

async function signUp(app: FastifyInstance, username: string): Promise<Session> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { origin: ORIGIN },
    payload: { username, name: username, password: "000000" },
  });
  assert.equal(res.statusCode, 201, res.body);
  return { id: res.json().user.id, cookie: res.cookies.find((c) => c.name === "dt_session")!.value };
}

function api(app: FastifyInstance, who: Session | null, method: InjectOptions["method"], url: string, payload?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(who ? { cookie: `dt_session=${who.cookie}` } : {}) },
    ...(payload ? { payload } : {}),
  });
}

const valid = (extra: object = {}) => ({ title: "Entregar informe", description: "Redes", dueDate: "2026-03-01", priority: "media", status: "pendiente", ...extra });

async function create(app: FastifyInstance, who: Session, extra: object = {}) {
  const res = await api(app, who, "POST", "/api/tasks", valid(extra));
  assert.equal(res.statusCode, 201, res.body);
  return res.json().task;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Inserta n tareas directamente en MySQL (preparación rápida para las pruebas del límite). */
async function bulkInsert(userId: string, n: number): Promise<void> {
  const root = rootPool();
  try {
    for (let offset = 0; offset < n; offset += 200) {
      const size = Math.min(200, n - offset);
      const rows = Array.from({ length: size }, (_, i) => [randomUUID(), userId, `Masiva ${offset + i}`, "", "2026-01-01", "baja", "pendiente", new Date(), new Date(), null]);
      await root.query(
        "INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at, completed_at) VALUES ?",
        [rows],
      );
    }
  } finally {
    await root.end();
  }
}

async function countTasks(userId: string): Promise<number> {
  const root = rootPool();
  try {
    const [rows] = await root.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?", [userId]);
    return rows[0]!.n;
  } finally {
    await root.end();
  }
}

describe("CRUD de tareas", () => {
  const app = makeApp();
  let ana: Session;
  before(async () => {
    await prepareSchema();
    ana = await signUp(app, "ana");
  });
  after(() => app.close());

  it("1/8. crear, consultar, listar, editar y eliminar", async () => {
    const created = await api(app, ana, "POST", "/api/tasks", valid({ title: "  Estudiar  ", description: "  parcial  " }));
    assert.equal(created.statusCode, 201);
    const task = created.json().task;
    assert.match(task.id, /^[0-9a-f-]{36}$/);
    assert.equal(created.headers.location, `/api/tasks/${task.id}`);
    assert.equal(task.title, "Estudiar", "se recorta el título");
    assert.equal(task.description, "parcial");
    assert.equal(task.dueDate, "2026-03-01");
    assert.equal(task.completedAt, null);
    assert.equal(task.createdAt, task.updatedAt);
    assert.match(task.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(Object.keys(task).sort(), ["completedAt", "createdAt", "description", "dueDate", "id", "priority", "status", "title", "updatedAt"]);

    const got = await api(app, ana, "GET", `/api/tasks/${task.id}`);
    assert.equal(got.statusCode, 200);
    assert.deepEqual(got.json().task, task);

    const list = await api(app, ana, "GET", "/api/tasks");
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().tasks.some((t: { id: string }) => t.id === task.id));

    const edited = await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid({ title: "Estudiar mucho", priority: "alta", dueDate: "2026-04-15" }));
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().task.title, "Estudiar mucho");
    assert.equal(edited.json().task.priority, "alta");
    assert.equal(edited.json().task.dueDate, "2026-04-15");

    const removed = await api(app, ana, "DELETE", `/api/tasks/${task.id}`);
    assert.equal(removed.statusCode, 204);
    assert.equal((await api(app, ana, "GET", `/api/tasks/${task.id}`)).statusCode, 404);
    assert.equal((await api(app, ana, "DELETE", `/api/tasks/${task.id}`)).statusCode, 404);
  });

  it("la descripción es opcional y las fechas pasadas se aceptan (como en el frontend)", async () => {
    const { description: _d, ...withoutDescription } = valid({ dueDate: "2020-01-15" });
    const res = await api(app, ana, "POST", "/api/tasks", withoutDescription);
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().task.description, "");
    assert.equal(res.json().task.dueDate, "2020-01-15");
  });

  it("2. sin sesión → 401 (también con sesión revocada)", async () => {
    assert.equal((await api(app, null, "GET", "/api/tasks")).statusCode, 401);
    assert.equal((await api(app, null, "POST", "/api/tasks", valid())).statusCode, 401);
    const temp = await signUp(app, "temporal");
    await api(app, temp, "POST", "/api/auth/logout");
    assert.equal((await api(app, temp, "GET", "/api/tasks")).statusCode, 401);
  });

  it("9. rechaza títulos y descripciones inválidos con mensajes por campo", async () => {
    for (const [extra, field] of [
      [{ title: "ab" }, "title"],
      [{ title: "   abc   ".replace("abc", "a") }, "title"],
      [{ title: "x".repeat(81) }, "title"],
      [{ description: "d".repeat(401) }, "description"],
    ] as const) {
      const res = await api(app, ana, "POST", "/api/tasks", valid(extra));
      assert.equal(res.statusCode, 400, JSON.stringify(extra));
      assert.equal(res.json().error.code, "VALIDATION_ERROR");
      assert.ok(res.json().error.fields[field], JSON.stringify(res.json()));
    }
    assert.equal((await api(app, ana, "POST", "/api/tasks", valid({ title: "x".repeat(80), description: "d".repeat(400) }))).statusCode, 201);
  });

  it("10. rechaza fechas inexistentes o con formato incorrecto", async () => {
    for (const dueDate of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-04-31", "26-03-01", "2026/03/01", ""]) {
      const res = await api(app, ana, "POST", "/api/tasks", valid({ dueDate }));
      assert.equal(res.statusCode, 400, dueDate);
      assert.ok(res.json().error.fields.dueDate, dueDate);
    }
    assert.equal((await api(app, ana, "POST", "/api/tasks", valid({ dueDate: "2028-02-29" }))).statusCode, 201);
  });

  it("11. rechaza prioridades y estados inválidos (crear, editar y PATCH)", async () => {
    const task = await create(app, ana);
    for (const extra of [{ priority: "urgente" }, { status: "hecha" }, { priority: "ALTA" }]) {
      assert.equal((await api(app, ana, "POST", "/api/tasks", valid(extra))).statusCode, 400, JSON.stringify(extra));
      assert.equal((await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid(extra))).statusCode, 400);
    }
    assert.equal((await api(app, ana, "PATCH", `/api/tasks/${task.id}/status`, { status: "todas" })).statusCode, 400);
    assert.equal((await api(app, ana, "PATCH", `/api/tasks/${task.id}/status`, {})).statusCode, 400);
  });

  it("24. rechaza propiedades adicionales (userId, id, createdAt, completedAt…)", async () => {
    const task = await create(app, ana);
    for (const extra of [{ userId: randomUUID() }, { id: randomUUID() }, { createdAt: "2020-01-01T00:00:00.000Z" }, { completedAt: null }]) {
      const res = await api(app, ana, "POST", "/api/tasks", valid(extra));
      assert.equal(res.statusCode, 400, JSON.stringify(extra));
      assert.equal(res.json().error.fields[Object.keys(extra)[0]!], "Este campo no está permitido.");
      assert.equal((await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid(extra))).statusCode, 400);
    }
    assert.equal((await api(app, ana, "PATCH", `/api/tasks/${task.id}/status`, { status: "completada", completedAt: "x" })).statusCode, 400);
    assert.equal((await api(app, ana, "GET", "/api/tasks?userId=x")).statusCode, 400);
  });

  it("ids con formato inválido → 404", async () => {
    assert.equal((await api(app, ana, "GET", "/api/tasks/no-es-uuid")).statusCode, 404);
    assert.equal((await api(app, ana, "PATCH", "/api/tasks/123/status", { status: "completada" })).statusCode, 404);
  });

  it("verificación de Origin también en tareas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { origin: "https://evil.example", cookie: `dt_session=${ana.cookie}` },
      payload: valid(),
    });
    assert.equal(res.statusCode, 403);
  });
});

describe("estados y completedAt (reglas del frontend)", () => {
  const app = makeApp();
  let ana: Session;
  before(async () => {
    await prepareSchema();
    ana = await signUp(app, "estados");
  });
  after(() => app.close());

  const patch = (id: string, status: string) => api(app, ana, "PATCH", `/api/tasks/${id}/status`, { status });

  it("12. cambia entre los tres estados", async () => {
    const task = await create(app, ana);
    for (const status of ["en_progreso", "completada", "pendiente", "en_progreso"]) {
      const res = await patch(task.id, status);
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().task.status, status);
    }
  });

  it("13. completar y reabrir con PATCH /status (botón check del frontend)", async () => {
    const task = await create(app, ana);
    const done = (await patch(task.id, "completada")).json().task;
    assert.equal(done.status, "completada");
    assert.ok(done.completedAt);
    const reopened = (await patch(task.id, "pendiente")).json().task;
    assert.equal(reopened.status, "pendiente");
    assert.equal(reopened.completedAt, null);
  });

  it("14a. crear como completada fija completedAt = createdAt", async () => {
    const task = await create(app, ana, { status: "completada" });
    assert.equal(task.completedAt, task.createdAt);
  });

  it("14b. editar (PUT) conserva completedAt si sigue completada; lo fija al pasar a completada; lo anula al salir", async () => {
    const task = await create(app, ana);
    await sleep(5);
    const completed = (await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid({ status: "completada" }))).json().task;
    assert.ok(completed.completedAt);
    await sleep(5);
    const editedStillDone = (await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid({ status: "completada", title: "Otro título" }))).json().task;
    assert.equal(editedStillDone.completedAt, completed.completedAt, "updateTask conserva completedAt");
    const reopened = (await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid({ status: "en_progreso" }))).json().task;
    assert.equal(reopened.completedAt, null);
  });

  it("14c. PATCH /status a completada REINICIA completedAt aunque ya estuviera completada (diferencia con PUT)", async () => {
    const task = await create(app, ana, { status: "completada" });
    await sleep(5);
    const again = (await patch(task.id, "completada")).json().task;
    assert.notEqual(again.completedAt, task.completedAt, "changeStatus no conserva el valor anterior");
    assert.ok(new Date(again.completedAt) > new Date(task.completedAt));
  });

  it("15. updatedAt cambia en cada modificación y createdAt no", async () => {
    const task = await create(app, ana);
    await sleep(5);
    const edited = (await api(app, ana, "PUT", `/api/tasks/${task.id}`, valid({ title: "Cambio" }))).json().task;
    assert.ok(new Date(edited.updatedAt) > new Date(task.updatedAt));
    assert.equal(edited.createdAt, task.createdAt);
    await sleep(5);
    const patched = (await patch(task.id, "en_progreso")).json().task;
    assert.ok(new Date(patched.updatedAt) > new Date(edited.updatedAt));
    assert.equal(patched.createdAt, task.createdAt);
  });
});

describe("aislamiento entre usuarios", () => {
  const app = makeApp();
  let ana: Session;
  let beto: Session;
  let tareaAna: { id: string; title: string; status: string };
  before(async () => {
    await prepareSchema();
    ana = await signUp(app, "ana.a");
    beto = await signUp(app, "beto.b");
    tareaAna = await create(app, ana, { title: "Privada de Ana" });
    await create(app, beto, { title: "Privada de Beto" });
  });
  after(() => app.close());

  it("3. A consulta y lista solo sus tareas", async () => {
    const list = (await api(app, ana, "GET", "/api/tasks")).json().tasks;
    assert.deepEqual(list.map((t: { title: string }) => t.title), ["Privada de Ana"]);
    assert.equal((await api(app, ana, "GET", `/api/tasks/${tareaAna.id}`)).statusCode, 200);
  });

  it("4. B no puede consultar la tarea de A (404) ni verla en su lista", async () => {
    const res = await api(app, beto, "GET", `/api/tasks/${tareaAna.id}`);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: { code: "NOT_FOUND", message: "Tarea no encontrada." } });
    const list = (await api(app, beto, "GET", "/api/tasks?q=Ana")).json().tasks;
    assert.equal(list.length, 0);
  });

  it("5–7. B no puede editar, cambiar el estado ni eliminar la tarea de A; la tarea queda intacta", async () => {
    assert.equal((await api(app, beto, "PUT", `/api/tasks/${tareaAna.id}`, valid({ title: "Hackeada" }))).statusCode, 404);
    assert.equal((await api(app, beto, "PATCH", `/api/tasks/${tareaAna.id}/status`, { status: "completada" })).statusCode, 404);
    assert.equal((await api(app, beto, "DELETE", `/api/tasks/${tareaAna.id}`)).statusCode, 404);
    const still = (await api(app, ana, "GET", `/api/tasks/${tareaAna.id}`)).json().task;
    assert.equal(still.title, "Privada de Ana");
    assert.equal(still.status, "pendiente");
  });

  it("una tarea inexistente da la misma respuesta 404 que una ajena", async () => {
    const missing = await api(app, beto, "GET", `/api/tasks/${randomUUID()}`);
    const foreign = await api(app, beto, "GET", `/api/tasks/${tareaAna.id}`);
    assert.equal(missing.statusCode, foreign.statusCode);
    assert.equal(missing.body, foreign.body);
  });
});

describe("búsqueda, filtros y orden", () => {
  const app = makeApp();
  let u: Session;
  before(async () => {
    await prepareSchema();
    u = await signUp(app, "buscador");
    await create(app, u, { title: "Canción de cuna", description: "", dueDate: "2026-05-01", priority: "baja" });
    await create(app, u, { title: "Informe de REDES", description: "entregar al profesor", dueDate: "2026-03-01", priority: "media", status: "en_progreso" });
    await create(app, u, { title: "Descuento del 50%", description: "usar cupón", dueDate: "2026-03-01", priority: "alta" });
    await create(app, u, { title: "archivo_final", description: "ruta C:\\docs", dueDate: "2026-02-01", priority: "media", status: "completada" });
    await create(app, u, { title: "Año nuevo", description: "Planificar", dueDate: "2026-12-31", priority: "alta" });
  });
  after(() => app.close());

  const titles = async (query: string) =>
    (await api(app, u, "GET", `/api/tasks${query}`)).json().tasks.map((t: { title: string }) => t.title);

  it("16. ignora mayúsculas y tildes en título y descripción", async () => {
    assert.deepEqual(await titles("?q=CANCION"), ["Canción de cuna"]);
    assert.deepEqual(await titles("?q=redes"), ["Informe de REDES"]);
    assert.deepEqual(await titles("?q=PROFESÓR"), ["Informe de REDES"]);
    assert.deepEqual(await titles("?q=cupon"), ["Descuento del 50%"]);
    assert.deepEqual(await titles("?q=ano"), ["Año nuevo"], "ñ equivale a n, como la normalización NFD del frontend");
    assert.deepEqual(await titles("?q=%20%20"), (await titles("")), "q vacío tras recortar = sin filtro");
  });

  it("17. %, _ y \\ se tratan literalmente", async () => {
    assert.deepEqual(await titles(`?q=${encodeURIComponent("50%")}`), ["Descuento del 50%"]);
    assert.deepEqual(await titles(`?q=${encodeURIComponent("%")}`), ["Descuento del 50%"]);
    assert.deepEqual(await titles(`?q=${encodeURIComponent("_")}`), ["archivo_final"]);
    assert.deepEqual(await titles(`?q=${encodeURIComponent("o_f")}`), ["archivo_final"]);
    assert.deepEqual(await titles(`?q=${encodeURIComponent("a_c")}`), [], "_ no actúa como comodín");
    assert.deepEqual(await titles(`?q=${encodeURIComponent("C:\\docs")}`), ["archivo_final"]);
  });

  it("18. filtros por estado y prioridad, combinables con la búsqueda", async () => {
    assert.deepEqual(await titles("?status=completada"), ["archivo_final"]);
    assert.deepEqual(await titles("?status=en_progreso"), ["Informe de REDES"]);
    assert.deepEqual((await titles("?priority=alta")).sort(), ["Año nuevo", "Descuento del 50%"]);
    assert.deepEqual(await titles("?priority=alta&q=nuevo"), ["Año nuevo"]);
    assert.deepEqual(await titles("?priority=baja&status=completada"), []);
    assert.equal((await api(app, u, "GET", "/api/tasks?priority=urgente")).statusCode, 400);
    assert.equal((await api(app, u, "GET", `/api/tasks?q=${"x".repeat(101)}`)).statusCode, 400);
  });

  it("19. orden: vencimiento ascendente y, a igual fecha, prioridad alta → baja", async () => {
    assert.deepEqual(await titles(""), ["archivo_final", "Descuento del 50%", "Informe de REDES", "Canción de cuna", "Año nuevo"]);
  });
});

describe("límite de tareas por usuario", () => {
  const app = makeApp();
  before(prepareSchema);
  after(() => app.close());

  it("20–21. la tarea 1.000 se crea y la 1.001 se rechaza con 409 TASK_LIMIT_REACHED", async () => {
    const u = await signUp(app, "limite1000");
    await bulkInsert(u.id, 999);
    const thousandth = await api(app, u, "POST", "/api/tasks", valid({ title: "Tarea mil" }));
    assert.equal(thousandth.statusCode, 201);
    assert.equal(await countTasks(u.id), 1000);

    const extra = await api(app, u, "POST", "/api/tasks", valid({ title: "Tarea mil uno" }));
    assert.equal(extra.statusCode, 409);
    assert.deepEqual(extra.json(), {
      error: {
        code: "TASK_LIMIT_REACHED",
        message: "Has alcanzado el máximo de 1000 tareas. Elimina alguna para crear una nueva.",
        limit: 1000,
      },
    });
    assert.equal(await countTasks(u.id), 1000);

    // Con el límite alcanzado, listar, editar y cambiar estado siguen funcionando; no se trunca nada.
    const list = (await api(app, u, "GET", "/api/tasks")).json().tasks;
    assert.equal(list.length, 1000);
    const id = thousandth.json().task.id;
    assert.equal((await api(app, u, "PUT", `/api/tasks/${id}`, valid({ title: "Editada" }))).statusCode, 200);
    assert.equal((await api(app, u, "PATCH", `/api/tasks/${id}/status`, { status: "completada" })).statusCode, 200);

    // 22. tras eliminar una, se puede volver a crear
    assert.equal((await api(app, u, "DELETE", `/api/tasks/${id}`)).statusCode, 204);
    assert.equal((await api(app, u, "POST", "/api/tasks", valid({ title: "Otra vez mil" }))).statusCode, 201);
    assert.equal(await countTasks(u.id), 1000);
    assert.equal((await api(app, u, "POST", "/api/tasks", valid())).statusCode, 409);
  });

  it("el límite de un usuario no afecta a otro", async () => {
    const otro = await signUp(app, "otro.usuario");
    assert.equal((await api(app, otro, "POST", "/api/tasks", valid())).statusCode, 201);
  });

  it("23. 30 creaciones simultáneas con 990 tareas: exactamente 10 se crean y el total es 1.000", async () => {
    const u = await signUp(app, "concurrente");
    await bulkInsert(u.id, 990);
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) => api(app, u, "POST", "/api/tasks", valid({ title: `Simultánea ${i}` }))),
    );
    const created = responses.filter((r) => r.statusCode === 201).length;
    const rejected = responses.filter((r) => r.statusCode === 409).length;
    assert.equal(created, 10, `creadas: ${created}`);
    assert.equal(rejected, 20, `rechazadas: ${rejected}; otros: ${responses.map((r) => r.statusCode).join(",")}`);
    assert.equal(await countTasks(u.id), 1000);
  });

  it("concurrencia con dos instancias de la API (dos pools) contra la misma base", async () => {
    const second = makeApp();
    const u = await signUp(app, "dos.instancias");
    await bulkInsert(u.id, 995);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => api(i % 2 ? app : second, u, "POST", "/api/tasks", valid({ title: `Doble ${i}` }))),
    );
    await second.close();
    assert.equal(responses.filter((r) => r.statusCode === 201).length, 5);
    assert.equal(await countTasks(u.id), 1000);
  });

  it("23b. determinista: la creación espera al bloqueo del usuario y vuelve a contar después", async () => {
    // Otra transacción bloquea la fila del usuario y añade la tarea que completa el límite.
    // createTaskWithLimit debe esperar a que termine y entonces rechazar (sin el bloqueo, contaría 999 y crearía la 1.001).
    const u = await signUp(app, "bloqueo");
    await bulkInsert(u.id, 999);
    const holder = await app.db.pool.getConnection();
    try {
      await holder.beginTransaction();
      await holder.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [u.id]);

      let settled = false;
      const pending = createTaskWithLimit(app.db.pool, u.id, randomUUID(), valid() as never, new Date(), 1000).finally(() => {
        settled = true;
      });
      await sleep(300);
      assert.equal(settled, false, "la creación debe esperar mientras otro tiene bloqueado al usuario");

      await holder.execute(
        "INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at) VALUES (?, ?, 'Del bloqueo', '', '2026-01-01', 'baja', 'pendiente', ?, ?)",
        [randomUUID(), u.id, new Date(), new Date()],
      );
      await holder.commit();
      const result = await pending;
      assert.deepEqual(result, { ok: false, reason: "limit" });
      assert.equal(await countTasks(u.id), 1000);
    } finally {
      holder.release();
    }
  });

  it("el máximo es configurable (MAX_TASKS_PER_USER)", async () => {
    const small = makeApp({ MAX_TASKS_PER_USER: "2" });
    const u = await signUp(small, "pequeno");
    assert.equal((await api(small, u, "POST", "/api/tasks", valid())).statusCode, 201);
    assert.equal((await api(small, u, "POST", "/api/tasks", valid())).statusCode, 201);
    const third = await api(small, u, "POST", "/api/tasks", valid());
    await small.close();
    assert.equal(third.statusCode, 409);
    assert.equal(third.json().error.limit, 2);
  });
});

describe("25. MySQL no disponible", () => {
  it("las rutas de tareas responden 503 UNAVAILABLE sin detalles internos", async () => {
    const down = createDatabase({ ...appDbConfig(), port: 1, connectTimeoutMs: 1000 });
    const app = buildApp(testConfig(RELAXED), { db: down });
    const fake: Session = { id: randomUUID(), cookie: "a".repeat(43) };
    const responses = [
      await api(app, fake, "GET", "/api/tasks"),
      await api(app, fake, "POST", "/api/tasks", valid()),
      await api(app, fake, "DELETE", `/api/tasks/${randomUUID()}`),
    ];
    await app.close();
    for (const res of responses) {
      assert.equal(res.statusCode, 503, res.body);
      assert.deepEqual(res.json(), { error: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." } });
    }
  });

  it("si MySQL cae a mitad de la creación (tras autenticar), también 503", async () => {
    await prepareSchema();
    const app = makeApp();
    const u = await signUp(app, "caida");
    // Se cierra el pool de la app: la sesión ya no puede resolverse ni crear tareas.
    await app.db.close();
    const res = await api(app, u, "POST", "/api/tasks", valid());
    await app.close();
    assert.equal(res.statusCode, 503, res.body);
  });
});
