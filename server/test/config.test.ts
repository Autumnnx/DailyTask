import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("aplica valores por defecto seguros", () => {
    const config = loadConfig({});
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 3000);
    assert.equal(config.logLevel, "info");
    assert.equal(config.trustProxy, false);
    assert.equal(config.bodyLimit, 16 * 1024);
    assert.equal(config.requestTimeoutMs, 15_000);
    assert.equal(config.shutdownTimeoutMs, 10_000);
  });

  it("lee valores válidos", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: "8080",
      LOG_LEVEL: "warn",
      TRUST_PROXY: "100.64.0.1, 10.0.0.0/8",
      BODY_LIMIT_BYTES: "32768",
    });
    assert.equal(config.nodeEnv, "production");
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.port, 8080);
    assert.equal(config.logLevel, "warn");
    assert.deepEqual(config.trustProxy, ["100.64.0.1", "10.0.0.0/8"]);
    assert.equal(config.bodyLimit, 32768);
  });

  it("rechaza TRUST_PROXY=true (confiar en cualquier proxy)", () => {
    assert.throws(() => loadConfig({ TRUST_PROXY: "true" }), ConfigError);
  });

  it("acumula todos los problemas en un solo error", () => {
    try {
      loadConfig({ PORT: "abc", NODE_ENV: "staging", LOG_LEVEL: "verbose" });
      assert.fail("debía lanzar ConfigError");
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.problems.length, 3);
      assert.match(error.message, /PORT/);
      assert.match(error.message, /NODE_ENV/);
      assert.match(error.message, /LOG_LEVEL/);
    }
  });

  it("nunca incluye el valor recibido en el mensaje de error", () => {
    const secret = "s3cr3t-P4ssw0rd!";
    const env = { PORT: secret, HOST: `${secret} x`, TRUST_PROXY: secret, NODE_ENV: secret, LOG_LEVEL: secret };
    try {
      loadConfig(env);
      assert.fail("debía lanzar ConfigError");
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.ok(!error.message.includes(secret), "el mensaje contiene el valor secreto");
      assert.ok(!JSON.stringify(error.problems).includes(secret));
    }
  });

  it("rechaza puertos fuera de rango", () => {
    assert.throws(() => loadConfig({ PORT: "70000" }), ConfigError);
    assert.throws(() => loadConfig({ PORT: "-1" }), ConfigError);
  });
});
