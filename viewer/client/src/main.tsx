import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import "./styles/pwa.css";
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .catch((error) => console.warn("Lexicon offline setup failed:", error));
  });
}
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  // The earlier Vite PWA worker can keep serving obsolete HTML even during HMR.
  // Retire only Lexicon's known root workers and their caches on the dev origin.
  void (async () => {
    const knownWorker = (url: string) => ["/dev-sw.js", "/sw.js"].includes(new URL(url).pathname);
    const controlled = navigator.serviceWorker.controller;
    let retired = false;
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      const worker = registration.active || registration.waiting || registration.installing;
      if (worker && knownWorker(worker.scriptURL) && new URL(registration.scope).pathname === "/")
        retired = (await registration.unregister()) || retired;
    }
    if (!retired) return;
    for (const key of await caches.keys())
      if (key.startsWith("lexicon-") || key.startsWith("workbox-")) await caches.delete(key);
    if (controlled && knownWorker(controlled.scriptURL)) window.location.reload();
  })().catch((error) => console.warn("Lexicon legacy cache cleanup failed:", error));
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
