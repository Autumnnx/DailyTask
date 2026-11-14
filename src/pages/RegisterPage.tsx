import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validateRegister, type FieldErrors } from "../utils/validators";
import { AuthLayout } from "./AuthLayout";

type Keys = "name" | "username" | "password" | "confirm";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors<Keys>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: Keys) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setFormError("");
    const found = validateRegister(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const result = await register(form.username, form.name, form.password);
    setLoading(false);
    if (result.ok) {
      navigate("/", { replace: true });
      return;
    }
    // Errores por campo del servidor (p. ej. "Ese nombre de usuario ya está en uso.").
    const fieldErrors: FieldErrors<Keys> = {};
    for (const key of ["name", "username", "password"] as const) {
      if (result.fields?.[key]) fieldErrors[key] = result.fields[key];
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length === 0) setFormError(result.error ?? "No se pudo crear la cuenta.");
  }

  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Solo toma un minuto.">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="field">
          <label htmlFor="reg-name">Nombre</label>
          <input id="reg-name" type="text" autoComplete="name" value={form.name} onChange={update("name")} aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="field__error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="reg-username">Nombre de usuario</label>
          <input
            id="reg-username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={update("username")}
            aria-invalid={Boolean(errors.username)}
          />
          {errors.username && <p className="field__error">{errors.username}</p>}
        </div>
        <div className="field">
          <label htmlFor="reg-password">Contraseña</label>
          <input id="reg-password" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} aria-invalid={Boolean(errors.password)} />
          {errors.password && <p className="field__error">{errors.password}</p>}
        </div>
        <div className="field">
          <label htmlFor="reg-confirm">Confirmar contraseña</label>
          <input id="reg-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} aria-invalid={Boolean(errors.confirm)} />
          {errors.confirm && <p className="field__error">{errors.confirm}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>
      <p className="auth__switch">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </AuthLayout>
  );
}
