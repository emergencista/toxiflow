/* service-worker.js — TOKBASE
   Cache versionado + atualização rápida (evita “versão antiga presa” no iPhone/Safari)
*/

const CACHE_VERSION = 'v6'; // ← INCREMENTE quando atualizar o app
const CACHE_STATIC = `tokbase-static-${CACHE_VERSION}`;
const CACHE_HTML = `tokbase-html-${CACHE_VERSION}`;

// Para Workers/Pages no root, este scope normalmente é "/"
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const p = (path) => `${SCOPE}${path}`;

const PRECACHE_URLS = [
  p('/'),
  p('/index.html'),
  p('/manifest.json'),
  p('/service-worker.js'),
  p('/icons/apple-touch-icon.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('tokbase-') && k !== CACHE_STATIC && k !== CACHE_HTML)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

const isNavigationRequest = (req) =>
  req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // HTML: network-first
  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_HTML);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;

        const fallback = await caches.match(p('/index.html'));
        if (fallback) return fallback;

        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Assets: cache-first + stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_STATIC);
    const cached = await cache.match(req);

    if (cached) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch (_) {}
      })());
      return cached;
    }

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch (_) {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
