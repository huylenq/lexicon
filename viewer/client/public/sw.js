// Retire the earlier reader's offline cache when an installed copy updates.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('workbox-') || key.startsWith('lexicon-')) await caches.delete(key);
  await self.registration.unregister();
  await self.clients.claim();
})()));
