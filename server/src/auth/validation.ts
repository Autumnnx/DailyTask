/**
 * Reglas de registro (aprobadas en la Fase 1). Las longitudes se miden con
 * `String.length`, igual que el frontend.
 *
 * Contraseñas: la ÚNICA regla es la longitud (6–128). Sin requisitos de
 * complejidad, sin listas de contraseñas comunes ni comprobaciones externas.
 * Nunca se recorta ni se modifica la contraseña.
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;
export const NAME_MIN = 2;
export const NAME_MAX = 100;

export const MESSAGES = {
  username: "El nombre de usuario debe tener entre 3 y 30 caracteres (letras, números, '.', '-' o '_') y empezar y terminar con letra o número.",
  name: `Escribe tu nombre (entre ${NAME_MIN} y ${NAME_MAX} caracteres).`,
  password: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`,
  loginUsername: "Escribe tu nombre de usuario.",
  loginPassword: "Escribe tu contraseña.",
} as const;

/** Normaliza el nombre de usuario: sin espacios alrededor y en minúsculas. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(normalized: string): boolean {
  return USERNAME_PATTERN.test(normalized);
}

export interface RegisterInput {
  username: string;
  name: string;
  password: string;
}

export function validateRegister(body: RegisterInput): { value: RegisterInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const username = normalizeUsername(body.username);
  const name = body.name.trim();

  if (!isValidUsername(username)) fields.username = MESSAGES.username;
  if (name.length < NAME_MIN || name.length > NAME_MAX) fields.name = MESSAGES.name;
  if (body.password.length < PASSWORD_MIN || body.password.length > PASSWORD_MAX) fields.password = MESSAGES.password;

  return { value: { username, name, password: body.password }, fields };
}
