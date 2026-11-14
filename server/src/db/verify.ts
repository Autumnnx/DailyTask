import { describeDbError, type Database } from "./pool.ts";
import { checkSchema } from "./schema.ts";

/** La base no está lista para que arranque la API. El mensaje es seguro para logs. */
export class DatabaseNotReadyError extends Error {
  readonly problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.name = "DatabaseNotReadyError";
    this.problems = problems;
  }
}

/**
 * Comprobación de arranque: conectividad y esquema. La API no crea tablas
 * (su usuario no tiene permisos DDL): si falta algo, indica ejecutar `db:init`.
 */
export async function verifyDatabase(db: Database): Promise<void> {
  let problems: string[];
  try {
    await db.ping();
    problems = await checkSchema(db.pool);
  } catch (error) {
    const safe = describeDbError(error);
    throw new DatabaseNotReadyError(`No se pudo conectar con MySQL: ${safe.message} [${safe.code}]`);
  }
  if (problems.length > 0) {
    const missingOnly = problems.every((p) => p.startsWith("Falta la tabla"));
    throw new DatabaseNotReadyError(
      missingOnly
        ? "El esquema no está inicializado: ejecuta `npm run db:init`."
        : "El esquema de MySQL no coincide con el esperado; se requiere intervención manual.",
      problems,
    );
  }
}
