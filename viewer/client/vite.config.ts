import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@server": resolve(import.meta.dirname, "../server"),
    },
  },
  server: {
    port: 5273,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
});
