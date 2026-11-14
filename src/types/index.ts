export type Priority = "alta" | "media" | "baja";
export type Status = "pendiente" | "en_progreso" | "completada";

/** Usuario autenticado tal como lo devuelve la API (`/api/auth/*`). */
export interface SessionUser {
  id: string;
  username: string;
  name: string;
}

/** Tarea tal como la devuelve la API (`/api/tasks`). Ids y marcas de tiempo los genera el backend. */
export interface Task {
  id: string;
  title: string;
  description: string;
  /** Fecha en formato YYYY-MM-DD */
  dueDate: string;
  priority: Priority;
  status: Status;
  /** ISO 8601 UTC */
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type TaskInput = Pick<Task, "title" | "description" | "dueDate" | "priority" | "status">;

export interface TaskFilters {
  search: string;
  status: Status | "todas";
  priority: Priority | "todas";
}
