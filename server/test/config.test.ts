import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ConfigError, loadConfig, loadDbInitConfig } from "../src/config.ts";
import { UNIT_DB_ENV } from "./helpers.ts";

function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  assert.fail("debía lanzar ConfigError");
}

describe("loadConfig", () => {
  it("aplica valores por defecto seguros", () => {
    const config = loadConfig({ ...UNIT_DB_ENV });
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 3000);
    assert.equal(config.logLevel, "info");
    assert.equal(config.trustProxy, false);
    assert.equal(config.bodyLimit, 16 * 1024);
    assert.equal(config.requestTimeoutMs, 15_000);
    assert.equal(config.shutdownTimeoutMs, 10_000);
    assert.equal(config.db.poolSize, 5);
    assert.equal(config.db.connectTimeoutMs, 5_000);
    assert.equal(config.db.socketPath, undefined);
    assert.equal(config.db.password, undefined);
  });

  it("lee valores válidos", () => {
    const config = loadConfig({
      ...UNIT_DB_ENV,
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://dailytask.example",
      HOST: "0.0.0.0",
      PORT: "8080",
      LOG_LEVEL: "warn",
      TRUST_PROXY: "100.64.0.1, 10.0.0.0/8",
      BODY_LIMIT_BYTES: "32768",
      DB_PASSWORD: "pw",
      DB_POOL_SIZE: "3",
    });
    assert.equal(config.nodeEnv, "production");
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.port, 8080);
    assert.equal(config.logLevel, "warn");
    assert.deepEqual(config.trustProxy, ["100.64.0.1", "10.0.0.0/8"]);
    assert.equal(config.bodyLimit, 32768);
    assert.equal(config.db.password, "pw");
    assert.equal(config.db.poolSize, 3);
  });

  it("rechaza TRUST_PROXY=true (confiar en cualquier proxy)", () => {
    assert.throws(() => loadConfig({ ...UNIT_DB_ENV, TRUST_PROXY: "true" }), ConfigError);
  });

  it("acumula todos los problemas en un solo error", () => {
    const problems = problemsOf(() => loadConfig({ ...UNIT_DB_ENV, PORT: "abc", NODE_ENV: "staging", LOG_LEVEL: "verbose" }));
    assert.equal(problems.length, 3);
  });

  it("nunca incluye el valor recibido en el mensaje de error", () => {
    const secret = "s3cr3t-P4ssw0rd!";
    const env = {
      PORT: secret,
      HOST: `${secret} x`,
      TRUST_PROXY: secret,
      NODE_ENV: secret,
      LOG_LEVEL: secret,
      DB_NAME: secret,
      DB_USER: `${secret} y`,
      DB_PORT: secret,
      DB_POOL_SIZE: secret,
    };
    try {
      loadConfig(env);
      assert.fail("debía lanzar ConfigError");
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.ok(!error.message.includes(secret), "el mensaje contiene el valor secreto");
    }
  });

  it("rechaza puertos fuera de rango", () => {
    assert.throws(() => loadConfig({ ...UNIT_DB_ENV, PORT: "70000" }), ConfigError);
    assert.throws(() => loadConfig({ ...UNIT_DB_ENV, PORT: "-1" }), ConfigError);
  });
});

describe("configuración de MySQL", () => {
  it("exige DB_NAME y DB_USER", () => {
    const problems = problemsOf(() => loadConfig({}));
    assert.ok(problems.some((p) => p.includes("DB_NAME")));
    assert.ok(problems.some((p) => p.includes("DB_USER")));
  });

  it("admite socket Unix (producción) y rechaza combinarlo con DB_HOST", () => {
    const config = loadConfig({ DB_SOCKET_PATH: "/run/mysqld/mysqld.sock", DB_NAME: "dailytask", DB_USER: "dailytask_app" });
    assert.equal(config.db.socketPath, "/run/mysqld/mysqld.sock");
    assert.throws(
      () => loadConfig({ ...UNIT_DB_ENV, DB_SOCKET_PATH: "/run/mysqld/mysqld.sock" }),
      (e: unknown) => e instanceof ConfigError && e.problems.some((p) => p.includes("DB_SOCKET_PATH")),
    );
    assert.throws(() => loadConfig({ DB_SOCKET_PATH: "relativo.sock", DB_NAME: "d", DB_USER: "u" }), ConfigError);
  });

  it("lee la contraseña desde DB_PASSWORD_FILE sin el salto de línea final", () => {
    const dir = mkdtempSync(join(tmpdir(), "dailytask-cfg-"));
    const file = join(dir, "db_password");
    writeFileSync(file, "desde-fichero\n");
    const config = loadConfig({ ...UNIT_DB_ENV, DB_PASSWORD_FILE: file });
    assert.equal(config.db.password, "desde-fichero");
  });

  it("con ruta relativa, DB_PASSWORD_FILE se busca en $CREDENTIALS_DIRECTORY (systemd LoadCredential)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dailytask-cred-"));
    writeFileSync(join(dir, "db_password"), "desde-credencial\n");
    const config = loadConfig({ ...UNIT_DB_ENV, DB_PASSWORD_FILE: "db_password", CREDENTIALS_DIRECTORY: dir });
    assert.equal(config.db.password, "desde-credencial");
  });

  it("rechaza DB_PASSWORD y DB_PASSWORD_FILE a la vez, y ficheros ilegibles, sin mostrar valores", () => {
    const secret = "otro-secreto-xyz";
    const both = problemsOf(() => loadConfig({ ...UNIT_DB_ENV, DB_PASSWORD: secret, DB_PASSWORD_FILE: "/tmp/x" }));
    assert.ok(both.some((p) => p.includes("DB_PASSWORD_FILE")));
    const missing = problemsOf(() => loadConfig({ ...UNIT_DB_ENV, DB_PASSWORD_FILE: `/no/existe/${secret}` }));
    assert.ok(!JSON.stringify(missing).includes(secret));
  });

  it("la inicialización usa DB_INIT_USER / DB_INIT_PASSWORD", () => {
    const cfg = loadDbInitConfig({ DB_NAME: "dailytask", DB_INIT_USER: "dailytask_migrator", DB_INIT_PASSWORD: "pw" });
    assert.equal(cfg.user, "dailytask_migrator");
    assert.equal(cfg.password, "pw");
    assert.throws(() => loadDbInitConfig({ DB_NAME: "dailytask", DB_USER: "dailytask_app" }), ConfigError);
  });
});
