import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/v1": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/mcp": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/health": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/ready": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/version": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/openapi.json": { target: "http://127.0.0.1:3000", changeOrigin: false }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    assetsDir: "assets"
  }
});
