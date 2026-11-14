import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "../types";
import { ApiError, api, errorMessage, setSessionExpiredHandler } from "../utils/api";
import { normalizeUsername } from "../utils/validators";

interface AuthResult {
  ok: boolean;
  error?: string;
  /** Errores por campo devueltos por el servidor (p. ej. username ya en uso). */
  fields?: Record<string, string>;
}

/** `loading`: se está comprobando la sesión con `/api/auth/me` al cargar la aplicación. */
type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  /** Aviso para la pantalla de login (p. ej. sesión caducada). */
  notice: string;
  register: (username: string, name: string, password: string) => Promise<AuthResult>;
  login: (username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_EXPIRED = "Tu sesión ha caducado. Inicia sesión de nuevo.";

function failure(error: unknown): AuthResult {
  return { ok: false, error: errorMessage(error), fields: error instanceof ApiError ? error.fields : undefined };
}

/**
 * Estado de autenticación respaldado por la API. La sesión es la cookie HttpOnly
 * `dt_session`: el navegador la envía sola y el frontend no guarda nada localmente.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState("");

  const signIn = useCallback((next: SessionUser) => {
    setUser(next);
    setStatus("authenticated");
    setNotice("");
  }, []);

  const signOutLocally = useCallback((message = "") => {
    setUser(null);
    setStatus("anonymous");
    setNotice(message);
  }, []);

  // Restaurar la sesión al cargar la aplicación.
  useEffect(() => {
    let active = true;
    api
      .get<{ user: SessionUser }>("/auth/me", { silentUnauthenticated: true })
      .then(({ user: current }) => active && signIn(current))
      // Sin sesión (401) o API no disponible: se muestra el login; la cookie, si existe, no se toca.
      .catch(() => active && signOutLocally());
    return () => {
      active = false;
    };
  }, [signIn, signOutLocally]);

  // Cualquier 401 posterior (sesión caducada o revocada) devuelve al login de forma controlada.
  useEffect(() => {
    setSessionExpiredHandler(() => signOutLocally(SESSION_EXPIRED));
    return () => setSessionExpiredHandler(null);
  }, [signOutLocally]);

  const register = useCallback<AuthContextValue["register"]>(
    async (username, name, password) => {
      try {
        const res = await api.post<{ user: SessionUser }>("/auth/register", {
          username: normalizeUsername(username),
          name: name.trim(),
          password,
        });
        signIn(res.user);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [signIn],
  );

  const login = useCallback<AuthContextValue["login"]>(
    async (username, password) => {
      try {
        const res = await api.post<{ user: SessionUser }>("/auth/login", { username: normalizeUsername(username), password });
        signIn(res.user);
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Si la API no responde, se cierra igualmente la sesión en la interfaz.
    }
    signOutLocally();
  }, [signOutLocally]);

  const value = useMemo(
    () => ({ user, status, notice, register, login, logout }),
    [user, status, notice, register, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
