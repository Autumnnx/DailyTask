import type { Pool, RowDataPacket } from "mysql2/promise";

/** Usuario tal como se expone al cliente (sin hash ni datos internos). */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  name: string;
  password_hash: string;
}

/** Acceso SQL a `users`. Todas las consultas son parametrizadas. */
export async function findUserByUsername(pool: Pool, username: string): Promise<(PublicUser & { passwordHash: string }) | null> {
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT id, username, name, password_hash FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  const row = rows[0];
  return row ? { id: row.id, username: row.username, name: row.name, passwordHash: row.password_hash } : null;
}

export async function insertUser(
  pool: Pool,
  user: PublicUser & { passwordHash: string },
  now: Date,
): Promise<"created" | "duplicate"> {
  try {
    await pool.execute(
      "INSERT INTO users (id, username, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [user.id, user.username, user.name, user.passwordHash, now, now],
    );
    return "created";
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return "duplicate";
    throw error;
  }
}

export async function updatePasswordHash(pool: Pool, userId: string, passwordHash: string, now: Date): Promise<void> {
  await pool.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [passwordHash, now, userId]);
}
