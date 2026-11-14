import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runScript } from "./process.ts";

// Arranques que fallan antes de necesitar MySQL. El ciclo completo (arranque,
// /api/health y cierre con SIGTERM/SIGINT) está en test/db/server.test.ts.
describe("arranque del proceso (sin MySQL)", () => {
  it("aborta con código 1 ante configuración inválida sin mostrar el valor", async () => {
    const secret = "valor-secreto-123";
    const proc = runScript("server.ts", { NODE_ENV: "test", PORT: secret, TRUST_PROXY: secret, DB_NAME: "x", DB_USER: "y" });
    const code = await proc.exited;
    const { stdout, stderr } = proc.output();
    assert.equal(code, 1);
    assert.match(stderr, /Configuración inválida/);
    assert.match(stderr, /PORT/);
    assert.ok(!stderr.includes(secret) && !stdout.includes(secret), "la salida contiene el valor secreto");
  });

  it("aborta con código 1 y mensaje claro si MySQL no está accesible, sin mostrar la contraseña", async () => {
    const password = "contrasena-que-no-debe-salir";
    const proc = runScript("server.ts", {
      NODE_ENV: "test",
      PORT: "0",
      LOG_LEVEL: "info",
      DB_HOST: "127.0.0.1",
      DB_PORT: "1", // puerto sin servicio → conexión rechazada
      DB_NAME: "dailytask_test",
      DB_USER: "dailytask_app",
      DB_PASSWORD: password,
      DB_CONNECT_TIMEOUT_MS: "1000",
    });
    const code = await proc.exited;
    const { stdout, stderr } = proc.output();
    assert.equal(code, 1, JSON.stringify(proc.output()));
    assert.match(stdout, /No se pudo conectar con MySQL/);
    assert.match(stdout, /ECONNREFUSED/);
    assert.ok(!stdout.includes(password) && !stderr.includes(password), "la salida contiene la contraseña");
    assert.doesNotMatch(stdout, /Server listening/);
  });
});
