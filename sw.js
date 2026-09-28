// GameVerse service worker — cache-first for same-origin GETs (app shell + game modules).
const V = 'gv-v2';
const CORE = [
  './', './index.html', './style.css', './manifest.json',
  './js/main.js', './js/utils.js', './js/profile.js', './js/theme.js',
  './js/api.js', './js/data.js', './js/quests.js',
  './js/games/snake.js', './js/games/memory.js', './js/games/tictac.js',
  './js/games/blaster.js', './js/games/runner.js', './js/games/simon.js',
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
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(cc => cc.put(e.request, copy));
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
