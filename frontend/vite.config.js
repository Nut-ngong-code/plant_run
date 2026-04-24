import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite proxies /api and /health to the Express backend during dev,
// so the frontend calls same-origin paths (avoids CORS hassles).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
