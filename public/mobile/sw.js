/**
 * HesaTech Mobile Companion — Service Worker
 * Enables offline shell capability and fast asset caching.
 */

const CACHE_NAME = 'hesatech-mobile-v2';
const STATIC_ASSETS = [
  '/mobile/',
  '/mobile/index.html',
  '/mobile/mobile.css',
  '/mobile/mobile.js',
  '/mobile/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass API calls directly to network
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/mobile/index.html');
        }
      });
    })
  );
});
