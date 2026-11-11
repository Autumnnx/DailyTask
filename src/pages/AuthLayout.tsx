import type { ReactNode } from "react";
import { Logo } from "../components/Logo";

const SAMPLE_TASKS = [
  { text: "Repasar Sistemas Operativos", done: true },
  { text: "Entregar el informe de Redes", done: true },
  { text: "Estudiar para el parcial", done: false },
  { text: "Subir el proyecto a GitHub", done: false },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="auth">
      <aside className="auth__aside">
        <Logo light />
        <div className="auth__pitch">
          <h1>Tu día, en orden.</h1>
          <p>Registra lo que tienes que hacer, ordénalo por estado y prioridad, y tacha lo que ya terminaste.</p>
          <ul className="auth__list" aria-hidden="true">
            {SAMPLE_TASKS.map((t) => (
              <li key={t.text} className={t.done ? "is-done" : ""}>
                <span className="auth__tick">{t.done && "✓"}</span>
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="auth__panel">
        <div className="auth__card">
          <div className="auth__mobile-logo"><Logo /></div>
          <h2>{title}</h2>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
