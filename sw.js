/* Keeps the app working with no internet. Change VERSION when you upload new app files. */
var VERSION = 'eggman-v1.2.2';
var FILES = ['./', 'index.html', 'styles.css', 'config.js', 'calc.js', 'core.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

self.addEventListener('install', function (e) {
  // Save each file on its own, so one missing file never stops the app working offline.
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // syncing with Google always goes to the network
  var url = new URL(req.url);
  var isApp = url.origin === self.location.origin;
  var isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!isApp && !isFont) return;
  // config.js and the page itself: always try the internet first, so a new link/key or update shows at once.
  if (isApp && (req.mode === 'navigate' || /config\.js$/.test(url.pathname))) {
    e.respondWith(caches.open(VERSION).then(function (cache) {
      return fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(function () { return cache.match(req, { ignoreSearch: true }).then(function (hit) { return hit || cache.match('index.html'); }); });
    }));
    return;
  }
  // Everything else: show the saved copy at once (fast, works offline) and refresh it in the background.
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: isApp }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined); });
      return hit || net;
    });
  }));
});
