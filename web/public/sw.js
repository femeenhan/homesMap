const CACHE = 'homesmap-shell-v1'
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // API/동기화 요청은 건드리지 않음. 정적 문서/스크립트만 stale-while-revalidate.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return
  if (url.pathname === '/version') return // 업데이트 체크는 항상 네트워크(캐시 우회)
  e.respondWith((async () => {
    const cached = await caches.match(e.request)
    const net = fetch(e.request).then(async (res) => {
      if (res.ok) { const c = await caches.open(CACHE); c.put(e.request, res.clone()) }
      return res
    }).catch(() => cached)
    return cached || net
  })())
})
