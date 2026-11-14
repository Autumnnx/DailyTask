import mysql, { type Pool, type PoolOptions } from "mysql2/promise";
import type { DbConfig } from "../config.ts";

/** Acceso a MySQL compartido por toda la aplicación. */
export interface Database {
  readonly pool: Pool;
  /** `SELECT 1` con tiempo límite; lanza si MySQL no responde. */
  ping(): Promise<void>;
  /** Cierra el pool. Idempotente. */
  close(): Promise<void>;
}

export class DbTimeoutError extends Error {
  readonly code = "DAILYTASK_DB_TIMEOUT";
  constructor() {
    super("MySQL no respondió a tiempo.");
    this.name = "DbTimeoutError";
  }
}

/** Ejecuta `task` con un tiempo máximo (incluye la espera para obtener conexión). */
export async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError()), ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function poolOptions(cfg: DbConfig): PoolOptions {
  return {
    ...(cfg.socketPath ? { socketPath: cfg.socketPath } : { host: cfg.host, port: cfg.port }),
    user: cfg.user,
    ...(cfg.password !== undefined ? { password: cfg.password } : {}),
    database: cfg.database,
    connectionLimit: cfg.poolSize,
    maxIdle: cfg.poolSize,
    idleTimeout: 60_000,
    // Cola acotada: si la base se satura, se falla rápido en vez de acumular memoria.
    waitForConnections: true,
    queueLimit: 50,
    connectTimeout: cfg.connectTimeoutMs,
    enableKeepAlive: true,
    charset: "UTF8MB4_0900_AI_CI",
    // Marcas de tiempo en UTC; DATE se devuelve como cadena "YYYY-MM-DD" (sin desfase de zona).
    timezone: "Z",
    dateStrings: ["DATE"],
    multipleStatements: false,
  };
}

export function createDatabase(cfg: DbConfig): Database {
  const pool = mysql.createPool(poolOptions(cfg));

  // Cada conexión nueva trabaja en UTC (afecta a NOW(), CURRENT_TIMESTAMP, etc.).
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  let closing: Promise<void> | undefined;

  return {
    pool,
    async ping() {
      await withTimeout(pool.query("SELECT 1"), cfg.queryTimeoutMs);
    },
    close() {
      closing ??= pool.end();
      return closing;
    },
  };
}

/** Códigos conocidos → mensaje claro y seguro (sin credenciales, rutas ni texto interno de MySQL). */
const DB_ERROR_MESSAGES: Record<string, string> = {
  ECONNREFUSED: "MySQL rechazó la conexión: comprueba que está en marcha y el host/puerto configurados.",
  ENOENT: "No existe el socket de MySQL configurado.",
  ENOTFOUND: "No se encontró el host de MySQL configurado.",
  EACCES: "Sin permiso para acceder al socket de MySQL.",
  ETIMEDOUT: "MySQL no respondió a tiempo al conectar.",
  DAILYTASK_DB_TIMEOUT: "MySQL no respondió a tiempo.",
  ECONNRESET: "Se perdió la conexión con MySQL.",
  PROTOCOL_CONNECTION_LOST: "Se perdió la conexión con MySQL.",
  ER_ACCESS_DENIED_ERROR: "MySQL rechazó las credenciales configuradas.",
  ER_BAD_DB_ERROR: "La base de datos configurada no existe.",
  ER_DBACCESS_DENIED_ERROR: "El usuario de MySQL no tiene acceso a la base configurada.",
  ER_TABLEACCESS_DENIED_ERROR: "El usuario de MySQL no tiene permiso para esta operación.",
  ER_CON_COUNT_ERROR: "MySQL tiene demasiadas conexiones abiertas.",
  ER_NO_SUCH_TABLE: "Falta una tabla del esquema.",
  POOL_CLOSED: "El pool de conexiones está cerrado.",
};

const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOENT",
  "ENOTFOUND",
  "EACCES",
  "ETIMEDOUT",
  "DAILYTASK_DB_TIMEOUT",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

/** ¿El error indica que MySQL no está disponible (y no un fallo de la consulta)? → HTTP 503. */
export function isDbUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && UNAVAILABLE_CODES.has(code)) return true;
  return error instanceof Error && /pool is closed|queue limit reached/i.test(error.message);
}

export interface SafeDbError {
  code: string;
  message: string;
}

export function describeDbError(error: unknown): SafeDbError {
  const rawCode = (error as { code?: unknown } | null)?.code;
  const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : "UNKNOWN";
  if (code === "UNKNOWN" && error instanceof Error && /pool is closed/i.test(error.message)) {
    return { code: "POOL_CLOSED", message: DB_ERROR_MESSAGES.POOL_CLOSED! };
  }
  return { code, message: DB_ERROR_MESSAGES[code] ?? `Error de MySQL (código ${code}).` };
}
