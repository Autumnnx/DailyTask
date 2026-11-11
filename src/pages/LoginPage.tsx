import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validateLogin, type FieldErrors } from "../utils/validators";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    const found = validateLogin(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const result = await login(form.email, form.password);
    setLoading(false);
    if (result.ok) navigate("/", { replace: true });
    else setFormError(result.error ?? "No se pudo iniciar sesión.");
  }

  return (
    <AuthLayout title="Inicia sesión" subtitle="Entra para ver tus tareas.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="field">
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <p className="field__error">{errors.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password && <p className="field__error">{errors.password}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? "Entrando…" : "Iniciar sesión"}
        </button>
      </form>
      <p className="auth__switch">
        ¿Aún no tienes cuenta? <Link to="/registro">Crea una cuenta</Link>
      </p>
    </AuthLayout>
  );
}
