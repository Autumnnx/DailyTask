import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Priority, Status, Task, TaskInput } from "../types";
import { PRIORITIES, STATUSES } from "../utils/constants";
import { todayISO } from "../utils/dates";
import { validateTask, type FieldErrors } from "../utils/validators";

type TaskFields = "title" | "description" | "dueDate";

/** Resultado de guardar: el modal solo se cierra (desde el padre) si `ok`. */
export type SubmitResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string> };

interface Props {
  open: boolean;
  /** Si se pasa una tarea, el formulario funciona en modo edición. */
  task?: Task | null;
  onSubmit: (input: TaskInput) => Promise<SubmitResult>;
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
  const [errors, setErrors] = useState<FieldErrors<TaskFields>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
      setFormError("");
      setSaving(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, task]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found = validateTask(form);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    if (!result.ok) {
      // Se conservan los datos introducidos y se muestra el motivo.
      const fieldErrors: FieldErrors<TaskFields> = {};
      for (const key of ["title", "description", "dueDate"] as const) {
        if (result.fields?.[key]) fieldErrors[key] = result.fields[key];
      }
      setErrors(fieldErrors);
      setFormError(result.error);
    }
  }

  function close() {
    if (!saving) onClose();
  }

  const isEditing = Boolean(task);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
    >
      <form className="dialog__body" onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <h2 className="dialog__title">{isEditing ? "Editar tarea" : "Nueva tarea"}</h2>
        {formError && <p className="form-error" role="alert">{formError}</p>}

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
          <button type="button" className="btn btn--secondary" onClick={close} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
