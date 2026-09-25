import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` proxies API calls to a running ReWoo backend (python -m rewoo).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../rewoo/web/dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787", "/v1": "http://127.0.0.1:8787" },
  },
  test: { environment: "node" },
});
