import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// La API (server/) escucha en 127.0.0.1:3000. En desarrollo, Vite reenvía /api a ella
// para que frontend y API compartan origen (cookies de sesión sin CORS).
// En producción el frontend usa las mismas rutas relativas /api.
const apiProxy = {
    "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
};

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
});
