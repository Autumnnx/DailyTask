import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SERVER_ENTRY = fileURLToPath(new URL("../src/server.ts", import.meta.url));

/** Arranca `src/server.ts` como proceso real, con un entorno mínimo y controlado. */
function startServer(env: Record<string, string>) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  return { child, output: () => ({ stdout, stderr }) };
}

async function waitForListening(proc: ReturnType<typeof startServer>, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(proc.output().stdout);
    if (match) return match[1]!;
    if (proc.child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`El servidor no arrancó.\n${JSON.stringify(proc.output())}`);
}

describe("ciclo de vida del proceso", () => {
  it("arranca, responde /api/health y se cierra limpiamente con SIGTERM", async () => {
    const proc = startServer({ NODE_ENV: "test", HOST: "127.0.0.1", PORT: "0", LOG_LEVEL: "info" });
    const baseUrl = await waitForListening(proc);

    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });

    proc.child.kill("SIGTERM");
    const [code] = await once(proc.child, "exit");
    assert.equal(code, 0, JSON.stringify(proc.output()));
    assert.match(proc.output().stdout, /servidor cerrado/);
  });

  it("también se cierra limpiamente con SIGINT", async () => {
    const proc = startServer({ NODE_ENV: "test", HOST: "127.0.0.1", PORT: "0", LOG_LEVEL: "info" });
    await waitForListening(proc);
    proc.child.kill("SIGINT");
    const [code] = await once(proc.child, "exit");
    assert.equal(code, 0, JSON.stringify(proc.output()));
  });

  it("aborta con código 1 ante configuración inválida sin mostrar el valor", async () => {
    const secret = "valor-secreto-123";
    const proc = startServer({ NODE_ENV: "test", PORT: secret, TRUST_PROXY: secret });
    const [code] = await once(proc.child, "exit");
    const { stdout, stderr } = proc.output();
    assert.equal(code, 1);
    assert.match(stderr, /Configuración inválida/);
    assert.match(stderr, /PORT/);
    assert.ok(!stderr.includes(secret) && !stdout.includes(secret), "la salida contiene el valor secreto");
  });
});
