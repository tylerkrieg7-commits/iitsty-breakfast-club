/* Iitstys Breakfast Club: offline support.
   Bump CACHE_VERSION whenever you upload new files so phones refresh their saved copy.
   (Synced photos and videos are not kept here; they live in the app's own photo storage.) */
const CACHE_VERSION = "v15";
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
    caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())
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
      fetch(req, { cache: "no-cache" })
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; })
        .catch(() => caches.match(key).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Scripts: the newest copy when online (so updates show up right away), the saved copy when offline.
  if (/\.js$/.test(new URL(req.url).pathname)) {
    event.respondWith(fetch(req, { cache: "no-cache" })
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req)));
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

/* Notifications from your partner (sent by Supabase when a note, cheer, swap or gift arrives) */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "Breakfast Club", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Breakfast Club", {
    body: d.body || "",
    tag: d.tag || "club",
    icon: "icon-192.png",
    badge: "icon-192.png",
    vibrate: Array.isArray(d.vibrate) ? d.vibrate : undefined,
    data: { url: d.url || "./index.html#mail", kind: d.kind || "" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./index.html#mail", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const home = list.find((c) => { const p = new URL(c.url).pathname; return p.endsWith("/") || p.endsWith("/index.html"); });
    if (home) { home.postMessage({ type: "club-open-mail" }); return home.focus(); }
    return self.clients.openWindow(target);
  }));
});
