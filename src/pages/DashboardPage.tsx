import { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Navbar } from "../components/Navbar";
import { TaskBoard } from "../components/TaskBoard";
import { DEFAULT_FILTERS, TaskFiltersBar } from "../components/TaskFiltersBar";
import { TaskFormModal } from "../components/TaskFormModal";
import { TaskStats } from "../components/TaskStats";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../hooks/useTasks";
import type { Task, TaskFilters, TaskInput } from "../types";
import { filterTasks } from "../utils/taskUtils";

export function DashboardPage() {
  const { user } = useAuth();
  // ProtectedRoute garantiza que hay usuario; el id vacío solo satisface al tipado.
  const { tasks, createTask, updateTask, changeStatus, deleteTask } = useTasks(user?.id ?? "");

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);

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

  function handleSubmit(input: TaskInput) {
    if (editing) updateTask(editing.id, input);
    else createTask(input);
    setFormOpen(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (toDelete) deleteTask(toDelete.id);
    setToDelete(null);
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
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Nueva tarea
          </button>
        </div>

        <TaskFiltersBar filters={filters} onChange={setFilters} />

        {tasks.length === 0 ? (
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
            <TaskBoard tasks={visibleTasks} filters={filters} onEdit={openEdit} onDelete={setToDelete} onStatusChange={changeStatus} />
          </>
        )}
      </main>

      <TaskFormModal
        open={formOpen}
        task={editing}
        onSubmit={handleSubmit}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="¿Eliminar esta tarea?"
        message={toDelete ? `“${toDelete.title}” se eliminará de forma permanente.` : ""}
        confirmLabel="Eliminar tarea"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
