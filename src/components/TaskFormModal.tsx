import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Priority, Status, Task, TaskInput } from "../types";
import { PRIORITIES, STATUSES } from "../utils/constants";
import { todayISO } from "../utils/dates";
import { validateTask, type FieldErrors } from "../utils/validators";

interface Props {
  open: boolean;
  /** Si se pasa una tarea, el formulario funciona en modo edición. */
  task?: Task | null;
  onSubmit: (input: TaskInput) => void;
  onClose: () => void;
}

const emptyForm = (): TaskInput => ({
  title: "",
  description: "",
  dueDate: todayISO(),
  priority: "media",
  status: "pendiente",
});

export function TaskFormModal({ open, task, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors<"title" | "description" | "dueDate">>({});

  // Abre/cierra el <dialog> nativo y carga los datos de la tarea al abrir.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setForm(
        task
          ? {
              title: task.title,
              description: task.description,
              dueDate: task.dueDate,
              priority: task.priority,
              status: task.status,
            }
          : emptyForm(),
      );
      setErrors({});
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, task]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateTask(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(form);
  }

  const isEditing = Boolean(task);

  return (
    <dialog ref={ref} className="dialog" onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <h2 className="dialog__title">{isEditing ? "Editar tarea" : "Nueva tarea"}</h2>

        <div className="field">
          <label htmlFor="task-title">Título</label>
          <input
            id="task-title"
            type="text"
            value={form.title}
            maxLength={80}
            placeholder="Ej.: Entregar informe de Redes"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            aria-invalid={Boolean(errors.title)}
            autoFocus
          />
          {errors.title && <p className="field__error">{errors.title}</p>}
        </div>

        <div className="field">
          <label htmlFor="task-desc">Descripción</label>
          <textarea
            id="task-desc"
            rows={3}
            value={form.description}
            maxLength={400}
            placeholder="Detalles que quieras recordar (opcional)"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description && <p className="field__error">{errors.description}</p>}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="task-date">Fecha de vencimiento</label>
            <input
              id="task-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              aria-invalid={Boolean(errors.dueDate)}
            />
            {errors.dueDate && <p className="field__error">{errors.dueDate}</p>}
          </div>
          <div className="field">
            <label htmlFor="task-priority">Prioridad</label>
            <select
              id="task-priority"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-status">Estado</label>
          <select
            id="task-status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            {isEditing ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
