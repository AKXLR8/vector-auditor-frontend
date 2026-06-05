import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 3001,
    proxy: {
      "/auth": { target: "http://localhost:8000", changeOrigin: true },
      "/query": { target: "http://localhost:8000", changeOrigin: true },
      "/documents": { target: "http://localhost:8000", changeOrigin: true },
      "/uploads": { target: "http://localhost:8000", changeOrigin: true },
      "/feedback": { target: "http://localhost:8000", changeOrigin: true },
      "/sessions": { target: "http://localhost:8000", changeOrigin: true },
      "/admin": { target: "http://localhost:8000", changeOrigin: true },
      "/cache": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
