import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Pantalla mínima mientras se comprueba la sesión al cargar (evita redirecciones prematuras). */
function SessionCheck() {
  return (
    <main className="empty empty--page" aria-busy="true">
      <p role="status">Cargando…</p>
    </main>
  );
}

/** Solo deja pasar a usuarios autenticados. */
export function ProtectedRoute() {
  const { user, status } = useAuth();
  if (status === "loading") return <SessionCheck />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Evita que un usuario con sesión vuelva a ver login/registro. */
export function PublicOnlyRoute() {
  const { user, status } = useAuth();
  if (status === "loading") return <SessionCheck />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}
