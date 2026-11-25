// Makes the app open instantly: the page comes from the copy saved on the phone, and a newer version is
// fetched in the background (the app offers to switch to it). Everything else is cached on first use.
const CACHE = "checklist-v41";
const CORE = ["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/petrona-latin-400-normal.woff2", "fonts/petrona-latin-600-normal.woff2", "fonts/petrona-latin-700-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // open straight from the copy on the phone; check for a newer version in the background for next time
    const update = fetch(req, { cache: "no-store" }).then(async res => {
      if (!res.ok) return null;
      const cache = await caches.open(CACHE), old = await cache.match("index.html");
      const fresh = await res.clone().text(), before = old ? await old.text() : null;
      await cache.put("index.html", res.clone());
      if (before !== null && before !== fresh) {
        const all = await self.clients.matchAll({ type: "window" });
        all.forEach(c => c.postMessage("updated"));
      }
      return res;
    }).catch(() => null);
    e.waitUntil(update);
    e.respondWith(caches.match("index.html").then(hit => hit || update.then(r => r || Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
