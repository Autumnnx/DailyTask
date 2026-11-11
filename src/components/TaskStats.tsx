import type { Task } from "../types";
import { daysUntil } from "../utils/dates";

export function TaskStats({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completada").length;
  const overdue = tasks.filter((t) => t.status !== "completada" && daysUntil(t.dueDate) < 0).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="stats" aria-label="Resumen de tareas">
      <div className="stats__progress">
        <div className="stats__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de tareas completadas">
          <span style={{ width: `${percent}%` }} />
        </div>
        <p>
          {total === 0 ? "Aún no tienes tareas" : `${completed} de ${total} completadas (${percent}%)`}
        </p>
      </div>
      {overdue > 0 && (
        <p className="stats__alert">
          {overdue === 1 ? "1 tarea vencida" : `${overdue} tareas vencidas`}
        </p>
      )}
    </div>
  );
}
