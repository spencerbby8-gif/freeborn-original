/* Freeborn service worker — minimal by design.
   It exists so Freeborn is installable as a web app (PWA): web-first, no
   app-store dependency. Network-first passthrough — no offline caching
   claims, no stale content. */
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  /* Passthrough — the network is the source of truth. */
});
