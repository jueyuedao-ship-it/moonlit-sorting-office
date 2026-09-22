const CACHE_NAME = 'moonlit-sorting-office-v1';
const CACHE_PREFIX = 'moonlit-sorting-office-';
const APP_SHELL = [
  './', './index.html', './styles.css', './src/app.js', './src/game.js',
  './src/storage.js', './src/presenter.js', './src/pwa.js',
  './manifest.webmanifest', './assets/icon-180.png',
  './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()).catch(() => {}))
            .then(() => response);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallbackUrl = new URL('./index.html', self.registration.scope).href;
          const fallback = await caches.match(fallbackUrl);
          if (fallback) return fallback;
        }
        throw new Error('Network request failed and no cached response is available');
      })
  );
});
