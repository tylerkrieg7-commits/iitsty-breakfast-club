/* Iitstys Breakfast Club: offline support.
   Bump CACHE_VERSION whenever you upload new files so phones refresh their saved copy.
   (Synced photos and videos are not kept here; they live in the app's own photo storage.) */
const CACHE_VERSION = "v3";
const CACHE = "breakfast-club-" + CACHE_VERSION;
const CORE = [
  "./",
  "./index.html",
  "./bc-assets.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("breakfast-club-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* each page is saved under its own address (before, every page was saved as index.html) */
const pageKey = (req) => { const u = new URL(req.url); u.search = ""; u.hash = ""; if (u.pathname.endsWith("/")) u.pathname += "index.html"; return u.href; };

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Pages: network first so updates arrive, the saved copy when offline.
  if (req.mode === "navigate") {
    const key = pageKey(req);
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; })
        .catch(() => caches.match(key).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Scripts: the saved copy right away, refreshed in the background for next time.
  if (/\.js$/.test(new URL(req.url).pathname)) {
    event.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }

  // Everything else: saved copy first, then network (and save it for next time).
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
