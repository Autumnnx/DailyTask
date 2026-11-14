/**
 * Lectura y validación de la configuración desde variables de entorno.
 *
 * Regla de seguridad: los mensajes de error nombran la variable y la regla
 * incumplida, pero NUNCA incluyen el valor recibido (podría ser un secreto
 * pegado por error en la variable equivocada).
 */

export type NodeEnv = "development" | "production" | "test";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface Config {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  logLevel: LogLevel;
  /** IPs/CIDR de proxies de confianza; `false` = no confiar en X-Forwarded-*. */
  trustProxy: string[] | false;
  /** Tamaño máximo del cuerpo de una petición, en bytes. */
  bodyLimit: number;
  /** Tiempo máximo para recibir una petición completa, en ms. */
  requestTimeoutMs: number;
  /** Tiempo máximo de cierre ordenado antes de forzar la salida, en ms. */
  shutdownTimeoutMs: number;
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Configuración inválida:\n - ${problems.join("\n - ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

type Env = Record<string, string | undefined>;

const NODE_ENVS: readonly NodeEnv[] = ["development", "production", "test"];
const LOG_LEVELS: readonly LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

// IPv4, IPv6 o CIDR. Validación deliberadamente simple: solo caracteres permitidos.
const PROXY_ENTRY = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

function readEnum<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T, problems: string[]): T {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  problems.push(`${name} debe ser uno de: ${allowed.join(", ")}.`);
  return fallback;
}

function readInt(env: Env, name: string, fallback: number, min: number, max: number, problems: string[]): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    if (value >= min && value <= max) return value;
  }
  problems.push(`${name} debe ser un entero entre ${min} y ${max}.`);
  return fallback;
}

function readHost(env: Env, problems: string[]): string {
  const raw = env.HOST?.trim();
  if (!raw) return "127.0.0.1";
  if (/^[A-Za-z0-9.:-]+$/.test(raw)) return raw;
  problems.push("HOST debe ser una dirección IP o un nombre de host válido.");
  return "127.0.0.1";
}

function readTrustProxy(env: Env, problems: string[]): string[] | false {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return false;
  const entries = raw.split(",").map((e) => e.trim()).filter(Boolean);
  if (entries.length > 0 && entries.every((e) => PROXY_ENTRY.test(e))) return entries;
  problems.push("TRUST_PROXY debe ser una lista separada por comas de IPs o rangos CIDR (no se admite 'true').");
  return false;
}

export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];

  const config: Config = {
    nodeEnv: readEnum(env, "NODE_ENV", NODE_ENVS, "development", problems),
    host: readHost(env, problems),
    port: readInt(env, "PORT", 3000, 0, 65535, problems),
    logLevel: readEnum(env, "LOG_LEVEL", LOG_LEVELS, "info", problems),
    trustProxy: readTrustProxy(env, problems),
    bodyLimit: readInt(env, "BODY_LIMIT_BYTES", 16 * 1024, 1024, 1024 * 1024, problems),
    requestTimeoutMs: readInt(env, "REQUEST_TIMEOUT_MS", 15_000, 1_000, 120_000, problems),
    shutdownTimeoutMs: readInt(env, "SHUTDOWN_TIMEOUT_MS", 10_000, 1_000, 120_000, problems),
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
