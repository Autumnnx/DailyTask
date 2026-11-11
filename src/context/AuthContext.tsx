import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SessionUser, User } from "../types";
import { STORAGE_KEYS, readJSON, removeKey, writeJSON } from "../utils/storage";
import { createId, createSalt, hashPassword } from "../utils/crypto";

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toSessionUser(user: User): SessionUser {
  return { id: user.id, name: user.name, email: user.email };
}

function loadSessionUser(): SessionUser | null {
  const sessionId = readJSON<string | null>(STORAGE_KEYS.session, null);
  if (!sessionId) return null;
  const users = readJSON<User[]>(STORAGE_KEYS.users, []);
  const found = users.find((u) => u.id === sessionId);
  return found ? toSessionUser(found) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loadSessionUser);

  const register = useCallback<AuthContextValue["register"]>(async (name, email, password) => {
    const users = readJSON<User[]>(STORAGE_KEYS.users, []);
    const normalizedEmail = email.trim().toLowerCase();
    if (users.some((u) => u.email === normalizedEmail)) {
      return { ok: false, error: "Ya existe una cuenta con ese correo. Inicia sesión." };
    }
    const salt = createSalt();
    const newUser: User = {
      id: createId(),
      name: name.trim(),
      email: normalizedEmail,
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    writeJSON(STORAGE_KEYS.users, [...users, newUser]);
    writeJSON(STORAGE_KEYS.session, newUser.id);
    setUser(toSessionUser(newUser));
    return { ok: true };
  }, []);

  const login = useCallback<AuthContextValue["login"]>(async (email, password) => {
    const users = readJSON<User[]>(STORAGE_KEYS.users, []);
    const found = users.find((u) => u.email === email.trim().toLowerCase());
    const hash = found ? await hashPassword(password, found.salt) : null;
    if (!found || hash !== found.passwordHash) {
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }
    writeJSON(STORAGE_KEYS.session, found.id);
    setUser(toSessionUser(found));
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    removeKey(STORAGE_KEYS.session);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, register, login, logout }), [user, register, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
