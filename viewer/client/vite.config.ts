import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5373,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.LEXICON_VIEWER_API_PORT || 5374}`,
    },
  },
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});
