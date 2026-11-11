import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";

export function Navbar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initial = user.name.trim().charAt(0).toUpperCase();

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Logo light />
        <div className="navbar__user">
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="navbar__name">{user.name}</span>
          <button type="button" className="btn btn--ghost-light" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
