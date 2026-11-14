/**
 * `npm run db:init` — crea las tablas de DailyTask si no existen y verifica el esquema.
 *
 * Usa la cuenta con permiso de creación (DB_INIT_USER / DB_INIT_PASSWORD[_FILE]),
 * no la de la aplicación. Es seguro ejecutarlo varias veces: nunca borra ni
 * modifica tablas existentes. Códigos de salida: 0 correcto, 1 error.
 */
import { ConfigError, loadDbInitConfig } from "../config.ts";
import { createDatabase, describeDbError } from "./pool.ts";
import { ensureSchema } from "./schema.ts";

async function main(): Promise<number> {
  let cfg;
  try {
    cfg = loadDbInitConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const db = createDatabase({ ...cfg, poolSize: 1 });
  try {
    const connection = await db.pool.getConnection();
    try {
      const { created, problems } = await ensureSchema(connection);
      if (created.length > 0) process.stdout.write(`Tablas creadas: ${created.join(", ")}.\n`);
      else process.stdout.write("Todas las tablas ya existían; no se ha modificado nada.\n");

      if (problems.length > 0) {
        process.stderr.write(
          `El esquema existente no coincide con el esperado (no se ha modificado ninguna tabla existente):\n - ${problems.join("\n - ")}\n` +
            "Se requiere intervención manual (ver docs/backend-planning/DATABASE.md).\n",
        );
        return 1;
      }
      process.stdout.write(`Esquema verificado en la base ${cfg.database}.\n`);
      return 0;
    } finally {
      connection.release();
    }
  } catch (error) {
    const safe = describeDbError(error);
    process.stderr.write(`No se pudo inicializar el esquema: ${safe.message} [${safe.code}]\n`);
    return 1;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
