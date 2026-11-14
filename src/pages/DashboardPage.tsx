import { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Navbar } from "../components/Navbar";
import { TaskBoard } from "../components/TaskBoard";
import { DEFAULT_FILTERS, TaskFiltersBar } from "../components/TaskFiltersBar";
import { TaskFormModal, type SubmitResult } from "../components/TaskFormModal";
import { TaskStats } from "../components/TaskStats";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../hooks/useTasks";
import type { Status, Task, TaskFilters, TaskInput } from "../types";
import { ApiError, errorMessage } from "../utils/api";
import { filterTasks } from "../utils/taskUtils";

export function DashboardPage() {
  const { user } = useAuth();
  const { tasks, loading, loadError, reload, createTask, updateTask, changeStatus, deleteTask } = useTasks();

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  const visibleTasks = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const hasFilters = filters.search !== "" || filters.status !== "todas" || filters.priority !== "todas";

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  /** Solo cierra el modal si el servidor confirma la operación. */
  async function handleSubmit(input: TaskInput): Promise<SubmitResult> {
    try {
      if (editing) await updateTask(editing.id, input);
      else await createTask(input);
      setActionError("");
      closeForm();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error), fields: error instanceof ApiError ? error.fields : undefined };
    }
  }

  async function handleStatusChange(id: string, status: Status) {
    try {
      await changeStatus(id, status);
      setActionError("");
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteTask(toDelete.id);
      setActionError("");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  const firstName = user?.name.trim().split(" ")[0] ?? "";

  return (
    <>
      <Navbar />
      <main className="dashboard">
        <div className="dashboard__head">
          <div>
            <h1>Hola, {firstName}</h1>
            <TaskStats tasks={tasks} />
          </div>
          <button type="button" className="btn btn--primary" onClick={openCreate} disabled={loading || Boolean(loadError)}>
            Nueva tarea
          </button>
        </div>

        <TaskFiltersBar filters={filters} onChange={setFilters} />

        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        {loading ? (
          <p className="results-note" role="status">Cargando tus tareas…</p>
        ) : loadError ? (
          <div className="empty">
            <h2>No pudimos cargar tus tareas</h2>
            <p>{loadError}</p>
            <button type="button" className="btn btn--secondary" onClick={() => void reload()}>Reintentar</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty">
            <h2>Tu lista está vacía</h2>
            <p>Crea tu primera tarea con título, fecha de vencimiento y prioridad.</p>
            <button type="button" className="btn btn--primary" onClick={openCreate}>Crear mi primera tarea</button>
          </div>
        ) : (
          <>
            {hasFilters && (
              <p className="results-note" role="status">
                {visibleTasks.length === 1 ? "1 tarea coincide" : `${visibleTasks.length} tareas coinciden`} con tu búsqueda.
              </p>
            )}
            <TaskBoard
              tasks={visibleTasks}
              filters={filters}
              onEdit={openEdit}
              onDelete={setToDelete}
              onStatusChange={(id, status) => void handleStatusChange(id, status)}
            />
          </>
        )}
      </main>

      <TaskFormModal open={formOpen} task={editing} onSubmit={handleSubmit} onClose={closeForm} />
      <ConfirmDialog
        open={toDelete !== null}
        title="¿Eliminar esta tarea?"
        message={toDelete ? `“${toDelete.title}” se eliminará de forma permanente.` : ""}
        confirmLabel="Eliminar tarea"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
