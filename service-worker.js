/* service-worker.js — TOKBASE
   Objetivo: evitar “versão antiga presa” (iPhone/Safari), com cache versionado e atualização rápida.
*/

const CACHE_VERSION = 'v4'; // ← INCREMENTE quando atualizar o app
const CACHE_STATIC = `tokbase-static-${CACHE_VERSION}`;
const CACHE_HTML = `tokbase-html-${CACHE_VERSION}`;

// Detecta o "scope" onde o SW está instalado (raiz ou subpasta tipo /repo/)
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/$/, ''); // ex.: "" ou "/toxbasic"

// Monta paths corretamente para raiz e subpasta
const p = (path) => `${SCOPE}${path}`;

// Arquivos essenciais para pré-cache (adicione/remova conforme seu repo real)
const PRECACHE_URLS = [
  p('/'),
  p('/index.html'),
  p('/manifest.json'),
  p('/service-worker.js'),

  // Ícones (ajuste se seus nomes forem outros)
  p('/icons/apple-touch-icon.png'),
  p('/icons/icon-192.png'),
  p('/icons/icon-512.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Pré-cache do essencial
    const cache = await caches.open(CACHE_STATIC);
    await cache.addAll(PRECACHE_URLS);

    // Ativa imediatamente (evita esperar fechar abas)
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove caches antigos
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('tokbase-') && k !== CACHE_STATIC && k !== CACHE_HTML)
        .map((k) => caches.delete(k))
    );

    // Assume controle imediato
    await self.clients.claim();
  })());
});

// Helper: identifica requisições de navegação (HTML “da página”)
const isNavigationRequest = (req) =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só intercepta http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1) NAVEGAÇÃO (HTML): network-first (puxa versão nova), fallback cache (offline)
  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        // Sempre tenta rede primeiro para não “grudar” em HTML antigo
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_HTML);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        // Offline / falha rede
        const cached = await caches.match(req);
        if (cached) return cached;

        // fallback para index.html cacheado (SPA/PWA)
        const fallback = await caches.match(p('/index.html'));
        if (fallback) return fallback;

        // Último recurso
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // 2) ASSETS (png, css, js, json etc.): cache-first, atualiza em background
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_STATIC);
    const cached = await cache.match(req);

    // Retorna cache se existir (rápido)
    if (cached) {
      // Atualiza em background (stale-while-revalidate)
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch (_) {}
      })());
      return cached;
    }

    // Se não tem cache, busca rede e salva
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch (_) {
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});

// Permite “forçar update” via mensagem (opcional)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
