import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runScript, waitForListening } from "../process.ts";
import { resetTestDatabase, serverEnv } from "./env.ts";

describe("procesos reales contra el MySQL local", () => {
  it("sin esquema, la API no arranca e indica ejecutar db:init", async () => {
    await resetTestDatabase();
    const proc = runScript("server.ts", serverEnv());
    const code = await proc.exited;
    assert.equal(code, 1, JSON.stringify(proc.output()));
    assert.match(proc.output().stdout, /npm run db:init/);
  });

  it("db:init crea las tablas y es idempotente", async () => {
    const first = runScript("db/init.ts", serverEnv());
    assert.equal(await first.exited, 0, JSON.stringify(first.output()));
    assert.match(first.output().stdout, /Tablas creadas: users, tasks, sessions/);

    const second = runScript("db/init.ts", serverEnv());
    assert.equal(await second.exited, 0, JSON.stringify(second.output()));
    assert.match(second.output().stdout, /no se ha modificado nada/);
  });

  it("db:init con credenciales erróneas falla con mensaje claro sin la contraseña", async () => {
    const password = "init-clave-mala-987";
    const proc = runScript("db/init.ts", serverEnv({ DB_INIT_PASSWORD: password }));
    assert.equal(await proc.exited, 1);
    const { stdout, stderr } = proc.output();
    assert.match(stderr, /ER_ACCESS_DENIED_ERROR/);
    assert.ok(!stdout.includes(password) && !stderr.includes(password));
  });

  it("arranca, /api/health responde 200 y SIGTERM cierra servidor y pool (código 0)", async () => {
    const proc = runScript("server.ts", serverEnv());
    const baseUrl = await waitForListening(proc);
    assert.match(proc.output().stdout, /esquema verificado/);

    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });

    proc.child.kill("SIGTERM");
    assert.equal(await proc.exited, 0, JSON.stringify(proc.output()));
    assert.match(proc.output().stdout, /servidor cerrado/);
  });

  it("17. una sesión creada sigue siendo válida tras reiniciar el proceso de la API", async () => {
    const first = runScript("server.ts", serverEnv());
    const url1 = await waitForListening(first);
    const reg = await fetch(`${url1}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ username: `reinicio${Date.now() % 100000}`, name: "Reinicio", password: "000000" }),
    });
    assert.equal(reg.status, 201);
    const cookie = reg.headers.get("set-cookie")!.split(";")[0]!;
    assert.match(cookie, /^dt_session=[A-Za-z0-9_-]{43}$/);
    first.child.kill("SIGTERM");
    assert.equal(await first.exited, 0);

    const second = runScript("server.ts", serverEnv());
    const url2 = await waitForListening(second);
    const meRes = await fetch(`${url2}/api/auth/me`, { headers: { cookie } });
    second.child.kill("SIGTERM");
    await second.exited;
    assert.equal(meRes.status, 200);
    assert.equal(((await meRes.json()) as { user: { name: string } }).user.name, "Reinicio");
  });

  it("también se cierra limpiamente con SIGINT", async () => {
    const proc = runScript("server.ts", serverEnv());
    await waitForListening(proc);
    proc.child.kill("SIGINT");
    assert.equal(await proc.exited, 0, JSON.stringify(proc.output()));
  });
});
