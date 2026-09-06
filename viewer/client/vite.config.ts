import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const dist = resolve(import.meta.dirname, "dist");
export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  // Preserve ?url imports for the SDK's self-hosted JSON translations and fonts.
  optimizeDeps: { exclude: ["@tldraw/assets/imports.vite"] },
  plugins: [react(), {
    name: "lexicon-offline-shell",
    apply: "build",
    async closeBundle() {
      const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
        .filter((file) => file.isFile() && file.name !== "sw.js")
        .map((file) => resolve(file.parentPath, file.name).slice(dist.length))
        .sort();
      const hash = createHash("sha256");
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(resolve(dist, `.${file}`)));
      }
      const template = await readFile(resolve(import.meta.dirname, "sw.js"), "utf8");
      hash.update(template);
      await writeFile(resolve(dist, "sw.js"), template
        .replace("__BUILD_ID__", hash.digest("hex").slice(0, 16))
        .replace("__PRECACHE_FILES__", JSON.stringify(files)));
    },
  }],
  server: {
    host: "127.0.0.1",
    port: 5373,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.LEXICON_VIEWER_API_PORT || 5374}`,
    },
  },
  build: { outDir: dist, emptyOutDir: true },
});
