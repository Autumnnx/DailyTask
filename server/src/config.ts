import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Lectura y validación de la configuración desde variables de entorno.
 *
 * Regla de seguridad: los mensajes de error nombran la variable y la regla
 * incumplida, pero NUNCA incluyen el valor recibido (podría ser un secreto
 * pegado por error en la variable equivocada) ni el contenido de ficheros.
 */

export type NodeEnv = "development" | "production" | "test";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface DbConfig {
  /** TCP (desarrollo). Ignorado si hay `socketPath`. */
  host: string;
  port: number;
  /** Socket Unix (producción en NixOS). */
  socketPath: string | undefined;
  database: string;
  user: string;
  /** `undefined` permite métodos sin contraseña (p. ej. auth_socket). */
  password: string | undefined;
  poolSize: number;
  connectTimeoutMs: number;
  /** Tiempo máximo de las consultas de comprobación (health, esquema). */
  queryTimeoutMs: number;
}

export interface AuthConfig {
  /** Orígenes permitidos en peticiones que modifican datos (verificación de `Origin`). */
  allowedOrigins: string[];
  /** Atributo `Secure` de la cookie de sesión. Obligatorio en producción. */
  cookieSecure: boolean;
  sessionIdleTtlMs: number;
  sessionAbsoluteTtlMs: number;
  sessionCleanupIntervalMs: number;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

export interface RateLimitConfig {
  globalPerMinute: number;
  loginPerMinute: number;
  loginPerUsernamePerMinute: number;
  registerPerMinute: number;
}

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
  /**
   * Carpeta `dist/` del frontend compilado (ruta absoluta). Si está definida, Fastify sirve
   * la aplicación React en el mismo origen que /api; si no, solo la API.
   */
  staticDir: string | undefined;
  db: DbConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  tasks: { maxPerUser: number };
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Configuración inválida:\n - ${problems.join("\n - ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

export type Env = Record<string, string | undefined>;

const NODE_ENVS: readonly NodeEnv[] = ["development", "production", "test"];
const LOG_LEVELS: readonly LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

// IPv4, IPv6 o CIDR. Validación deliberadamente simple: solo caracteres permitidos.
const PROXY_ENTRY = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;
const HOSTNAME = /^[A-Za-z0-9.:-]+$/;
const DB_NAME = /^[A-Za-z0-9_]{1,64}$/;
const DB_USER = /^[A-Za-z0-9_.-]{1,32}$/;

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

function readHost(env: Env, name: string, fallback: string, problems: string[]): string {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (HOSTNAME.test(raw)) return raw;
  problems.push(`${name} debe ser una dirección IP o un nombre de host válido.`);
  return fallback;
}

function readRequired(env: Env, name: string, pattern: RegExp, rule: string, problems: string[]): string {
  const raw = env[name]?.trim();
  if (!raw) {
    problems.push(`${name} es obligatoria.`);
    return "";
  }
  if (pattern.test(raw)) return raw;
  problems.push(`${name} ${rule}.`);
  return "";
}

function readTrustProxy(env: Env, problems: string[]): string[] | false {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return false;
  const entries = raw.split(",").map((e) => e.trim()).filter(Boolean);
  if (entries.length > 0 && entries.every((e) => PROXY_ENTRY.test(e))) return entries;
  problems.push("TRUST_PROXY debe ser una lista separada por comas de IPs o rangos CIDR (no se admite 'true').");
  return false;
}

/** Lee `<name>` o `<name>_FILE` (fichero con el secreto, p. ej. de systemd LoadCredential). */
function readSecret(env: Env, name: string, problems: string[]): string | undefined {
  const direct = env[name];
  const file = env[`${name}_FILE`]?.trim();
  if (direct !== undefined && direct !== "" && file) {
    problems.push(`Define solo una de ${name} o ${name}_FILE.`);
    return undefined;
  }
  if (file) {
    // Ruta relativa + systemd LoadCredential: se busca en $CREDENTIALS_DIRECTORY (p. ej. "db_password").
    const credentialsDir = env.CREDENTIALS_DIRECTORY?.trim();
    const path = !isAbsolute(file) && credentialsDir ? join(credentialsDir, file) : file;
    try {
      return readFileSync(path, "utf8").replace(/\r?\n$/, "");
    } catch {
      problems.push(`${name}_FILE no se pudo leer (comprueba la ruta y los permisos).`);
      return undefined;
    }
  }
  return direct === "" ? undefined : direct;
}

export interface DbCredentialVars {
  user: string;
  password: string;
}

/**
 * Configuración de conexión MySQL. Las variables de usuario y contraseña son
 * parametrizables para que la inicialización del esquema use otra cuenta.
 */
export function readDbConfig(
  env: Env,
  problems: string[],
  vars: DbCredentialVars = { user: "DB_USER", password: "DB_PASSWORD" },
): DbConfig {
  const socketPath = env.DB_SOCKET_PATH?.trim() || undefined;
  if (socketPath && env.DB_HOST?.trim()) problems.push("Define solo una de DB_SOCKET_PATH o DB_HOST.");
  if (socketPath && !socketPath.startsWith("/")) problems.push("DB_SOCKET_PATH debe ser una ruta absoluta.");

  return {
    host: readHost(env, "DB_HOST", "127.0.0.1", problems),
    port: readInt(env, "DB_PORT", 3306, 1, 65535, problems),
    socketPath,
    database: readRequired(env, "DB_NAME", DB_NAME, "solo admite letras, números y '_' (máx. 64)", problems),
    user: readRequired(env, vars.user, DB_USER, "solo admite letras, números, '_', '.' y '-' (máx. 32)", problems),
    password: readSecret(env, vars.password, problems),
    poolSize: readInt(env, "DB_POOL_SIZE", 5, 1, 20, problems),
    connectTimeoutMs: readInt(env, "DB_CONNECT_TIMEOUT_MS", 5_000, 500, 60_000, problems),
    queryTimeoutMs: readInt(env, "DB_QUERY_TIMEOUT_MS", 3_000, 100, 60_000, problems),
  };
}

const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const HOUR_MS = 3_600_000;

function readOrigins(env: Env, nodeEnv: NodeEnv, problems: string[]): string[] {
  const raw = env.PUBLIC_ORIGIN?.trim();
  if (!raw) {
    if (nodeEnv === "production") problems.push("PUBLIC_ORIGIN es obligatoria en producción (p. ej. https://dominio).");
    return DEV_ORIGINS;
  }
  const origins = raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (origins.length === 0 || !origins.every((o) => ORIGIN.test(o))) {
    problems.push("PUBLIC_ORIGIN debe ser una lista separada por comas de orígenes como https://dominio o http://localhost:5173.");
    return DEV_ORIGINS;
  }
  if (nodeEnv === "production" && origins.some((o) => o.startsWith("http://"))) {
    problems.push("PUBLIC_ORIGIN debe usar https en producción.");
  }
  return origins;
}

function readBool(env: Env, name: string, fallback: boolean, problems: string[]): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  problems.push(`${name} debe ser true o false.`);
  return fallback;
}

function readAuthConfig(env: Env, nodeEnv: NodeEnv, problems: string[]): AuthConfig {
  const cookieSecure = readBool(env, "COOKIE_SECURE", nodeEnv === "production", problems);
  if (nodeEnv === "production" && !cookieSecure) problems.push("COOKIE_SECURE=false no está permitido en producción.");

  const idleHours = readInt(env, "SESSION_IDLE_TTL_HOURS", 168, 1, 8_760, problems);
  const absoluteHours = readInt(env, "SESSION_ABSOLUTE_TTL_HOURS", 720, 1, 8_760, problems);
  if (absoluteHours < idleHours) problems.push("SESSION_ABSOLUTE_TTL_HOURS no puede ser menor que SESSION_IDLE_TTL_HOURS.");

  return {
    allowedOrigins: readOrigins(env, nodeEnv, problems),
    cookieSecure,
    sessionIdleTtlMs: idleHours * HOUR_MS,
    sessionAbsoluteTtlMs: absoluteHours * HOUR_MS,
    sessionCleanupIntervalMs: readInt(env, "SESSION_CLEANUP_INTERVAL_MINUTES", 60, 1, 1_440, problems) * 60_000,
    argon2: {
      // Mínimos recomendados por OWASP para Argon2id: 19 MiB, 2 pasadas, 1 hilo.
      memoryCost: readInt(env, "ARGON2_MEMORY_KIB", 19_456, 19_456, 1_048_576, problems),
      timeCost: readInt(env, "ARGON2_TIME_COST", 2, 2, 10, problems),
      parallelism: readInt(env, "ARGON2_PARALLELISM", 1, 1, 8, problems),
    },
  };
}

/** STATIC_DIR opcional: debe ser una carpeta con `index.html` (la salida de `npm run build` del frontend). */
function readStaticDir(env: Env, problems: string[]): string | undefined {
  const raw = env.STATIC_DIR?.trim();
  if (!raw) return undefined;
  const dir = resolve(raw);
  try {
    if (statSync(dir).isDirectory() && existsSync(join(dir, "index.html"))) return dir;
  } catch {
    // se informa abajo
  }
  problems.push("STATIC_DIR debe ser una carpeta existente que contenga index.html (el dist/ del frontend compilado).");
  return undefined;
}

function readRateLimitConfig(env: Env, problems: string[]): RateLimitConfig {
  return {
    globalPerMinute: readInt(env, "RATE_LIMIT_GLOBAL_PER_MIN", 300, 1, 100_000, problems),
    loginPerMinute: readInt(env, "RATE_LIMIT_LOGIN_PER_MIN", 10, 1, 10_000, problems),
    loginPerUsernamePerMinute: readInt(env, "RATE_LIMIT_LOGIN_USER_PER_MIN", 5, 1, 10_000, problems),
    registerPerMinute: readInt(env, "RATE_LIMIT_REGISTER_PER_MIN", 5, 1, 10_000, problems),
  };
}

export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];
  const nodeEnv = readEnum(env, "NODE_ENV", NODE_ENVS, "development", problems);

  const config: Config = {
    nodeEnv,
    host: readHost(env, "HOST", "127.0.0.1", problems),
    port: readInt(env, "PORT", 3000, 0, 65535, problems),
    logLevel: readEnum(env, "LOG_LEVEL", LOG_LEVELS, "info", problems),
    trustProxy: readTrustProxy(env, problems),
    bodyLimit: readInt(env, "BODY_LIMIT_BYTES", 16 * 1024, 1024, 1024 * 1024, problems),
    requestTimeoutMs: readInt(env, "REQUEST_TIMEOUT_MS", 15_000, 1_000, 120_000, problems),
    shutdownTimeoutMs: readInt(env, "SHUTDOWN_TIMEOUT_MS", 10_000, 1_000, 120_000, problems),
    db: readDbConfig(env, problems),
    auth: readAuthConfig(env, nodeEnv, problems),
    rateLimit: readRateLimitConfig(env, problems),
    tasks: { maxPerUser: readInt(env, "MAX_TASKS_PER_USER", 1_000, 1, 100_000, problems) },
    staticDir: readStaticDir(env, problems),
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

/** Configuración de la cuenta con permisos de creación de tablas (`npm run db:init`). */
export function loadDbInitConfig(env: Env = process.env): DbConfig {
  const problems: string[] = [];
  const db = readDbConfig(env, problems, { user: "DB_INIT_USER", password: "DB_INIT_PASSWORD" });
  if (problems.length > 0) throw new ConfigError(problems);
  return db;
}
