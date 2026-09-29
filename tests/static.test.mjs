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
    for(const [f, fn] of [['snake','mountSnake'],['memory','mountMemory'],['tictac','mountTicTac'],['blaster','mountBlaster'],['runner','mountRunner'],['simon','mountSimon']]){
      const src = read(`js/games/${f}.js`);
      assert.ok(src.includes(`export function ${fn}`), f);
      assert.ok(!src.includes('function openGame'), f + ' must not own the shell');
    }
  });
  it('game modules only talk to the app through env (no cross-imports)', () => {
    for(const f of ['snake','memory','tictac','blaster','runner','simon']){
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
    assert.ok(html.includes('href="/privacy.html"') && html.includes('href="/terms.html"'));
    assert.ok(!html.includes('<a href="#">'));
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
