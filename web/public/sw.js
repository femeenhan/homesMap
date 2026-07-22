const CACHE = 'homesmap-shell-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // API/동기화 요청은 건드리지 않음. 정적 문서/스크립트만 stale-while-revalidate.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith((async () => {
    const cached = await caches.match(e.request)
    const net = fetch(e.request).then(async (res) => {
      const c = await caches.open(CACHE); c.put(e.request, res.clone()); return res
    }).catch(() => cached)
    return cached || net
  })())
})
