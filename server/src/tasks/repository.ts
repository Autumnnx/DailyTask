import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { escapeLike, type Priority, type Status, type TaskInput } from "./validation.ts";

/** Tarea tal como la recibe el cliente (contrato de API.md §1.2). */
export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TaskFilters {
  status?: Status;
  priority?: Priority;
  q?: string;
}

interface TaskRow extends RowDataPacket {
  id: string;
  title: string;
  description: string;
  due_date: string;
  priority: Priority;
  status: Status;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

const COLUMNS = "id, title, description, due_date, priority, status, created_at, updated_at, completed_at";

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

/*
 * Todas las consultas filtran por `user_id` (el de la sesión) y son parametrizadas.
 * Una tarea de otro usuario es indistinguible de una inexistente.
 */

export async function listTasks(pool: Pool, userId: string, filters: TaskFilters): Promise<Task[]> {
  const where = ["user_id = ?"];
  const params: string[] = [userId];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.priority) {
    where.push("priority = ?");
    params.push(filters.priority);
  }
  if (filters.q) {
    // La colación utf8mb4_0900_ai_ci ignora mayúsculas y tildes, como filterTasks del frontend.
    where.push("(title LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')");
    const pattern = `%${escapeLike(filters.q)}%`;
    params.push(pattern, pattern);
  }
  // Orden de sortTasks: vencimiento ascendente, prioridad alta→baja (orden del ENUM); luego más recientes.
  const [rows] = await pool.execute<TaskRow[]>(
    `SELECT ${COLUMNS} FROM tasks WHERE ${where.join(" AND ")}
      ORDER BY due_date ASC, priority ASC, created_at DESC, id ASC`,
    params,
  );
  return rows.map(toTask);
}

export async function getTask(pool: Pool, userId: string, id: string): Promise<Task | null> {
  const [rows] = await pool.execute<TaskRow[]>(`SELECT ${COLUMNS} FROM tasks WHERE id = ? AND user_id = ? LIMIT 1`, [id, userId]);
  return rows[0] ? toTask(rows[0]) : null;
}

export type CreateResult = { ok: true; task: Task } | { ok: false; reason: "limit" | "no_user" };

/**
 * Crea una tarea respetando el máximo por usuario incluso con peticiones simultáneas:
 * la transacción bloquea la fila del usuario (`SELECT … FOR UPDATE`), de modo que las
 * creaciones del mismo usuario se serializan; el recuento se hace ya con el bloqueo.
 */
export async function createTaskWithLimit(
  pool: Pool,
  userId: string,
  id: string,
  input: TaskInput,
  now: Date,
  maxPerUser: number,
): Promise<CreateResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.execute<RowDataPacket[]>("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (users.length === 0) {
      await conn.rollback();
      return { ok: false, reason: "no_user" };
    }
    const [counts] = await conn.execute<(RowDataPacket & { n: number })[]>("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?", [userId]);
    if (counts[0]!.n >= maxPerUser) {
      await conn.rollback();
      return { ok: false, reason: "limit" };
    }
    const completedAt = input.status === "completada" ? now : null;
    await conn.execute(
      `INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, input.title, input.description, input.dueDate, input.priority, input.status, now, now, completedAt],
    );
    await conn.commit();
    return {
      ok: true,
      task: {
        id,
        ...input,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: completedAt ? completedAt.toISOString() : null,
      },
    };
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Edición completa (regla de `updateTask` del frontend): `completed_at` se conserva si
 * ya estaba completada y sigue así, se fija a `now` si pasa a completada y se anula si deja de estarlo.
 */
export async function updateTask(pool: Pool, userId: string, id: string, input: TaskInput, now: Date): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE tasks
        SET completed_at = CASE WHEN ? = 'completada' THEN COALESCE(completed_at, ?) ELSE NULL END,
            title = ?, description = ?, due_date = ?, priority = ?, status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
    [input.status, now, input.title, input.description, input.dueDate, input.priority, input.status, now, id, userId],
  );
  return result.affectedRows > 0;
}

/**
 * Cambio de estado (regla de `changeStatus` del frontend): `completed_at = now` si el nuevo
 * estado es completada (aunque ya lo estuviera), y NULL en otro caso.
 */
export async function changeTaskStatus(pool: Pool, userId: string, id: string, status: Status, now: Date): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [status, status === "completada" ? now : null, now, id, userId],
  );
  return result.affectedRows > 0;
}

export async function deleteTask(pool: Pool, userId: string, id: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>("DELETE FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows > 0;
}
