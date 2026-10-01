// GameVerse smoke tests: anti-cheat math, PIN hashing, quest rotation, HTTP API.
// Run: npm test
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

process.env.GAMEVERSE_NO_LISTEN = '1';
process.env.GAMEVERSE_NO_MIGRATE = '1';
process.env.GAMEVERSE_NO_BACKUP = '1';
// temp VAPID keys for the spawned API server (push endpoints)
import webpushLib from 'web-push';
const TEST_VAPID = webpushLib.generateVAPIDKeys();
process.env.VAPID_PUBLIC = TEST_VAPID.publicKey;
process.env.VAPID_PRIVATE = TEST_VAPID.privateKey;
const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-test-')), 'test.db');
process.env.GAMEVERSE_DB = tmpDb;

const server = await import('../server.js');
const quests = await import('../js/quests.js');

describe('anti-cheat (applyStatsUpdate)', () => {
  it('clamps a cheat payload to caps', () => {
    const u = {xp:0, played:0, wins:0, best:{}};
    const out = server.applyStatsUpdate(u, {xp:99999, played:99, wins:99, best:{snake:99999}, action:'x', score:99999, xp_earned:9999, gameId:'snake'});
    assert.equal(out.clamped, true);
    assert.equal(out.patch.xp, server.MAX_XP_PER_HIT);
    assert.equal(out.patch.played, 1);
    assert.equal(out.patch.wins, 1);
    assert.equal(JSON.parse(out.patch.best).snake, server.MAX_SCORE.snake);
    assert.equal(out.activity.score, server.MAX_SCORE.snake);
    assert.equal(out.activity.xp_earned, server.MAX_XP_PER_HIT);
  });
  it('passes a legit payload through untouched', () => {
    const u = {xp:100, played:2, wins:1, best:{}};
    const out = server.applyStatsUpdate(u, {xp:180, played:3, wins:2, best:{snake:120}, score:120, xp_earned:80, gameId:'snake'});
    assert.equal(out.clamped, false);
    assert.deepEqual(out.patch, {xp:180, played:3, wins:2, best:'{"snake":120}'});
  });
  it('ignores XP rollbacks without crashing', () => {
    const out = server.applyStatsUpdate({xp:400, played:1, wins:1, best:{}}, {xp:150, played:1, wins:1});
    assert.equal(out.patch.xp, undefined);
  });
  it('accumulates coin grants additively', () => {
    const u = {xp:0, played:0, wins:0, best:{}, coins:0};
    assert.equal(server.applyStatsUpdate(u, {coins:60}).patch.coins, 60);
    assert.equal(server.applyStatsUpdate({...u, coins:60}, {coins:50}).patch.coins, 110);
    assert.equal(server.applyStatsUpdate({...u, coins:60}, {coins:500}).patch.coins, undefined);
  });
  it('does not mutate inputs', () => {
    const u = {xp:0, played:0, wins:0, best:{}};
    const body = {xp:99999, best:{snake:99999}, gameId:'snake'};
    server.applyStatsUpdate(u, body);
    assert.deepEqual(u, {xp:0, played:0, wins:0, best:{}});
    assert.equal(body.xp, 99999);
  });
});

describe('PIN hashing', () => {
  it('round-trips and rejects wrong PINs', () => {
    const h = server.hashPin('1234');
    assert.ok(h.includes(':'));
    assert.equal(server.verifyPin('1234', h), true);
    assert.equal(server.verifyPin('0000', h), false);
    assert.equal(server.verifyPin('1234', 'garbage'), false);
  });
});

describe('quest rotation', () => {
  it('picks 3 deterministic unique dailies per date', () => {
    const a = quests.pickDaily('2026-09-26').map(q => q.id);
    const b = quests.pickDaily('2026-09-26').map(q => q.id);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, 3);
  });
  it('rotates across dates', () => {
    const days = ['2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28'].map(d => quests.pickDaily(d).map(q => q.id).join(','));
    assert.ok(new Set(days).size > 1, 'expected rotation across 5 days');
  });
  it('formats ISO week keys', () => {
    assert.match(quests.weekKey(new Date('2026-09-26T12:00:00Z')), /^\d{4}-W\d{2}$/);
  });
  it('parses challenge links and clamps scores', () => {
    assert.deepEqual(quests.parseChallenge('?challenge=snake-120-Alex'), {game:'snake', score:120, name:'Alex'});
    assert.equal(quests.parseChallenge('?challenge=snake-99999-Alex').score, 5000);
    assert.equal(quests.parseChallenge(''), null);
  });
});

describe('HTTP API', () => {
  const PORT = 3459;
  const BASE = `http://localhost:${PORT}`;
  let child, token, uid;
  before(async () => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      // NOTE: parent sets GAMEVERSE_NO_LISTEN=1 for the unit import above —
      // the child server must NOT inherit it or it will never listen.
      env: {...process.env, GAMEVERSE_NO_LISTEN: '', PORT: String(PORT), ADMIN_KEY: 'testkey123', GAMEVERSE_DB: tmpDb, GAMEVERSE_NO_MIGRATE: '1', GAMEVERSE_NO_BACKUP: '1'},
      stdio: 'ignore',
    });
    const t0 = Date.now();
    for(;;){
      try{ const r = await fetch(BASE + '/api/stats/summary'); if(r.ok) break; }catch{}
      if(Date.now() - t0 > 15000) throw new Error('server did not boot');
      await new Promise(r => setTimeout(r, 200));
    }
  });
  after(() => { child?.kill(); });

  it('registers and rejects wrong PIN', async () => {
    let r = await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'SmokeUser', avatar:'⚡', genre:'Arcade', pin:'1234'})});
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.token);
    assert.equal(j.user.pin, undefined);
    assert.equal(j.user.pin_hash, undefined);
    assert.equal(j.user.token, undefined);
    uid = j.user.id; token = j.token;
    r = await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'SmokeUser', pin:'0000'})});
    assert.equal(r.status, 403);
  });
  it('rejects blocked names but allows innocent lookalikes', async () => {
    const reg = (username) => fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, pin:'1234'})});
    assert.equal((await reg('dumbfuck')).status, 400);
    assert.equal((await reg('dumb fucker')).status, 400); // token-exact
    assert.equal((await reg('SuperFuckingNoob')).status, 400); // hidden in longer token
    assert.equal((await reg('sh1tty')).status, 400); // leetspeak normalized
    assert.equal((await reg('Therapist')).status, 200); // allowlisted stem
    const ok = await reg('ClassicMike');
    assert.equal(ok.status, 200);
    const me = await ok.json();
    assert.equal(me.user.username, 'ClassicMike');
  });
  it('name filter: compounds blocked, safe stems pass (unit)', () => {
    assert.equal(server.isNameBlocked('SniggerFan'), false);
    assert.equal(server.isNameBlocked('ArsenalFan'), false);
    assert.equal(server.isNameBlocked('ClassicMike'), false);
    assert.equal(server.isNameBlocked('dumbfuck'), true);
    assert.equal(server.isNameBlocked('Fuckface99'), true); // compound, leet-safe
  });
  it('admin-renames a user everywhere', async () => {
    const key = {'x-admin-key':'testkey123'};
    const users = await (await fetch(BASE + '/api/users')).json();
    const mike = users.find(u => u.username === 'Therapist');
    assert.ok(mike);
    const rename = (id, body) => fetch(BASE + `/api/admin/users/${id}/rename`, {method:'POST',
      headers:{'Content-Type':'application/json', ...key}, body: JSON.stringify(body)});
    assert.equal((await rename(mike.id, {username:'x'})).status, 400); // too short
    assert.equal((await rename(mike.id, {username:'dumbfuck'})).status, 400); // blocked
    assert.equal((await rename(mike.id, {username:'SmokeUser'})).status, 409); // taken
    assert.equal((await rename(99999, {username:'Nobody'})).status, 404);
    assert.equal((await fetch(BASE + `/api/admin/users/${mike.id}/rename`,
      {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'CleanRider'})})).status, 401);
    const good = await (await rename(mike.id, {username:'CleanRider'})).json();
    assert.equal(good.username, 'CleanRider');
    const after = await (await fetch(BASE + '/api/users')).json();
    assert.ok(after.some(u => u.username === 'CleanRider'));
    assert.ok(!after.some(u => u.username === 'Therapist'));
    const acts = await (await fetch(BASE + '/api/activity')).json();
    assert.ok(acts.filter(a => a.user_id === mike.id).every(a => a.username === 'CleanRider'));
    // can still log in under the new name with the same PIN
    const back = await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'CleanRider', pin:'1234'})});
    assert.equal(back.status, 200);
  });
  it('push public-key + subscribe round-trip (temp VAPID keys)', async () => {
    const pub = await (await fetch(BASE + '/api/push/public-key')).json();
    assert.equal(pub.key, TEST_VAPID.publicKey);
    const sub = {endpoint:'https://push.example/sub-1', keys:{p256dh:'cDE2NTZkaA', auth:'YXV0aA'}};
    const ok = await fetch(BASE + '/api/push/subscribe', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': token},
      body: JSON.stringify({userId: uid, subscription: sub})});
    assert.equal(ok.status, 200);
    // duplicate subscribe = idempotent update, still 200
    assert.equal((await fetch(BASE + '/api/push/subscribe', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': token},
      body: JSON.stringify({userId: uid, subscription: sub})})).status, 200);
    const un = await fetch(BASE + '/api/push/unsubscribe', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({userId: uid, endpoint: sub.endpoint})});
    assert.equal(un.status, 200);
  });
  it('push subscribe validates input', async () => {
    const bad = await fetch(BASE + '/api/push/subscribe', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({userId: uid})});
    assert.equal(bad.status, 400);
    const bad2 = await fetch(BASE + '/api/push/subscribe', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({userId: 99999, subscription:{endpoint:'x', keys:{p256dh:'y', auth:'z'}}})});
    assert.equal(bad2.status, 404);
  });
  it('clamps cheat stats over HTTP', async () => {
    const r = await fetch(BASE + '/api/stats', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': token},
      body: JSON.stringify({userId: uid, xp:99999, best:{snake:99999}, score:99999, xp_earned:9999, gameId:'snake', action:'x'})});
    const j = await r.json();
    assert.equal(j.clamped, true);
    const users = await (await fetch(BASE + '/api/users')).json();
    const me = users.find(u => u.username === 'SmokeUser');
    assert.ok(me.xp <= server.MAX_XP_PER_HIT);
    assert.equal(me.pin_hash, undefined);
  });
  it('gates sessions + backup behind admin key', async () => {
    assert.equal((await fetch(BASE + '/api/sessions')).status, 401);
    assert.equal((await fetch(BASE + '/api/sessions', {headers:{'x-admin-key':'testkey123'}})).status, 200);
    assert.equal((await fetch(BASE + '/api/backup', {method:'POST'})).status, 401);
  });
  it('admin-deletes a user with full cascade', async () => {
    const key = {'x-admin-key':'testkey123'};
    assert.equal((await fetch(BASE + '/api/admin/users/99999', {method:'DELETE'})).status, 401);
    assert.equal((await fetch(BASE + '/api/admin/users/99999', {method:'DELETE', headers:key})).status, 404);
    // register with activity, then delete
    const reg = await (await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'DoomedUser', pin:'9999'})})).json();
    const id = reg.user.id;
    const del = await (await fetch(BASE + `/api/admin/users/${id}`, {method:'DELETE', headers:key})).json();
    assert.equal(del.deleted, 'DoomedUser');
    const users = await (await fetch(BASE + '/api/users')).json();
    assert.ok(!users.some(u => u.username === 'DoomedUser'));
    const acts = await (await fetch(BASE + '/api/activity')).json();
    assert.ok(!acts.some(a => a.username === 'DoomedUser'));
  });
  it('earns coins with clamp and runs the shop', async () => {
    const post = (body) => fetch(BASE + '/api/stats', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': token}, body: JSON.stringify({userId: uid, ...body})});
    // negative / oversized coin grants rejected
    assert.equal((await (await post({coins:-5})).json()).clamped ?? true, true);
    await post({coins: 60});
    let me = (await (await fetch(BASE + '/api/users')).json()).find(u => u.username === 'SmokeUser');
    assert.equal(me.coins, 60);
    const buy = (item) => fetch(BASE + '/api/shop/buy', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': token},
      body: JSON.stringify({userId: uid, item})});
    assert.equal((await buy('freeze')).status, 400); // only 60 coins
    assert.equal((await buy('nope')).status, 400);
    await post({coins: 50});
    let b = await (await buy('freeze')).json();
    assert.equal(b.items.freezes, 1);
    assert.equal(b.coins, 10);
    b = await (await buy('crown')).json().catch(() => ({}));
    assert.ok(b.error || b.coins !== undefined);
  });
  it('rejects honeypot registrations', async () => {
    const r = await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'BotUser', pin:'1234', website:'http://spam.example'})});
    assert.equal(r.status, 400);
  });
  it('throttles mass account creation per IP', async () => {
    // order-independent: other tests also register from this IP, so keep
    // creating until the 5-per-hour cap trips (must happen quickly).
    let ok = 0, limited = false;
    for(let i = 0; i < 9 && !limited; i++){
      const r = await fetch(BASE + '/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:`Cooldown${Date.now()}_${i}_${ok}`, pin:'1234'})});
      if(r.status === 429) limited = true;
      else { assert.equal(r.status, 200); ok++; }
    }
    assert.ok(limited, 'expected a 429 once the hourly cap trips');
    assert.ok(ok >= 1, 'at least one registration should succeed');
  });
  it('serves per-game leaderboards', async () => {
    assert.equal((await fetch(BASE + '/api/leaderboard/nope')).status, 400);
    const rows = await (await fetch(BASE + '/api/leaderboard/snake')).json();
    assert.ok(Array.isArray(rows));
    assert.ok(rows.some(r => r.username === 'SmokeUser' && r.score > 0));
    assert.ok(!('pin_hash' in rows[0] || 'token' in rows[0]));
  });
});
