// Static integrity checks: module split, no dead entry, PWA assets, no JSON-DB writes.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('module split', () => {
  it('index.html boots the ES module entry, not the legacy file', () => {
    const html = read('index.html');
    assert.ok(html.includes('type="module" src="js/main.js"'));
    assert.ok(!html.includes('src="react.js"'));
  });
  it('react.js is a retired shim with no game code', () => {
    const shim = read('react.js');
    assert.ok(!shim.includes('function mount'));
    assert.ok(shim.length < 1000);
  });
  it('every game module exports its mount function', () => {
    for(const [f, fn] of [['snake','mountSnake'],['memory','mountMemory'],['tictac','mountTicTac'],['blaster','mountBlaster'],['runner','mountRunner'],['simon','mountSimon'],['breakout','mountBreakout'],['merge','mountMerge']]){
      const src = read(`js/games/${f}.js`);
      assert.ok(src.includes(`export function ${fn}`), f);
      assert.ok(!src.includes('function openGame'), f + ' must not own the shell');
    }
  });
  it('game modules only talk to the app through env (no cross-imports)', () => {
    for(const f of ['snake','memory','tictac','blaster','runner','simon','breakout','merge']){
      const src = read(`js/games/${f}.js`);
      assert.ok(!src.match(/^import /m), f + ' has imports');
    }
  });
});

describe('PWA + manifests', () => {
  it('manifest and icons are wired', () => {
    const html = read('index.html');
    assert.ok(html.includes('rel="manifest"'));
    assert.ok(html.includes('name="theme-color"'));
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.short_name, 'GameVerse');
    assert.ok(fs.existsSync(path.join(root, mf.icons[0].src)));
    assert.ok(fs.existsSync(path.join(root, 'sw.js')));
  });
});

describe('launch readiness', () => {
  it('footer links to real legal pages', () => {
    const html = read('index.html');
    assert.ok(html.includes('href="./privacy.html"') && html.includes('href="./terms.html"'));
    assert.ok(!html.includes('<a href="#">'));
    assert.ok(!html.match(/href="\/(?!api)[a-z]/));
    assert.ok(fs.existsSync(path.join(root, 'privacy.html')));
    assert.ok(fs.existsSync(path.join(root, 'terms.html')));
  });
  it('leaderboard has per-game tabs and premium avatars lock', () => {
    const html = read('index.html');
    assert.ok(html.includes('id="lbGame"'));
    const main = read('js/main.js');
    assert.ok(main.includes('AVATAR_LOCKS'));
    assert.ok(main.includes('avatarUnlocked'));
  });
  it('registration form carries a honeypot field', () => {
    assert.ok(read('index.html').includes('id="pWebsite"'));
  });
  it('deploy assets exist', () => {
    assert.ok(fs.existsSync(path.join(root, 'deploy/gameverse.service')));
    assert.ok(fs.existsSync(path.join(root, 'deploy/Caddyfile.example')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/verify-backup.mjs')));
  });
});

describe('mobile + auth ux', () => {
  it('bottom tab bar replaces hidden nav links', () => {
    const html = read('index.html');
    assert.ok(html.includes('class="tabbar"'));
    assert.ok(html.includes('data-tab="games"') && html.includes('data-tab="shop"'));
    assert.ok(read('style.css').includes('.tabbar-btn'));
    assert.ok(read('js/main.js').includes('.tabbar-btn'));
  });
  it('PIN field is masked with a toggle', () => {
    const html = read('index.html');
    assert.ok(html.includes('id="pPin" type="password"'));
    assert.ok(html.includes('id="pinToggle"'));
  });
  it('rival + reset use the non-blocking modal', () => {
    const html = read('index.html');
    assert.ok(html.includes('id="confirmModal"'));
    const main = read('js/main.js');
    assert.ok(main.includes('openConfirm'));
    assert.ok(!main.match(/prompt\(|confirm\(/));
  });
  it('API base defaults to same-origin with Pages fallback', () => {
    assert.ok(read('index.html').includes('<meta name="gv-api-base" content="">'));
    assert.ok(read('js/config.js').includes('github'));
  });
  it('manifest + SEO extras exist', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(mf.categories?.includes('games'));
    assert.ok(mf.screenshots?.length >= 1);
    assert.ok(read('index.html').includes('application/ld+json'));
  });
});

describe('split hosting', () => {
  it('all game API calls route through the configurable base', () => {
    const src = read('js/api.js');
    assert.ok(src.includes("from './config.js'"));
    const calls = [...src.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1].trim());
    assert.ok(calls.length >= 7, 'expected all API calls, got ' + calls.length);
    for(const c of calls) assert.ok(c.startsWith('apiUrl('), 'hardcoded path: ' + c);
  });
  it('admin panel uses the API base too', () => {
    const src = read('admin.html');
    assert.ok(src.includes('gv-api-base'));
    assert.ok(src.includes('apiBase()'));
    assert.ok(!src.includes("fetch('/api/"));
  });
  it('vercel.json keeps the worker fresh and JS cacheable', () => {
    const v = JSON.parse(read('vercel.json'));
    const sw = v.headers.find(h => h.source === '/sw.js');
    assert.ok(sw && JSON.stringify(sw).includes('no-cache'));
  });
});

describe('update delivery', () => {
  it('SW version matches the app bundle (stale clients get prompted)', () => {
    const sw = read('sw.js').match(/const V = '([^']+)'/);
    const app = read('js/main.js').match(/APP_SW_VERSION = '([^']+)'/);
    assert.ok(sw && app, 'version constants exist');
    assert.equal(sw[1], app[1]);
  });
  it('catalogue + worker itself bypass the cache', () => {
    const sw = read('sw.js');
    assert.ok(sw.includes('/js/data.js') && sw.includes('/sw.js'));
    assert.ok(read('js/main.js').includes('checkAppVersion'));
  });
  it('all games are precached', () => {
    const sw = read('sw.js');
    for(const f of ['snake','memory','tictac','blaster','runner','simon','breakout','merge'])
      assert.ok(sw.includes(`js/games/${f}.js`), f);
  });
});

describe('engagement + safety', () => {
  it('profile card offers push opt-in wired to push.js', () => {
    assert.ok(read('index.html').includes('id="pushBtn"'));
    const push = read('js/push.js');
    assert.ok(push.includes('togglePush') && push.includes('/api/push/subscribe'));
    assert.ok(read('js/main.js').includes('initPushUI'));
  });
  it('SW handles push notifications', () => {
    const sw = read('sw.js');
    assert.ok(sw.includes("addEventListener('push'") && sw.includes('showNotification'));
    assert.ok(sw.includes('notificationclick'));
  });
  it('moderation list exists and register enforces it', () => {
    const words = JSON.parse(read('data/badwords.json'));
    assert.ok(words.length >= 50);
    assert.ok(read('server.js').includes('isNameBlocked'));
  });
  it('reminder cron + timer ship with docs', () => {
    assert.ok(fs.existsSync(path.join(root, 'scripts/send-reminders.mjs')));
    assert.ok(fs.existsSync(path.join(root, 'deploy/gameverse-reminders.timer')));
  });
});

describe('ui/ux polish', () => {
  it('skip link, live toast region, and focus styles exist', () => {
    const html = read('index.html');
    assert.ok(html.includes('class="skip-link"'));
    assert.ok(html.includes('role="status"'));
    assert.ok(read('style.css').includes(':focus-visible'));
    assert.ok(read('style.css').includes('.skip-link'));
  });
  it('loading skeletons, card stagger, and score bump exist', () => {
    const css = read('style.css');
    assert.ok(css.includes('.lb-skeleton') && css.includes('shimmer'));
    assert.ok(css.includes('cardIn') && css.includes('scoreBump'));
    assert.ok(read('js/main.js').includes('lbSkeleton'));
    assert.ok(read('js/main.js').includes('score-bump'));
  });
});

describe('share + brand assets', () => {
  it('meta copy says eight games and social cards exist', () => {
    const html = read('index.html');
    assert.ok(!html.includes('six addictive browser games'));
    assert.ok(html.includes('eight addictive browser games'));
    for(const tag of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'twitter:card', 'twitter:image'])
      assert.ok(html.includes(tag), tag);
  });
  it('real icon files exist and manifest lists PNGs', () => {
    for(const f of ['icon-512.png', 'apple-touch-icon.png', 'og-image.png'])
      assert.ok(fs.existsSync(path.join(root, f)), f);
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(mf.icons.some(i => i.sizes === '512x512' && i.type === 'image/png'));
    assert.ok(mf.description.includes('eight'));
  });
});

describe('discovery + seo', () => {
  it('new games are flagged, badged, and featured', () => {
    const data = read('js/data.js');
    assert.ok(data.includes("id:'breakout'") && data.includes('isNew:true'));
    assert.ok(data.includes("id:'merge'") && data.includes('isNew:true'));
    const main = read('js/main.js');
    assert.ok(main.includes('NEW_UNTIL') && main.includes('card-new'));
    assert.ok(read('style.css').includes('.card-new'));
    assert.ok(read('js/quests.js').includes('q-newgames'));
  });
  it('seo files exist with correct content', () => {
    assert.ok(fs.existsSync(path.join(root, 'sitemap.xml')));
    assert.ok(fs.existsSync(path.join(root, 'robots.txt')));
    assert.ok(fs.existsSync(path.join(root, '404.html')));
    const sm = read('sitemap.xml');
    assert.ok(sm.includes('privacy.html'));
    assert.ok(sm.includes('gameverse-production-e0d6.up.railway.app') || sm.includes('GameVerse/'));
    const rb = read('robots.txt');
    assert.ok(rb.includes('Disallow: /admin.html') && rb.includes('Sitemap:'));
    assert.ok(read('404.html').includes('Back to GameVerse'));
  });
});

describe('backend hygiene', () => {
  it('server no longer read/writes database.json per request', () => {
    const src = read('server.js');
    assert.ok(!src.includes('loadDB()') || src.includes('node:sqlite'));
    assert.ok(!src.match(/saveDB\(db\)/));
    assert.ok(src.includes('node:sqlite'));
  });
  it('public user serializer strips secrets', () => {
    const src = read('server.js');
    const start = src.indexOf('function publicUser');
    const end = src.indexOf('\n}', start);
    const pub = src.slice(start, end);
    assert.ok(!pub.includes('pin_hash') && !pub.includes('token') && !pub.includes('last_ip'));
  });
});
