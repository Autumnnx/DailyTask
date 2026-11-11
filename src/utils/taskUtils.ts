import type { Task, TaskFilters } from "../types";
import { PRIORITY_WEIGHT } from "./constants";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Aplica búsqueda (título o descripción), estado y prioridad. */
export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const query = normalize(filters.search.trim());
  return tasks.filter((task) => {
    if (filters.status !== "todas" && task.status !== filters.status) return false;
    if (filters.priority !== "todas" && task.priority !== filters.priority) return false;
    if (!query) return true;
    return normalize(task.title).includes(query) || normalize(task.description).includes(query);
  });
}

/** Orden: fecha de vencimiento más cercana primero y, en empate, mayor prioridad. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  });
}
