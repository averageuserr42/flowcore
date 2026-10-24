// FlowCore: офлайн-оболочка. Приложение — один HTML-файл, поэтому кэш маленький.
// HTML отдаётся по сети с фолбэком на кэш: так правки видны сразу, а без сети
// панель всё равно открывается.
const CACHE = 'flowcore-v1';
const ASSETS = ['./flowcore.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Запросы к Gemini и любые чужие адреса не кэшируем и не подменяем
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./flowcore.html', copy));
          return response;
        })
        .catch(() => caches.match('./flowcore.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request))
  );
});
