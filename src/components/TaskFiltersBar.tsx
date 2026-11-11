import type { Priority, Status, TaskFilters } from "../types";
import { PRIORITIES, STATUSES } from "../utils/constants";

interface Props {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

export const DEFAULT_FILTERS: TaskFilters = { search: "", status: "todas", priority: "todas" };

export function TaskFiltersBar({ filters, onChange }: Props) {
  const active = filters.search !== "" || filters.status !== "todas" || filters.priority !== "todas";

  return (
    <div className="filters" role="search">
      <div className="field filters__search">
        <label htmlFor="f-search">Buscar</label>
        <input
          id="f-search"
          type="search"
          placeholder="Título o descripción"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="f-status">Estado</label>
        <select
          id="f-status"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as Status | "todas" })}
        >
          <option value="todas">Todos</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-priority">Prioridad</label>
        <select
          id="f-priority"
          value={filters.priority}
          onChange={(e) => onChange({ ...filters, priority: e.target.value as Priority | "todas" })}
        >
          <option value="todas">Todas</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn--secondary filters__clear" disabled={!active} onClick={() => onChange(DEFAULT_FILTERS)}>
        Limpiar filtros
      </button>
    </div>
  );
}
