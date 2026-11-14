import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testApp } from "./helpers.ts";

describe("redacción de logs", () => {
  it("no escribe contraseñas, tokens, hashes ni cookies", async () => {
    const lines: string[] = [];
    const app = testApp({ LOG_LEVEL: "info" }, { logStream: { write: (msg) => void lines.push(msg) } });
    await app.ready();

    app.log.info(
      {
        password: "pw-top-level",
        token: "tok-top-level",
        passwordHash: "$argon2id$hash",
        body: { password: "pw-nested", token: "tok-nested" },
        req: { headers: { cookie: "dt_session=cookie-value", authorization: "Bearer auth-value" } },
      },
      "evento de prueba",
    );
    await app.close();

    const output = lines.join("");
    assert.match(output, /evento de prueba/);
    for (const secret of ["pw-top-level", "tok-top-level", "$argon2id$hash", "pw-nested", "tok-nested", "cookie-value", "auth-value"]) {
      assert.ok(!output.includes(secret), `el log contiene ${secret}`);
    }
    assert.match(output, /\[REDACTED\]/);
  });

  it("registra el error interno en el log pero no en la respuesta", async () => {
    const lines: string[] = [];
    const app = testApp({ LOG_LEVEL: "info" }, { logStream: { write: (msg) => void lines.push(msg) } });
    app.get("/__test/crash", async () => {
      throw new Error("fallo-interno-visible-solo-en-log");
    });
    const res = await app.inject({ method: "GET", url: "/__test/crash" });
    await app.close();

    assert.equal(res.statusCode, 500);
    assert.ok(!res.body.includes("fallo-interno"));
    assert.ok(lines.join("").includes("fallo-interno-visible-solo-en-log"));
  });
});
