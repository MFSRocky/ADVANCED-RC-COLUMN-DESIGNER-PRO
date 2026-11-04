/* Offline cache. Version bumped to invalidate stale shells from earlier builds. */
const CACHE = 'rcdp-v3-20261104-2';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './src/ui/styles.css?v=20261104-2', './src/ui/app.js?v=20261104-2',
  './src/ui/components.js', './src/ui/charts.js',
  './vendor/jspdf.umd.min.js', './assets/icons/app-icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations: network-first so a deployed fix is never hidden by an old cached shell.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) { const cache = await caches.open(CACHE); cache.put('./index.html', resp.clone()); }
        return resp;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Assets: cache-first with background revalidation.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async resp => {
      if (resp.ok) { const cache = await caches.open(CACHE); cache.put(req, resp.clone()); }
      return resp;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
