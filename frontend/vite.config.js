import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite proxies /api and /health to the Express backend during dev,
// so the frontend calls same-origin paths (avoids CORS hassles).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail fast if 5173 is taken instead of silently sliding to 5174 — keeps
    // the OAuth redirect contract honest. Frontend also forwards its actual
    // origin in `?return_to=` so the backend can redirect back to whatever
    // port the dev server happens to bind to.
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor code so the login page doesn't pay for chart
        // libraries the user hasn't navigated to yet. Route-level lazy
        // loading in App.jsx already extracts Dashboard/History/AddDevice
        // into their own chunks; this further isolates shared vendors.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("react-dom")) return "vendor-react-dom";
          if (id.includes("/react/")) return "vendor-react";
          if (id.includes("axios")) return "vendor-axios";
          return "vendor";
        },
      },
    },
  },
});
