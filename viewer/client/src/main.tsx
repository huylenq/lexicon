import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { loader } from "@monaco-editor/react";
import "./styles/index.css";
import App from "./App";

// Self-host Monaco. Without this, @monaco-editor/react fetches the full
// editor bundle from cdn.jsdelivr.net at runtime — slow on cold start and
// broken offline. Workers come through Vite's ?worker loader so each one
// is bundled as its own chunk and served from the same origin.
//
// On top of self-hosting, we pre-warm: spawn one of each worker at boot
// and hand it to Monaco's first getWorker(label) call. First peek opens
// without paying worker spin-up; subsequent peeks fall back to spawning
// fresh, which is cheap once the chunk is cached.
type WorkerCtor = new () => Worker;
const workerCtors: Record<string, WorkerCtor> = {
  editor: editorWorker,
  json: jsonWorker,
  css: cssWorker,
  html: htmlWorker,
  typescript: tsWorker,
};
const prewarmed: Partial<Record<keyof typeof workerCtors, Worker>> = {};
const labelToKey = (label: string): keyof typeof workerCtors => {
  if (label === "json") return "json";
  if (label === "css" || label === "scss" || label === "less") return "css";
  if (label === "html" || label === "handlebars" || label === "razor") return "html";
  if (label === "typescript" || label === "javascript") return "typescript";
  return "editor";
};

self.MonacoEnvironment = {
  getWorker(_, label) {
    const key = labelToKey(label);
    const warmed = prewarmed[key];
    if (warmed) {
      prewarmed[key] = undefined;
      return warmed;
    }
    return new workerCtors[key]();
  },
};
loader.config({ monaco });

for (const key of Object.keys(workerCtors) as (keyof typeof workerCtors)[]) {
  prewarmed[key] = new workerCtors[key]();
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import { registerSW } from "virtual:pwa-register";
registerSW();
