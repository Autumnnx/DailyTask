import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/**
 * Esquema de DailyTask (ver docs/backend-planning/DATABASE.md).
 *
 * Inicialización sencilla: se crean las tablas que falten y después se verifica
 * que la estructura coincide con la esperada. Nunca se modifican ni borran
 * tablas existentes; si algo no coincide se informa y se requiere intervención manual.
 */

export const TABLES = ["users", "tasks", "sessions"] as const;
type TableName = (typeof TABLES)[number];

/** Orden de creación: `users` antes que las tablas que la referencian. */
export const CREATE_TABLES: Record<TableName, string> = {
  users: `CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username      VARCHAR(30)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT chk_users_username CHECK (username REGEXP '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  tasks: `CREATE TABLE IF NOT EXISTS tasks (
  id           CHAR(36)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id      CHAR(36)     CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title        VARCHAR(80)  NOT NULL,
  description  VARCHAR(400) NOT NULL DEFAULT '',
  due_date     DATE         NOT NULL,
  priority     ENUM('alta','media','baja') NOT NULL,
  status       ENUM('pendiente','en_progreso','completada') NOT NULL DEFAULT 'pendiente',
  created_at   DATETIME(3)  NOT NULL,
  updated_at   DATETIME(3)  NOT NULL,
  completed_at DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY idx_tasks_user_due (user_id, due_date),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_tasks_completed CHECK ((status = 'completada') = (completed_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,

  sessions: `CREATE TABLE IF NOT EXISTS sessions (
  token_hash          BINARY(32)  NOT NULL,
  user_id             CHAR(36)    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at          DATETIME(3) NOT NULL,
  last_seen_at        DATETIME(3) NOT NULL,
  idle_expires_at     DATETIME(3) NOT NULL,
  absolute_expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_idle (idle_expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
};

interface ColumnSpec {
  type: string;
  nullable: boolean;
  collation?: string;
}

/** Estructura esperada: columnas (tipo, nulabilidad y colación cuando importa), índices y restricciones. */
const EXPECTED: Record<TableName, { columns: Record<string, ColumnSpec>; indexes: string[]; constraints: string[] }> = {
  users: {
    columns: {
      id: { type: "char(36)", nullable: false, collation: "ascii_bin" },
      username: { type: "varchar(30)", nullable: false, collation: "ascii_bin" },
      name: { type: "varchar(100)", nullable: false },
      password_hash: { type: "varchar(255)", nullable: false },
      created_at: { type: "datetime(3)", nullable: false },
      updated_at: { type: "datetime(3)", nullable: false },
    },
    indexes: ["PRIMARY", "uq_users_username"],
    constraints: ["uq_users_username", "chk_users_username"],
  },
  tasks: {
    columns: {
      id: { type: "char(36)", nullable: false, collation: "ascii_bin" },
      user_id: { type: "char(36)", nullable: false, collation: "ascii_bin" },
      title: { type: "varchar(80)", nullable: false },
      description: { type: "varchar(400)", nullable: false },
      due_date: { type: "date", nullable: false },
      priority: { type: "enum('alta','media','baja')", nullable: false },
      status: { type: "enum('pendiente','en_progreso','completada')", nullable: false },
      created_at: { type: "datetime(3)", nullable: false },
      updated_at: { type: "datetime(3)", nullable: false },
      completed_at: { type: "datetime(3)", nullable: true },
    },
    indexes: ["PRIMARY", "idx_tasks_user_due"],
    constraints: ["fk_tasks_user", "chk_tasks_completed"],
  },
  sessions: {
    columns: {
      token_hash: { type: "binary(32)", nullable: false },
      user_id: { type: "char(36)", nullable: false, collation: "ascii_bin" },
      created_at: { type: "datetime(3)", nullable: false },
      last_seen_at: { type: "datetime(3)", nullable: false },
      idle_expires_at: { type: "datetime(3)", nullable: false },
      absolute_expires_at: { type: "datetime(3)", nullable: false },
    },
    indexes: ["PRIMARY", "idx_sessions_user", "idx_sessions_idle"],
    constraints: ["fk_sessions_user"],
  },
};

type Queryable = Pick<Pool, "query"> | Pick<PoolConnection, "query">;

async function rows<T extends RowDataPacket>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await db.query<T[]>(sql, params);
  return result;
}

/** Tablas de DailyTask presentes en la base actual. */
export async function existingTables(db: Queryable): Promise<string[]> {
  const found = await rows<RowDataPacket & { name: string }>(
    db,
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)",
    [TABLES],
  );
  return found.map((r) => r.name);
}

/**
 * Compara la estructura real con la esperada. Devuelve la lista de problemas
 * (vacía si todo coincide). Solo lee information_schema: funciona con el usuario
 * de la aplicación.
 */
export async function checkSchema(db: Queryable): Promise<string[]> {
  const problems: string[] = [];
  const params = [TABLES];

  const tables = await rows<RowDataPacket & { name: string; engine: string | null }>(
    db,
    "SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)",
    params,
  );
  const columns = await rows<RowDataPacket & { tbl: string; col: string; type: string; nullable: string; coll: string | null }>(
    db,
    `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLLATION_NAME AS coll
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
    params,
  );
  const indexes = await rows<RowDataPacket & { tbl: string; idx: string }>(
    db,
    `SELECT DISTINCT TABLE_NAME AS tbl, INDEX_NAME AS idx
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
    params,
  );
  const constraints = await rows<RowDataPacket & { tbl: string; name: string }>(
    db,
    `SELECT TABLE_NAME AS tbl, CONSTRAINT_NAME AS name
       FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
    params,
  );

  for (const table of TABLES) {
    const meta = tables.find((t) => t.name === table);
    if (!meta) {
      problems.push(`Falta la tabla ${table}.`);
      continue;
    }
    if (meta.engine?.toLowerCase() !== "innodb") problems.push(`La tabla ${table} no usa InnoDB.`);

    const expected = EXPECTED[table];
    const actualCols = columns.filter((c) => c.tbl === table);
    for (const [name, spec] of Object.entries(expected.columns)) {
      const col = actualCols.find((c) => c.col === name);
      if (!col) {
        problems.push(`Falta la columna ${table}.${name}.`);
        continue;
      }
      if (col.type.toLowerCase() !== spec.type) problems.push(`${table}.${name}: tipo ${col.type}, se esperaba ${spec.type}.`);
      if ((col.nullable === "YES") !== spec.nullable) {
        problems.push(`${table}.${name}: ${spec.nullable ? "debería admitir" : "no debería admitir"} NULL.`);
      }
      if (spec.collation && col.coll !== spec.collation) {
        problems.push(`${table}.${name}: colación ${col.coll ?? "ninguna"}, se esperaba ${spec.collation}.`);
      }
    }
    for (const col of actualCols) {
      if (!(col.col in expected.columns)) problems.push(`Columna inesperada ${table}.${col.col}.`);
    }
    for (const idx of expected.indexes) {
      if (!indexes.some((i) => i.tbl === table && i.idx === idx)) problems.push(`Falta el índice ${table}.${idx}.`);
    }
    for (const name of expected.constraints) {
      if (!constraints.some((c) => c.tbl === table && c.name === name)) problems.push(`Falta la restricción ${table}.${name}.`);
    }
  }
  return problems;
}

export interface EnsureSchemaResult {
  created: string[];
  problems: string[];
}

/**
 * Crea las tablas que falten (con una cuenta con permiso CREATE) y verifica el resultado.
 * Un bloqueo con nombre evita que dos procesos inicialicen a la vez.
 */
export async function ensureSchema(connection: PoolConnection, lockTimeoutSeconds = 10): Promise<EnsureSchemaResult> {
  const [lockRows] = await connection.query<(RowDataPacket & { acquired: number | null })[]>(
    "SELECT GET_LOCK('dailytask_schema_init', ?) AS acquired",
    [lockTimeoutSeconds],
  );
  if (lockRows[0]?.acquired !== 1) throw new Error("Otro proceso está inicializando el esquema; inténtalo de nuevo.");

  try {
    const present = new Set(await existingTables(connection));

    // Si alguna tabla existente no coincide, no se crea nada: se informa y se para.
    if (present.size > 0) {
      const problems = (await checkSchema(connection)).filter((p) => !p.startsWith("Falta la tabla"));
      if (problems.length > 0) return { created: [], problems };
    }

    const created: string[] = [];
    for (const table of TABLES) {
      if (present.has(table)) continue;
      await connection.query(CREATE_TABLES[table]);
      created.push(table);
    }
    return { created, problems: await checkSchema(connection) };
  } finally {
    await connection.query("SELECT RELEASE_LOCK('dailytask_schema_init')");
  }
}
