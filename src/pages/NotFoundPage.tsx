import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="empty empty--page">
      <h1>No encontramos esa página</h1>
      <p>La dirección no existe o fue movida.</p>
      <Link className="btn btn--primary" to="/">Volver al inicio</Link>
    </main>
  );
}
