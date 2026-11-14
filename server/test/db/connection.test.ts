import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp } from "../../src/app.ts";
import { createDatabase, describeDbError } from "../../src/db/pool.ts";
import { ensureSchema } from "../../src/db/schema.ts";
import { testConfig } from "../helpers.ts";
import { appDbConfig, initDbConfig, resetTestDatabase } from "./env.ts";

describe("conexión con MySQL", () => {
  const db = createDatabase(appDbConfig());
  after(() => db.close());

  it("conecta y responde a SELECT 1", async () => {
    await db.ping();
  });

  it("cada conexión usa UTC y utf8mb4", async () => {
    const [rows] = await db.pool.query<RowDataPacket[]>(
      "SELECT @@session.time_zone AS tz, @@character_set_connection AS cs, @@collation_connection AS coll",
    );
    assert.equal(rows[0]!.tz, "+00:00");
    assert.equal(rows[0]!.cs, "utf8mb4");
    assert.equal(rows[0]!.coll, "utf8mb4_0900_ai_ci");
  });

  it("el pool no supera el tamaño configurado", async () => {
    const small = createDatabase({ ...appDbConfig(), poolSize: 2 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => small.pool.query<RowDataPacket[]>("SELECT CONNECTION_ID() AS id, SLEEP(0.05)")),
    );
    const ids = new Set(results.map(([rows]) => rows[0]!.id));
    await small.close();
    assert.ok(ids.size <= 2, `se usaron ${ids.size} conexiones`);
  });

  it("credenciales incorrectas → error controlado sin la contraseña", async () => {
    const password = "clave-incorrecta-123";
    const bad = createDatabase({ ...appDbConfig(), password });
    const error = await bad.ping().then(() => null, (e: unknown) => e);
    await bad.close();
    const safe = describeDbError(error);
    assert.equal(safe.code, "ER_ACCESS_DENIED_ERROR");
    assert.ok(!safe.message.includes(password));
    assert.ok(!safe.message.includes("dailytask_app"));
  });

  it("MySQL inaccesible → ECONNREFUSED con mensaje claro", async () => {
    const down = createDatabase({ ...appDbConfig(), port: 1, connectTimeoutMs: 1000 });
    const error = await down.ping().then(() => null, (e: unknown) => e);
    await down.close();
    assert.equal(describeDbError(error).code, "ECONNREFUSED");
  });

  it("close() cierra el pool, es idempotente y después las consultas fallan", async () => {
    const temp = createDatabase(appDbConfig());
    await temp.ping();
    await temp.close();
    await temp.close();
    const error = await temp.ping().then(() => null, (e: unknown) => e);
    assert.ok(error, "ping debía fallar con el pool cerrado");
    assert.equal(describeDbError(error).code, "POOL_CLOSED");
  });
});

describe("fechas y marcas de tiempo", () => {
  const initDb = createDatabase(initDbConfig());
  const db = createDatabase(appDbConfig());
  const originalTz = process.env.TZ;

  before(async () => {
    // Zona del proceso distinta de UTC para comprobar que no hay desfases.
    process.env.TZ = "America/Bogota";
    await resetTestDatabase();
    const conn = await initDb.pool.getConnection();
    await ensureSchema(conn);
    conn.release();
  });
  after(async () => {
    process.env.TZ = originalTz;
    await initDb.close();
    await db.close();
  });

  it("DATE se guarda y se lee como 'YYYY-MM-DD' exacto; DATETIME(3) conserva el instante UTC con milisegundos", async () => {
    const userId = randomUUID();
    const createdAt = new Date("2026-01-01T03:04:05.678Z"); // en Bogotá aún es 31-dic
    await db.pool.execute(
      "INSERT INTO users (id, username, name, password_hash, created_at, updated_at) VALUES (?, 'fechas', 'F', 'h', ?, ?)",
      [userId, createdAt, createdAt],
    );
    const taskId = randomUUID();
    await db.pool.execute(
      `INSERT INTO tasks (id, user_id, title, due_date, priority, status, created_at, updated_at, completed_at)
       VALUES (?, ?, 'Fecha', ?, 'alta', 'completada', ?, ?, ?)`,
      [taskId, userId, "2026-03-01", createdAt, createdAt, createdAt],
    );

    const [rows] = await db.pool.execute<RowDataPacket[]>(
      "SELECT due_date, created_at, completed_at, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS raw FROM tasks WHERE id = ?",
      [taskId],
    );
    const row = rows[0]!;
    assert.equal(row.due_date, "2026-03-01");
    assert.ok(row.created_at instanceof Date);
    assert.equal(row.created_at.toISOString(), "2026-01-01T03:04:05.678Z");
    assert.equal(row.completed_at.toISOString(), "2026-01-01T03:04:05.678Z");
    assert.equal(row.raw, "2026-01-01 03:04:05.678000", "en MySQL se almacena en UTC");
  });
});

describe("GET /api/health con MySQL real", () => {
  it("200 con MySQL disponible", async () => {
    const app = buildApp(testConfig(), { db: createDatabase(appDbConfig()) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: "ok" });
  });

  it("503 con MySQL inaccesible, sin detalles internos", async () => {
    const app = buildApp(testConfig(), { db: createDatabase({ ...appDbConfig(), port: 1, connectTimeoutMs: 1000 }) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { error: { code: "UNAVAILABLE", message: "Servicio no disponible temporalmente." } });
  });

  it("app.close() cierra el pool real", async () => {
    const db = createDatabase(appDbConfig());
    const app = buildApp(testConfig(), { db });
    await app.inject({ method: "GET", url: "/api/health" });
    await app.close();
    await assert.rejects(db.ping());
  });
});
