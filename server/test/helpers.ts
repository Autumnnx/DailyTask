import { buildApp, type BuildAppOptions } from "../src/app.ts";
import { type Config, loadConfig } from "../src/config.ts";
import type { Database } from "../src/db/pool.ts";

/** Variables de BD mínimas para construir la configuración (las pruebas unitarias no conectan). */
export const UNIT_DB_ENV = { DB_HOST: "127.0.0.1", DB_PORT: "3307", DB_NAME: "dailytask_test", DB_USER: "dailytask_app" };

/** Configuración de pruebas: logs silenciados salvo que se pida otra cosa. */
export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", ...UNIT_DB_ENV, ...env });
}

/** Base de datos simulada para pruebas sin MySQL. */
export function fakeDb(options: { failPing?: Error } = {}): Database & { closed: boolean } {
  const db = {
    closed: false,
    pool: null as never,
    async ping() {
      if (options.failPing) throw options.failPing;
    },
    async close() {
      db.closed = true;
    },
  };
  return db;
}

export function testApp(env: Record<string, string> = {}, options: Partial<BuildAppOptions> = {}) {
  return buildApp(testConfig(env), { db: fakeDb(), ...options });
}
