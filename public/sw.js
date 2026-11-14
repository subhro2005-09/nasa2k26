// App-shell cache: repeat visits and offline demos cost the server nothing.
// Cesium assets and cross-origin NASA tiles are intentionally left to the browser HTTP cache.
const C = 'ares-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.add('/'))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/cesium/') || u.pathname === '/mars-atlas.html') return;
  e.respondWith(caches.open(C).then(async (c) => {
    const hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit || c.match('/'));
    return hit || net;
  }));
});
