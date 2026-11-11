export type Priority = "alta" | "media" | "baja";
export type Status = "pendiente" | "en_progreso" | "completada";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

/** Usuario sin datos sensibles, el que se expone a la interfaz. */
export type SessionUser = Pick<User, "id" | "name" | "email">;

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  /** Fecha en formato YYYY-MM-DD */
  dueDate: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type TaskInput = Pick<Task, "title" | "description" | "dueDate" | "priority" | "status">;

export interface TaskFilters {
  search: string;
  status: Status | "todas";
  priority: Priority | "todas";
}
