import type { Status, Task } from "../types";
import { PRIORITY_LABEL, STATUSES } from "../utils/constants";
import { daysUntil, describeDueDate } from "../utils/dates";

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (id: string, status: Status) => void;
}

export function TaskCard({ task, onEdit, onDelete, onStatusChange }: Props) {
  const done = task.status === "completada";
  const overdue = !done && daysUntil(task.dueDate) < 0;

  return (
    <article className={`task priority-${task.priority} ${done ? "task--done" : ""}`}>
      <div className="task__top">
        <button
          type="button"
          className={`check ${done ? "check--on" : ""}`}
          onClick={() => onStatusChange(task.id, done ? "pendiente" : "completada")}
          aria-label={done ? `Reabrir la tarea ${task.title}` : `Marcar como completada la tarea ${task.title}`}
          aria-pressed={done}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
        <h3 className="task__title">{task.title}</h3>
      </div>

      {task.description && <p className="task__desc">{task.description}</p>}

      <div className="task__meta">
        <span className={`chip chip--${task.priority}`}>Prioridad {PRIORITY_LABEL[task.priority].toLowerCase()}</span>
        <span className={`due ${overdue ? "due--overdue" : ""}`}>{done ? "Completada" : describeDueDate(task.dueDate)}</span>
      </div>

      <div className="task__actions">
        <label className="visually-hidden" htmlFor={`status-${task.id}`}>Cambiar estado</label>
        <select
          id={`status-${task.id}`}
          className="select-mini"
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="task__buttons">
          <button type="button" className="btn btn--text" onClick={() => onEdit(task)}>
            Editar
          </button>
          <button type="button" className="btn btn--text btn--text-danger" onClick={() => onDelete(task)}>
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}
