/** Genera un identificador único. */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/**
 * Hash SHA-256 de (sal + contraseña). Evita guardar contraseñas en texto plano.
 * Nota: al no existir backend, esto es una simulación didáctica de autenticación.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (crypto.subtle) {
    return toHex(await crypto.subtle.digest("SHA-256", data));
  }
  // Respaldo para contextos no seguros (http) donde crypto.subtle no existe.
  let hash = 5381;
  for (const byte of data) hash = ((hash << 5) + hash + byte) >>> 0;
  return `fallback-${hash.toString(16)}`;
}
