import { buildApp, type BuildAppOptions } from "../src/app.ts";
import { type Config, loadConfig } from "../src/config.ts";

/** Configuración de pruebas: logs silenciados salvo que se pida otra cosa. */
export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", ...env });
}

export function testApp(env: Record<string, string> = {}, options: BuildAppOptions = {}) {
  return buildApp(testConfig(env), options);
}
