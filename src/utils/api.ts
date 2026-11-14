/**
 * Cliente HTTP de la API de DailyTask.
 *
 * - Rutas relativas `/api/...`: mismo origen en producción y proxy de Vite en desarrollo.
 * - La sesión viaja en la cookie HttpOnly `dt_session` (`credentials: "same-origin"`);
 *   el frontend nunca ve ni guarda el token.
 * - Los errores llegan como `{ error: { code, message, fields? } }` y se convierten en `ApiError`.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  limit?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const MESSAGES = {
  network: "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
  unavailable: "El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
  unexpected: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
} as const;

let onSessionExpired: (() => void) | null = null;

/** Registra qué hacer cuando la API responde 401 UNAUTHENTICATED (sesión caducada o revocada). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Mensaje genérico según el estado. Un 5xx sin el formato de error de la API viene de un
 * proxy (p. ej. Vite o el de producción) que no alcanza la API → "no disponible".
 */
function fallbackMessage(status: number, fromApi: boolean): string {
  if (status === 502 || status === 503 || status === 504) return MESSAGES.unavailable;
  if (status >= 500 && !fromApi) return MESSAGES.unavailable;
  return MESSAGES.unexpected;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // p. ej. una página HTML de error de un proxy
  }
}

interface RequestOptions {
  /** No avisar de sesión caducada (p. ej. la comprobación inicial con /auth/me). */
  silentUnauthenticated?: boolean;
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", MESSAGES.network);
  }

  if (response.status === 204) return undefined as T;
  const data = await readBody(response);

  if (!response.ok) {
    const error = (data as { error?: ApiErrorBody } | undefined)?.error;
    const isJsonError = error && typeof error.code === "string" && typeof error.message === "string";
    const code = isJsonError ? error.code : response.status >= 500 ? "UNAVAILABLE" : "UNEXPECTED";
    // Para 5xx se muestra siempre un mensaje genérico propio (sin detalles del servidor).
    const message = isJsonError && response.status < 500 ? error.message : fallbackMessage(response.status, Boolean(isJsonError));
    if (response.status === 401 && code === "UNAUTHENTICATED" && !options.silentUnauthenticated) onSessionExpired?.();
    throw new ApiError(response.status, code, message, isJsonError ? (error.fields ?? {}) : {});
  }

  if (data === undefined) throw new ApiError(response.status, "UNEXPECTED", MESSAGES.unexpected);
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: (path: string) => request<void>("DELETE", path),
};

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : MESSAGES.unexpected;
}
