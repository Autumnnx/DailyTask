/**
 * Reglas de tareas, alineadas con `src/utils/validators.ts` del frontend.
 * Longitudes medidas con `String.length`, como el cliente.
 */

export const PRIORITIES = ["alta", "media", "baja"] as const;
export const STATUSES = ["pendiente", "en_progreso", "completada"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

export interface TaskInput {
  title: string;
  description: string;
  dueDate: string;
  priority: Priority;
  status: Status;
}

const MESSAGES = {
  titleShort: "El título necesita al menos 3 caracteres.",
  titleLong: "El título no puede superar 80 caracteres.",
  description: "La descripción no puede superar 400 caracteres.",
  dueDate: "Elige una fecha de vencimiento válida (AAAA-MM-DD).",
} as const;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es "YYYY-MM-DD" una fecha de calendario real entre 1970-01-01 y 9999-12-31? */
export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1970 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Recorta título y descripción (como al guardar en el frontend) y valida. */
export function validateTaskInput(body: Omit<TaskInput, "description"> & { description?: string }): {
  value: TaskInput;
  fields: Record<string, string>;
} {
  const value: TaskInput = {
    title: body.title.trim(),
    description: (body.description ?? "").trim(),
    dueDate: body.dueDate,
    priority: body.priority,
    status: body.status,
  };
  const fields: Record<string, string> = {};
  if (value.title.length < 3) fields.title = MESSAGES.titleShort;
  else if (value.title.length > 80) fields.title = MESSAGES.titleLong;
  if (value.description.length > 400) fields.description = MESSAGES.description;
  if (!isValidCalendarDate(value.dueDate)) fields.dueDate = MESSAGES.dueDate;
  return { value, fields };
}

/** Escapa los comodines de LIKE para que el texto del usuario se trate literalmente (escape: `!`). */
export function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (c) => `!${c}`);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
