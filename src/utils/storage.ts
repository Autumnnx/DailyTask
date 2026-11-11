/**
 * Capa mínima de persistencia sobre localStorage.
 * Todas las lecturas/escrituras pasan por aquí para manejar errores en un solo lugar.
 */
export const STORAGE_KEYS = {
  users: "dailytask.users",
  tasks: "dailytask.tasks",
  session: "dailytask.session",
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado: la app sigue funcionando en memoria.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* sin acción */
  }
}
