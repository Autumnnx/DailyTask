import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/** Ejecuta un script de `src/` como proceso real, con un entorno mínimo y controlado. */
export function runScript(script: string, env: Record<string, string>) {
  const child = spawn(process.execPath, [`${SRC}${script}`], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, output: () => ({ stdout, stderr }) };
}

export type RunningScript = ReturnType<typeof runScript>;

export async function waitForListening(proc: RunningScript, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/.exec(proc.output().stdout);
    if (match) return match[1]!;
    if (proc.child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`El servidor no arrancó.\n${JSON.stringify(proc.output())}`);
}
