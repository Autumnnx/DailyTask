import type { TaskInput } from "../types";

/** Mismas reglas que el servidor (server/src/auth/validation.ts). */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

/** Normaliza el nombre de usuario como el servidor: sin espacios alrededor y en minúsculas. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateRegister(data: {
  name: string;
  username: string;
  password: string;
  confirm: string;
}): FieldErrors<"name" | "username" | "password" | "confirm"> {
  const errors: FieldErrors<"name" | "username" | "password" | "confirm"> = {};
  const name = data.name.trim();
  if (name.length < 2 || name.length > 100) errors.name = "Escribe tu nombre (entre 2 y 100 caracteres).";
  if (!USERNAME_PATTERN.test(normalizeUsername(data.username))) {
    errors.username = "Usa entre 3 y 30 caracteres: letras, números, '.', '-' o '_', empezando y terminando con letra o número.";
  }
  // La única regla de la contraseña es su longitud; no se recorta ni se modifica.
  if (data.password.length < 6 || data.password.length > 128) errors.password = "La contraseña debe tener entre 6 y 128 caracteres.";
  if (data.confirm !== data.password) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

export function validateLogin(data: { username: string; password: string }): FieldErrors<"username" | "password"> {
  const errors: FieldErrors<"username" | "password"> = {};
  if (!normalizeUsername(data.username)) errors.username = "Escribe tu nombre de usuario.";
  if (!data.password) errors.password = "Escribe tu contraseña.";
  return errors;
}

export function validateTask(data: TaskInput): FieldErrors<"title" | "description" | "dueDate"> {
  const errors: FieldErrors<"title" | "description" | "dueDate"> = {};
  if (data.title.trim().length < 3) errors.title = "El título necesita al menos 3 caracteres.";
  if (data.title.trim().length > 80) errors.title = "El título no puede superar 80 caracteres.";
  if (data.description.length > 400) errors.description = "La descripción no puede superar 400 caracteres.";
  if (!data.dueDate) errors.dueDate = "Elige una fecha de vencimiento.";
  return errors;
}
