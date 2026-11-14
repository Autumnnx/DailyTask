import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { createDatabase } from "../../src/db/pool.ts";
import { ensureSchema } from "../../src/db/schema.ts";
import { appDbConfig, initDbConfig, resetTestDatabase } from "./env.ts";

describe("privilegios del usuario de la aplicación", () => {
  const initDb = createDatabase(initDbConfig());
  const app = createDatabase(appDbConfig());

  before(async () => {
    await resetTestDatabase();
    const conn = await initDb.pool.getConnection();
    await ensureSchema(conn);
    conn.release();
  });
  after(async () => {
    await initDb.close();
    await app.close();
  });

  it("solo tiene SELECT, INSERT, UPDATE, DELETE sobre su base", async () => {
    const [rows] = await app.pool.query<RowDataPacket[]>("SHOW GRANTS FOR CURRENT_USER()");
    const grants = rows.map((r) => String(Object.values(r)[0]));
    const onDb = grants.filter((g) => g.includes("`dailytask_test`"));
    assert.equal(onDb.length, 1, grants.join("\n"));
    assert.match(onDb[0]!, /^GRANT SELECT, INSERT, UPDATE, DELETE ON `dailytask_test`\.\*/);
    // Nivel global: solo USAGE (ningún privilegio administrativo).
    assert.ok(grants.some((g) => /^GRANT USAGE ON \*\.\*/.test(g)), grants.join("\n"));
    assert.ok(!grants.some((g) => /ALL PRIVILEGES|SUPER|GRANT OPTION|CREATE USER/.test(g)), grants.join("\n"));
  });

  it("no puede crear, alterar ni borrar tablas", async () => {
    await assert.rejects(app.pool.query("CREATE TABLE intruso (id INT)"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
    await assert.rejects(app.pool.query("ALTER TABLE tasks ADD COLUMN x INT"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
    await assert.rejects(app.pool.query("DROP TABLE tasks"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
    await assert.rejects(app.pool.query("TRUNCATE TABLE tasks"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
  });

  it("no puede leer tablas del sistema ni administrar usuarios", async () => {
    await assert.rejects(app.pool.query("SELECT user FROM mysql.user"), { code: "ER_TABLEACCESS_DENIED_ERROR" });
    await assert.rejects(app.pool.query("CREATE USER 'x'@'%' IDENTIFIED BY 'y'"), { code: "ER_SPECIFIC_ACCESS_DENIED_ERROR" });
  });

  it("no puede acceder a otras bases", async () => {
    await assert.rejects(app.pool.query("SELECT 1 FROM dailytask_otra.users"), (e: { code?: string }) =>
      ["ER_TABLEACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "ER_NO_SUCH_TABLE"].includes(e.code ?? ""),
    );
  });

  it("no admite varias sentencias en una sola consulta", async () => {
    await assert.rejects(app.pool.query("SELECT 1; SELECT 2"), { code: "ER_PARSE_ERROR" });
  });
});
