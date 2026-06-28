// Málaga Live Weekly — minimal service worker (enables install; never caches the newsletter
// so the icon always opens the CURRENT week). Only the /weekly/ shell is cached for offline.
const C = "mlweekly-shell-v1";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["/weekly/", "/weekly/index.html"])));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  // Only handle navigations to the shell; the iframed /assets/newsletter/* is out of scope,
  // so it always hits the network and shows the freshest weekly edition.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/weekly/index.html")));
  }
});
