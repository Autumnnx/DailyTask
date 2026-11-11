import { useCallback, useEffect, useMemo, useState } from "react";
import type { Status, Task, TaskInput } from "../types";
import { STORAGE_KEYS, readJSON, writeJSON } from "../utils/storage";
import { createId } from "../utils/crypto";

/**
 * Gestiona las tareas del usuario autenticado (CRUD + cambio de estado).
 * Las tareas de todos los usuarios viven en una sola clave de localStorage,
 * pero cada usuario solo ve y modifica las suyas.
 */
export function useTasks(userId: string) {
  const [allTasks, setAllTasks] = useState<Task[]>(() => readJSON<Task[]>(STORAGE_KEYS.tasks, []));

  useEffect(() => {
    writeJSON(STORAGE_KEYS.tasks, allTasks);
  }, [allTasks]);

  const tasks = useMemo(() => allTasks.filter((t) => t.userId === userId), [allTasks, userId]);

  const createTask = useCallback(
    (input: TaskInput) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: createId(),
        userId,
        title: input.title.trim(),
        description: input.description.trim(),
        dueDate: input.dueDate,
        priority: input.priority,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        completedAt: input.status === "completada" ? now : undefined,
      };
      setAllTasks((prev) => [task, ...prev]);
    },
    [userId],
  );

  const updateTask = useCallback(
    (id: string, input: TaskInput) => {
      const now = new Date().toISOString();
      setAllTasks((prev) =>
        prev.map((t) =>
          t.id === id && t.userId === userId
            ? {
                ...t,
                title: input.title.trim(),
                description: input.description.trim(),
                dueDate: input.dueDate,
                priority: input.priority,
                status: input.status,
                updatedAt: now,
                completedAt: input.status === "completada" ? (t.completedAt ?? now) : undefined,
              }
            : t,
        ),
      );
    },
    [userId],
  );

  const changeStatus = useCallback(
    (id: string, status: Status) => {
      const now = new Date().toISOString();
      setAllTasks((prev) =>
        prev.map((t) =>
          t.id === id && t.userId === userId
            ? { ...t, status, updatedAt: now, completedAt: status === "completada" ? now : undefined }
            : t,
        ),
      );
    },
    [userId],
  );

  const deleteTask = useCallback(
    (id: string) => {
      setAllTasks((prev) => prev.filter((t) => !(t.id === id && t.userId === userId)));
    },
    [userId],
  );

  return { tasks, createTask, updateTask, changeStatus, deleteTask };
}
