const CACHE_NAME = 'boox-v1';
const PRECACHE = [
  '/apps/boox/',
  '/apps/boox/css/app.css',
  '/apps/boox/js/api.js',
  '/apps/boox/js/s3.js',
  '/apps/boox/js/reader.js',
  '/apps/boox/js/app.js',
  '/apps/boox/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Don't cache API calls or external resources
  if (url.pathname.startsWith('/apps/boox/api') ||
      url.origin !== self.location.origin) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
