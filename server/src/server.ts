import { buildApp } from "./app.ts";
import { type Config, ConfigError, loadConfig } from "./config.ts";

/**
 * Punto de entrada: carga la configuración, arranca el servidor y gestiona
 * el cierre ordenado ante SIGINT/SIGTERM (systemd envía SIGTERM al parar).
 */
async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Mensaje sin valores de las variables (ver config.ts).
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const app = buildApp(config);
  let closing = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "cerrando servidor");
    const timer = setTimeout(() => {
      app.log.error("cierre ordenado excedió el tiempo límite; forzando salida");
      process.exit(1);
    }, config.shutdownTimeoutMs);
    timer.unref();
    try {
      await app.close();
      app.log.info("servidor cerrado");
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "error durante el cierre");
      process.exit(1);
    }
  }

  process.once("SIGINT", (signal) => void shutdown(signal));
  process.once("SIGTERM", (signal) => void shutdown(signal));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, "no se pudo iniciar el servidor");
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`Promesa rechazada sin control: ${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});

await main();
