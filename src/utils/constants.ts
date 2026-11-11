import type { Priority, Status } from "../types";

export const STATUSES: { value: Status; label: string; hint: string }[] = [
  { value: "pendiente", label: "Pendiente", hint: "Por empezar" },
  { value: "en_progreso", label: "En progreso", hint: "Manos a la obra" },
  { value: "completada", label: "Completada", hint: "Listo y tachado" },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  alta: 0,
  media: 1,
  baja: 2,
};
