/* Keeps the app working with no internet. Change VERSION when you upload new app files. */
var VERSION = 'eggman-v1.5.0';
var FILES = ['./', 'index.html', 'styles.css', 'config.js', 'calc.js', 'core.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable.png',
  'alarm-chime.mp3', 'alarm-marimba.mp3', 'alarm-rise.mp3', 'alarm-bell.mp3'];

self.addEventListener('install', function (e) {
  // Save each file on its own, so one missing file never stops the app working offline.
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // cache: 'reload' = always fetch fresh from GitHub, never an old copy kept by the browser
    return Promise.all(FILES.map(function (f) { return c.add(new Request(f, { cache: 'reload' })).catch(function () {}); }));
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
  // alarm sounds: always answer with the whole saved file (works offline, even when the player asks for a piece)
  if (isApp && /\/alarm-[a-z]+\.mp3$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(function (cache) { return cache.match(url.pathname.replace(/^.*\//, '')).then(function (hit) { return hit || cache.match(req, { ignoreSearch: true }).then(function (h2) { return h2 || fetch(url.href); }); }); }));
    return;
  }
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
        if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone()).catch(function () {}); // never a half file (206)
        return res;
      }).catch(function () { return hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined); });
      return hit || net;
    });
  }));
});
