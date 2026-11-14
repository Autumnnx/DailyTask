import { useCallback, useEffect, useState } from "react";
import type { Status, Task, TaskInput } from "../types";
import { api, errorMessage } from "../utils/api";

/**
 * Tareas del usuario autenticado, almacenadas en MySQL a través de la API.
 * El backend identifica al usuario por la cookie de sesión.
 *
 * El estado local solo refleja operaciones confirmadas por el servidor (sin
 * actualizaciones optimistas). Las mutaciones lanzan `ApiError` si fallan.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await api.get<{ tasks: Task[] }>("/tasks");
      setTasks(res.tasks);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = (task: Task) => setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));

  const createTask = useCallback(async (input: TaskInput) => {
    const res = await api.post<{ task: Task }>("/tasks", input);
    setTasks((prev) => [res.task, ...prev]);
  }, []);

  const updateTask = useCallback(async (id: string, input: TaskInput) => {
    const res = await api.put<{ task: Task }>(`/tasks/${encodeURIComponent(id)}`, input);
    replace(res.task);
  }, []);

  const changeStatus = useCallback(async (id: string, status: Status) => {
    const res = await api.patch<{ task: Task }>(`/tasks/${encodeURIComponent(id)}/status`, { status });
    replace(res.task);
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await api.delete(`/tasks/${encodeURIComponent(id)}`);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { tasks, loading, loadError, reload, createTask, updateTask, changeStatus, deleteTask };
}
