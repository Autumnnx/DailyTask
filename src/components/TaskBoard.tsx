import type { Status, Task, TaskFilters } from "../types";
import { STATUSES } from "../utils/constants";
import { sortTasks } from "../utils/taskUtils";
import { TaskCard } from "./TaskCard";

interface Props {
  tasks: Task[];
  filters: TaskFilters;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (id: string, status: Status) => void;
}

export function TaskBoard({ tasks, filters, onEdit, onDelete, onStatusChange }: Props) {
  // Si se filtra por un estado, solo se muestra esa columna.
  const columns = STATUSES.filter((s) => filters.status === "todas" || s.value === filters.status);

  return (
    <div className={`board board--${columns.length}`}>
      {columns.map((column) => {
        const items = sortTasks(tasks.filter((t) => t.status === column.value));
        return (
          <section key={column.value} className={`column column--${column.value}`} aria-labelledby={`col-${column.value}`}>
            <header className="column__header">
              <h2 id={`col-${column.value}`} className="column__title">{column.label}</h2>
              <span className="column__count">{items.length}</span>
            </header>
            <div className="column__list">
              {items.length === 0 ? (
                <p className="column__empty">Sin tareas aquí. {column.hint}.</p>
              ) : (
                items.map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
