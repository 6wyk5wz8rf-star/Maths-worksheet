// Change this namespace for every release that changes the offline shell.
// The prefix is deliberately product-specific so activation never removes
// unrelated caches that happen to share the same origin.
const CACHE_PREFIX = 'maths-page-studio-';
const CACHE = `${CACHE_PREFIX}release-v4`;
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './css/styles.css?v=release-v4',
  './js/app.js',
  './js/app.js?v=release-v4',
  './js/parser.js',
  './js/question-intelligence.js',
  './js/build2-model-bank.js',
  './js/matcher.js',
  './js/model-registry.js',
  './js/model-renderers.js',
  './js/build2-model-renderers.js',
  './js/worksheet-architecture.js',
  './js/worksheet-architecture.js?v=release-v4',
  './js/worksheet-versions.js',
  './js/worksheet-versions.js?v=release-v4',
  './js/number-variation.js',
  './js/number-variation.js?v=release-v4',
  './js/state.js',
  './js/state.js?v=release-v4',
  './js/pagination.js',
  './js/pagination.js?v=release-v4',
  './assets/icon.svg',
  './manifest.webmanifest'
];

const OFFLINE_DOCUMENT = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        } catch {
          // A full or unavailable cache must never discard a valid network response.
        }
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const documentFallback = await caches.match(OFFLINE_DOCUMENT);
        if (documentFallback) return documentFallback;
      }
      return Response.error();
    }
  })());
});
