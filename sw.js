// GameVerse service worker — cache-first for same-origin GETs (app shell + game modules),
// except the game catalogue (js/data.js) which is network-first so new games always appear.
// Bump V on every release so returning visitors fetch fresh files.
const V = 'gv-v5';
const CORE = [
  './', './index.html', './style.css', './manifest.json',
  './js/main.js', './js/utils.js', './js/profile.js', './js/theme.js',
  './js/api.js', './js/config.js', './js/data.js', './js/quests.js', './js/push.js',
  './js/games/snake.js', './js/games/memory.js', './js/games/tictac.js',
  './js/games/blaster.js', './js/games/runner.js', './js/games/simon.js',
  './js/games/breakout.js', './js/games/merge.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if(e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if(u.origin !== location.origin) return;
  if(u.pathname.startsWith('/api/')) return; // never cache API
  if(u.pathname.endsWith('/sw.js') || u.pathname.endsWith('/js/data.js')){
    // game catalogue: network-first so newly added games always show up
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(V).then(cc => cc.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(cc => cc.put(e.request, copy));
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try{ data = e.data ? e.data.json() : {}; }catch{}
  e.waitUntil(self.registration.showNotification(data.title || 'GameVerse 🔥', {
    body: data.body || 'Your streak and daily challenge are waiting!',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'gameverse',
    data: {url: data.url || './'},
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow((e.notification.data && e.notification.data.url) || './'));
});
