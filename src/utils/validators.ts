import type { TaskInput } from "../types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export function validateRegister(data: {
  name: string;
  email: string;
  password: string;
  confirm: string;
}): FieldErrors<"name" | "email" | "password" | "confirm"> {
  const errors: FieldErrors<"name" | "email" | "password" | "confirm"> = {};
  if (data.name.trim().length < 2) errors.name = "Escribe tu nombre (mínimo 2 caracteres).";
  if (!EMAIL_REGEX.test(data.email.trim())) errors.email = "Ingresa un correo válido, por ejemplo nombre@correo.com.";
  if (data.password.length < 6) errors.password = "La contraseña debe tener al menos 6 caracteres.";
  if (data.confirm !== data.password) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

export function validateLogin(data: {
  email: string;
  password: string;
}): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  if (!EMAIL_REGEX.test(data.email.trim())) errors.email = "Ingresa un correo válido.";
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
