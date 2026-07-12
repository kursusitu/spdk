var CACHE = 'spdk-cache-v1.0.2';
var OFFLINE_URL = 'offline.html';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.add(OFFLINE_URL); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.endsWith('/version.json')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(OFFLINE_URL);
    })
  );
});
