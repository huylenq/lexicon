// Build-time placeholders keep the shell and its hashed assets in one version.
const CACHE = "lexicon-shell-__BUILD_ID__";
const FILES = __PRECACHE_FILES__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  // Updates wait until existing windows close so their assets stay available.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && (key.startsWith("lexicon-") || key.startsWith("workbox-")))
        await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    // Models, source, and project registrations always come from the local server.
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({
      error: "Lexicon’s local server is unavailable. Start it and reload to open your projects.",
    }), { status: 503, headers: { "Content-Type": "application/json" } })));
    return;
  }
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () =>
      (await (await caches.open(CACHE)).match("/index.html")) || Response.error()));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith((async () =>
      (await (await caches.open(CACHE)).match(url.pathname)) || fetch(request))());
  }
});
