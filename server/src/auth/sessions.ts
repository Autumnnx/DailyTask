import { createHash, randomBytes } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { PublicUser } from "./repository.ts";

/**
 * Sesiones de servidor con token opaco:
 * - Token aleatorio de 32 bytes (base64url) que solo viaja en la cookie.
 * - En MySQL se guarda únicamente su SHA-256 (`sessions.token_hash`).
 * - Caducidad por inactividad (deslizante) y absoluta (fija desde la creación).
 *   `idle_expires_at` nunca supera `absolute_expires_at`, así que basta con él
 *   para saber si una sesión ha caducado.
 */

export const SESSION_COOKIE = "dt_session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Frecuencia máxima con la que se actualiza `last_seen_at` (evita una escritura por petición). */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface SessionTtl {
  idleMs: number;
  absoluteMs: number;
}

export interface CreatedSession {
  token: string;
  absoluteExpiresAt: Date;
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export async function createSession(pool: Pool, userId: string, ttl: SessionTtl, now = new Date()): Promise<CreatedSession> {
  const token = randomBytes(32).toString("base64url");
  const absoluteExpiresAt = new Date(now.getTime() + ttl.absoluteMs);
  const idleExpiresAt = minDate(new Date(now.getTime() + ttl.idleMs), absoluteExpiresAt);
  await pool.execute(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [hashToken(token), userId, now, now, idleExpiresAt, absoluteExpiresAt],
  );
  return { token, absoluteExpiresAt };
}

interface SessionRow extends RowDataPacket {
  user_id: string;
  username: string;
  name: string;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

/**
 * Devuelve el usuario de una sesión válida, o `null`. Las sesiones caducadas se
 * borran al detectarlas. Si ha pasado el intervalo, renueva la caducidad por inactividad.
 */
export async function resolveSession(pool: Pool, token: string, ttl: SessionTtl, now = new Date()): Promise<PublicUser | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashToken(token);

  const [rows] = await pool.execute<SessionRow[]>(
    `SELECT s.user_id, u.username, u.name, s.last_seen_at, s.idle_expires_at, s.absolute_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;

  if (now >= row.idle_expires_at || now >= row.absolute_expires_at) {
    await pool.execute("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }

  if (now.getTime() - row.last_seen_at.getTime() >= TOUCH_INTERVAL_MS) {
    const idleExpiresAt = minDate(new Date(now.getTime() + ttl.idleMs), row.absolute_expires_at);
    await pool.execute("UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE token_hash = ?", [
      now,
      idleExpiresAt,
      tokenHash,
    ]);
  }

  return { id: row.user_id, username: row.username, name: row.name };
}

export async function revokeSession(pool: Pool, token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  await pool.execute("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

/** Borra las sesiones caducadas. Devuelve cuántas eliminó. */
export async function deleteExpiredSessions(pool: Pool, now = new Date()): Promise<number> {
  const [result] = await pool.execute("DELETE FROM sessions WHERE idle_expires_at <= ?", [now]);
  return (result as { affectedRows: number }).affectedRows;
}
