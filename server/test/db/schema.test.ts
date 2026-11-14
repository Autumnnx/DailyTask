import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { createDatabase, type Database } from "../../src/db/pool.ts";
import { checkSchema, ensureSchema, existingTables } from "../../src/db/schema.ts";
import { DatabaseNotReadyError, verifyDatabase } from "../../src/db/verify.ts";
import { appDbConfig, initDbConfig, resetTestDatabase, rootPool } from "./env.ts";

const NOW = new Date("2026-11-13T10:00:00.000Z");

async function init(db: Database) {
  const conn = await db.pool.getConnection();
  try {
    return await ensureSchema(conn);
  } finally {
    conn.release();
  }
}

async function insertUser(db: Database, username = `user${Date.now() % 100000}`) {
  const id = randomUUID();
  await db.pool.execute(
    "INSERT INTO users (id, username, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, username, "Usuario", "$argon2id$v=19$m=19456,t=2,p=1$x$y", NOW, NOW],
  );
  return id;
}

async function insertTask(db: Database, userId: string, extra: { status?: string; completedAt?: Date | null; title?: string; priority?: string } = {}) {
  const id = randomUUID();
  await db.pool.execute(
    `INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, '', '2026-03-01', ?, ?, ?, ?, ?)`,
    [id, userId, extra.title ?? "Tarea", extra.priority ?? "media", extra.status ?? "pendiente", NOW, NOW, extra.completedAt ?? null],
  );
  return id;
}

async function count(db: Database, table: string): Promise<number> {
  const [rows] = await db.pool.query<(RowDataPacket & { n: number })[]>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]!.n;
}

describe("inicialización del esquema", () => {
  const initDb = createDatabase(initDbConfig());
  const appDb = createDatabase(appDbConfig());
  before(resetTestDatabase);
  after(async () => {
    await initDb.close();
    await appDb.close();
  });

  it("crea las tres tablas desde cero y el esquema coincide", async () => {
    const result = await init(initDb);
    assert.deepEqual(result.created, ["users", "tasks", "sessions"]);
    assert.deepEqual(result.problems, []);
    assert.deepEqual((await existingTables(appDb.pool)).sort(), ["sessions", "tasks", "users"]);
  });

  it("el usuario de la aplicación puede verificar el esquema y la API arrancaría", async () => {
    assert.deepEqual(await checkSchema(appDb.pool), []);
    await verifyDatabase(appDb);
  });

  it("una segunda inicialización no recrea tablas ni borra datos", async () => {
    const userId = await insertUser(appDb, "persistente");
    await insertTask(appDb, userId);
    const again = await init(initDb);
    assert.deepEqual(again.created, []);
    assert.deepEqual(again.problems, []);
    assert.equal(await count(appDb, "users"), 1);
    assert.equal(await count(appDb, "tasks"), 1);
  });

  it("si solo falta una tabla, crea únicamente esa", async () => {
    const root = rootPool();
    await root.query("DROP TABLE sessions");
    await root.end();
    const result = await init(initDb);
    assert.deepEqual(result.created, ["sessions"]);
    assert.deepEqual(result.problems, []);
    assert.equal(await count(appDb, "users"), 1);
  });
});

describe("esquema incompatible o ausente", () => {
  const initDb = createDatabase(initDbConfig());
  const appDb = createDatabase(appDbConfig());
  beforeEach(resetTestDatabase);
  after(async () => {
    await initDb.close();
    await appDb.close();
    await resetTestDatabase();
  });

  it("sin tablas, la API se niega a arrancar e indica ejecutar db:init", async () => {
    await assert.rejects(verifyDatabase(appDb), (e: unknown) => e instanceof DatabaseNotReadyError && /db:init/.test(e.message));
  });

  it("una tabla existente distinta se informa y NO se modifica", async () => {
    const root = rootPool();
    try {
      await root.query("CREATE TABLE users (id INT PRIMARY KEY, apodo VARCHAR(10)) ENGINE=InnoDB");
      await root.query("INSERT INTO users VALUES (1, 'previo')");
      const result = await init(initDb);
      assert.deepEqual(result.created, [], "no debe crear tablas si una existente es incompatible");
      assert.ok(result.problems.some((p) => p.includes("users.username")), JSON.stringify(result.problems));
      assert.ok(result.problems.some((p) => p.includes("Columna inesperada users.apodo")));
      const [rows] = await root.query<RowDataPacket[]>("SELECT apodo FROM users");
      assert.equal(rows[0]!.apodo, "previo", "los datos previos deben seguir intactos");
      const [tables] = await root.query<RowDataPacket[]>("SHOW TABLES");
      assert.equal(tables.length, 1, "solo debe existir la tabla previa");
    } finally {
      await root.end();
    }
    await assert.rejects(verifyDatabase(appDb), (e: unknown) => e instanceof DatabaseNotReadyError && /intervención manual/.test(e.message));
  });
});

describe("integridad de datos", () => {
  const initDb = createDatabase(initDbConfig());
  const appDb = createDatabase(appDbConfig());
  before(async () => {
    await resetTestDatabase();
    await init(initDb);
  });
  after(async () => {
    await initDb.close();
    await appDb.close();
  });

  it("rechaza tareas y sesiones de usuarios inexistentes (clave foránea)", async () => {
    await assert.rejects(insertTask(appDb, randomUUID()), { code: "ER_NO_REFERENCED_ROW_2" });
    await assert.rejects(
      appDb.pool.execute(
        "INSERT INTO sessions VALUES (UNHEX(SHA2('t', 256)), ?, ?, ?, ?, ?)",
        [randomUUID(), NOW, NOW, NOW, NOW],
      ),
      { code: "ER_NO_REFERENCED_ROW_2" },
    );
  });

  it("borrar un usuario elimina en cascada sus tareas y sesiones", async () => {
    const userId = await insertUser(appDb, "cascada");
    await insertTask(appDb, userId);
    await appDb.pool.execute("INSERT INTO sessions VALUES (UNHEX(SHA2('s', 256)), ?, ?, ?, ?, ?)", [userId, NOW, NOW, NOW, NOW]);
    await appDb.pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    const [t] = await appDb.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?", [userId]);
    const [s] = await appDb.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", [userId]);
    assert.equal(t[0]!.n, 0);
    assert.equal(s[0]!.n, 0);
  });

  it("username es único y debe estar normalizado (minúsculas, 3–30, sin símbolo inicial/final)", async () => {
    await insertUser(appDb, "unico");
    await assert.rejects(insertUser(appDb, "unico"), { code: "ER_DUP_ENTRY" });
    for (const bad of ["Mayus", "ab", "_abc", "abc.", "con espacio", "a".repeat(31)]) {
      await assert.rejects(insertUser(appDb, bad), (e: { code?: string }) =>
        ["ER_CHECK_CONSTRAINT_VIOLATED", "ER_DATA_TOO_LONG"].includes(e.code ?? ""),
      );
    }
    await insertUser(appDb, "kori.dev-01");
  });

  it("estado completada ⇔ completed_at no nulo", async () => {
    const userId = await insertUser(appDb, "estados");
    await assert.rejects(insertTask(appDb, userId, { status: "completada", completedAt: null }), { code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await assert.rejects(insertTask(appDb, userId, { status: "pendiente", completedAt: NOW }), { code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await insertTask(appDb, userId, { status: "completada", completedAt: NOW });
  });

  it("rechaza prioridades fuera del enum y títulos demasiado largos (modo estricto)", async () => {
    const userId = await insertUser(appDb, "limites");
    await assert.rejects(insertTask(appDb, userId, { priority: "urgente" }), { code: "WARN_DATA_TRUNCATED" });
    await assert.rejects(insertTask(appDb, userId, { title: "x".repeat(81) }), { code: "ER_DATA_TOO_LONG" });
    await insertTask(appDb, userId, { title: "x".repeat(80) });
  });
});
