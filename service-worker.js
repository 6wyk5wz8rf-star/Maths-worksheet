// Change this namespace for every release that changes the offline shell.
// Keeping it separate from the repository name means an existing iPad install
// receives the complete Build 3 shell instead of retaining an earlier build.
const CACHE = 'maths-page-studio-build-3-v3';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/app.js?v=build3-v3',
  './js/parser.js',
  './js/question-intelligence.js',
  './js/build2-model-bank.js',
  './js/matcher.js',
  './js/model-registry.js',
  './js/model-renderers.js',
  './js/build2-model-renderers.js',
  './js/worksheet-architecture.js',
  './js/worksheet-architecture.js?v=build3-v3',
  './js/worksheet-versions.js',
  './js/worksheet-versions.js?v=build3-v3',
  './js/number-variation.js',
  './js/number-variation.js?v=build3-v3',
  './js/state.js',
  './js/state.js?v=build3-v3',
  './js/pagination.js',
  './js/pagination.js?v=build3-v3',
  './assets/icon.svg',
  './manifest.webmanifest'
];

const OFFLINE_DOCUMENT = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_DOCUMENT)))
  );
});
