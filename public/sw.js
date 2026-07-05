self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  // Simple network-first or pass-through strategy
  e.respondWith(fetch(e.request).catch(() => {
    return new Response("Offline mode is partially supported. Please check connection.");
  }));
});
