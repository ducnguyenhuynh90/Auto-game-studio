// Mắm Village service worker: instant repeat loads and offline play on self-hosted builds.
// Hashed build assets never change, so they are cache-first; the page itself is network-first
// (so players get updates), falling back to the cached copy when offline.
// Filled in at build time (vite.config.ts): every emitted file, and a version that changes per build.
const PRECACHE = self.__PRECACHE__;
const CACHE = `mam-${self.__VERSION__}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.includes('/assets/')) {
    // immutable, content-hashed files
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  // pages and other files: fresh when online, cached when not
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
