/** Convierte YYYY-MM-DD en un Date local (evita el desfase por zona horaria). */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDueDate(value: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(value));
}

/** Diferencia en días entre la fecha dada y hoy (negativo = ya venció). */
export function daysUntil(value: string): number {
  const today = parseLocalDate(todayISO()).getTime();
  const due = parseLocalDate(value).getTime();
  return Math.round((due - today) / 86_400_000);
}

export function describeDueDate(value: string): string {
  const diff = daysUntil(value);
  if (diff === 0) return "Vence hoy";
  if (diff === 1) return "Vence mañana";
  if (diff === -1) return "Venció ayer";
  if (diff < 0) return `Venció hace ${Math.abs(diff)} días`;
  if (diff <= 7) return `Vence en ${diff} días`;
  return formatDueDate(value);
}
