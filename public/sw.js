/*
 * Service Worker: macht die App offline nutzbar.
 * Beim Build trägt vite.config.ts (offlinePlugin) die Dateiliste und eine
 * Versionskennung ein – neue Version = neuer Cache, der alte wird gelöscht.
 */
const VERSION = '__VERSION__'
const FILES = '__PRECACHE__'
const PRECACHE = Array.isArray(FILES) ? FILES : []
const CACHE = `kleiderschrank-${VERSION}`
// KI-Modelle und ONNX-Laufzeit (vom CDN) legt transformers.js selbst im Cache
// "transformers-cache" ab – die fassen wir hier bewusst nicht an, sonst lägen
// ~100 MB doppelt auf dem Handy.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', ...PRECACHE]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('kleiderschrank-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function cacheFirst(req, cacheName) {
  return caches.match(req).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(cacheName).then((c) => c.put(req, copy))
        }
        return res
      }),
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin !== self.location.origin) return

  // Gebaute Dateien haben einen Hash im Namen und ändern sich nie -> Cache zuerst.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req, CACHE))
    return
  }

  // Seite selbst: Netz zuerst, damit Updates sofort ankommen – offline aus dem Cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined))
          .then((hit) => hit || new Response('Offline', { status: 503 })),
      ),
  )
})
