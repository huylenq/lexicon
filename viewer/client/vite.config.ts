import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // we register manually in main.tsx
      includeAssets: ["icon.svg", "icon-maskable.svg"],
      manifest: {
        name: "Lexicon",
        short_name: "Lexicon",
        description: "A reading room for a codebase's vocabulary.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "any",
        background_color: "#f0ead8",
        theme_color: "#f0ead8",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the shell + main bundle + fonts + Monaco workers and the
        // languages we actually open (yaml/json/markdown). Monaco ships
        // ~80 other language chunks that lazy-load on demand; those fall
        // through to runtimeCaching below.
        globPatterns: [
          "index.html",
          "assets/index-*.{js,css}",
          "assets/codicon-*.ttf",
          "assets/*.worker-*.js",
          "assets/yaml-*.js",
          "assets/jsonMode-*.js",
          "assets/markdown-*.js",
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // /api/* is dynamic + SSE — must never be cached or shell-fallback'd.
        navigateFallbackDenylist: [/^\/api\//],
        // ts.worker alone is ~6 MB; default cap is 2 MiB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.+\.js$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "lexicon-lazy-assets" },
          },
        ],
      },
      // devOptions.enabled keeps WCO + install testable in dev; the plugin
      // scopes the dev SW to play nice with Vite HMR.
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
        suppressWarnings: true,
      },
    }),
  ],
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
