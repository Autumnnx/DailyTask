import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDbError, poolOptions, withTimeout } from "../src/db/pool.ts";
import { testConfig } from "./helpers.ts";

describe("opciones del pool MySQL", () => {
  it("TCP en desarrollo: host y puerto, pool de 5, cola acotada, UTC, DATE como cadena", () => {
    const opts = poolOptions(testConfig({ DB_PASSWORD: "pw" }).db);
    assert.equal(opts.host, "127.0.0.1");
    assert.equal(opts.port, 3307);
    assert.equal(opts.socketPath, undefined);
    assert.equal(opts.connectionLimit, 5);
    assert.equal(opts.queueLimit, 50);
    assert.equal(opts.timezone, "Z");
    assert.deepEqual(opts.dateStrings, ["DATE"]);
    assert.equal(opts.multipleStatements, false);
  });

  it("socket Unix en producción: sin host ni puerto, y sin contraseña si no se define", () => {
    const opts = poolOptions(
      testConfig({ DB_HOST: "", DB_SOCKET_PATH: "/run/mysqld/mysqld.sock", DB_NAME: "dailytask" }).db,
    );
    assert.equal(opts.socketPath, "/run/mysqld/mysqld.sock");
    assert.equal(opts.host, undefined);
    assert.equal(opts.port, undefined);
    assert.equal("password" in opts, false);
  });
});

describe("errores de MySQL", () => {
  it("traduce códigos conocidos a mensajes sin datos internos", () => {
    const err = Object.assign(new Error("Access denied for user 'u'@'h' (using password: YES)"), { code: "ER_ACCESS_DENIED_ERROR" });
    assert.deepEqual(describeDbError(err), { code: "ER_ACCESS_DENIED_ERROR", message: "MySQL rechazó las credenciales configuradas." });
  });

  it("no refleja códigos con formato extraño", () => {
    assert.equal(describeDbError({ code: "x'; DROP" }).code, "UNKNOWN");
    assert.equal(describeDbError(null).code, "UNKNOWN");
  });

  it("withTimeout corta operaciones que no terminan", async () => {
    await assert.rejects(withTimeout(new Promise(() => {}), 20), { code: "DAILYTASK_DB_TIMEOUT" });
    assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
  });
});
