/**
 * Entorno de las pruebas de base de datos: SIEMPRE el MySQL local de desarrollo
 * (`dev/mysql.sh up`). Los valores por defecto coinciden con ese script.
 *
 * Salvaguardas: solo hosts de loopback y bases cuyo nombre termina en `_test`.
 */
import mysql, { type Pool } from "mysql2/promise";
import type { DbConfig } from "../../src/config.ts";

const env = process.env;

export const TEST_DB = {
  host: env.TEST_DB_HOST ?? "127.0.0.1",
  port: Number(env.TEST_DB_PORT ?? 3307),
  database: env.TEST_DB_NAME ?? "dailytask_test",
  appUser: env.TEST_DB_APP_USER ?? "dailytask_app",
  appPassword: env.TEST_DB_APP_PASSWORD ?? env.DEV_MYSQL_APP_PASSWORD ?? "dailytask-dev-app",
  initUser: env.TEST_DB_INIT_USER ?? "dailytask_migrator",
  initPassword: env.TEST_DB_INIT_PASSWORD ?? env.DEV_MYSQL_MIGRATOR_PASSWORD ?? "dailytask-dev-migrator",
  rootPassword: env.DEV_MYSQL_ROOT_PASSWORD ?? "dailytask-dev-root",
};

if (!["127.0.0.1", "localhost", "::1"].includes(TEST_DB.host)) {
  throw new Error("Las pruebas de BD solo se ejecutan contra un MySQL local (127.0.0.1).");
}
if (!TEST_DB.database.endsWith("_test")) {
  throw new Error("Las pruebas de BD solo se ejecutan contra bases cuyo nombre termina en _test.");
}

function base(user: string, password: string): DbConfig {
  return {
    host: TEST_DB.host,
    port: TEST_DB.port,
    socketPath: undefined,
    database: TEST_DB.database,
    user,
    password,
    poolSize: 5,
    connectTimeoutMs: 3_000,
    queryTimeoutMs: 3_000,
  };
}

export const appDbConfig = (): DbConfig => base(TEST_DB.appUser, TEST_DB.appPassword);
export const initDbConfig = (): DbConfig => base(TEST_DB.initUser, TEST_DB.initPassword);

/** Variables de entorno para lanzar `server.ts` / `db/init.ts` contra la base de pruebas. */
export function serverEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    LOG_LEVEL: "info",
    DB_HOST: TEST_DB.host,
    DB_PORT: String(TEST_DB.port),
    DB_NAME: TEST_DB.database,
    DB_USER: TEST_DB.appUser,
    DB_PASSWORD: TEST_DB.appPassword,
    DB_INIT_USER: TEST_DB.initUser,
    DB_INIT_PASSWORD: TEST_DB.initPassword,
    ...extra,
  };
}

/** Conexión root SOLO para preparar/limpiar la base `_test` (el contenedor es de desarrollo). */
export function rootPool(): Pool {
  return mysql.createPool({
    host: TEST_DB.host,
    port: TEST_DB.port,
    user: "root",
    password: TEST_DB.rootPassword,
    database: TEST_DB.database,
    connectionLimit: 1,
    connectTimeout: 3_000,
  });
}

/** Deja la base de pruebas con el esquema creado y sin datos. */
export async function prepareSchema(): Promise<void> {
  await resetTestDatabase();
  const { createDatabase } = await import("../../src/db/pool.ts");
  const { ensureSchema } = await import("../../src/db/schema.ts");
  const db = createDatabase(initDbConfig());
  try {
    const conn = await db.pool.getConnection();
    try {
      const { problems } = await ensureSchema(conn);
      if (problems.length > 0) throw new Error(`Esquema de pruebas inválido: ${problems.join("; ")}`);
    } finally {
      conn.release();
    }
  } finally {
    await db.close();
  }
}

/** Elimina las tablas de DailyTask de la base de pruebas para empezar desde cero. */
export async function resetTestDatabase(): Promise<void> {
  const root = rootPool();
  try {
    await root.query(`DROP TABLE IF EXISTS \`${TEST_DB.database}\`.sessions, \`${TEST_DB.database}\`.tasks, \`${TEST_DB.database}\`.users`);
  } finally {
    await root.end();
  }
}
