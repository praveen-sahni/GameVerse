import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.GAMEVERSE_DB || path.join(__dirname, 'gameverse.db');
const JSON_PATH = path.join(__dirname, 'database.json');
const BACKUP_DIR = process.env.GAMEVERSE_BACKUPS || path.join(__dirname, 'backups');
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Behind a tunnel/reverse proxy the client IP and proto arrive via
// X-Forwarded-* — trust the local proxy so rate limits see real IPs
// and req.secure reflects the public HTTPS scheme.
if(process.env.BEHIND_PROXY) app.set('trust proxy', 1);
// Minimal security headers (CSP omitted: page uses inline scripts/styles).
// Registered BEFORE static serving so every response — pages, JS, API — carries them.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(), camera=(), geolocation=()');
  if(process.env.TLS_CERT || req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(cors());
app.use(express.json({limit:'100kb'}));
app.use(express.static(__dirname));

// ---------- SQLite setup ----------
let db;
function openDb(){
  db = new DatabaseSync(DB_PATH);
  // durability under concurrent play + online backups
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=200;');
}
openDb();
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  avatar TEXT NOT NULL DEFAULT '⚡',
  genre TEXT NOT NULL DEFAULT 'Arcade',
  pin_hash TEXT,
  token TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  best TEXT NOT NULL DEFAULT '{}',
  coins INTEGER NOT NULL DEFAULT 0,
  items TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_ip TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '⚡',
  login_at TEXT NOT NULL,
  logout_at TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '⚡',
  action TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
`);

function nowISO(){ return new Date().toISOString(); }

// ---------- One-time migration from database.json ----------
function migrateFromJson(){
  if(process.env.GAMEVERSE_NO_MIGRATE) return;
  if(!fs.existsSync(JSON_PATH)) return;
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if(count > 0) return;
  try{
    const j = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    const insUser = db.prepare(`INSERT INTO users (id,username,avatar,genre,pin_hash,token,xp,played,wins,best,created_at,last_seen,last_ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const u of (j.users||[])){
      const rawPin = (u.pin && /^\d{4}$/.test(String(u.pin))) ? String(u.pin) : '0000';
      insUser.run(u.id, u.username, u.avatar||'⚡', u.genre||'Arcade', hashPin(rawPin), u.token||makeToken(),
        u.xp||0, u.played||0, u.wins||0,
        typeof u.best==='string' ? u.best : JSON.stringify(u.best||{}),
        u.created_at||nowISO(), u.last_seen||nowISO(), u.last_ip||null);
    }
    const insSess = db.prepare(`INSERT INTO sessions (id,user_id,username,avatar,login_at,logout_at,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)`);
    for(const s of (j.sessions||[])) insSess.run(s.id, s.user_id, s.username, s.avatar||'⚡', s.login_at||nowISO(), s.logout_at||null, s.ip||null, s.user_agent||null);
    const insAct = db.prepare(`INSERT INTO activity (id,user_id,username,avatar,action,score,xp_earned,created_at) VALUES (?,?,?,?,?,?,?,?)`);
    for(const a of (j.activity||[])) insAct.run(a.id, a.user_id, a.username, a.avatar||'⚡', String(a.action||'').slice(0,120), a.score||0, a.xp_earned||0, a.created_at||nowISO());
    fs.copyFileSync(JSON_PATH, JSON_PATH + '.migrated-bak');
    console.log(`Migrated ${(j.users||[]).length} users from database.json (backup at database.json.migrated-bak)`);
  }catch(e){ console.warn('JSON migration skipped:', e.message); }
}

// ---------- Auth helpers ----------
export function hashPin(pin){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPin(pin, stored){
  if(!stored) return false;
  const [salt, hash] = String(stored).split(':');
  if(!salt || !hash) return false;
  try{
    const h = crypto.scryptSync(String(pin), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  }catch{ return false; }
}
function makeToken(){ return crypto.randomBytes(32).toString('hex'); }

// ---------- Rate limits ----------
const rateMap = new Map();
function rateLimit(req, res, next){
  const ip = req.ip;
  const now = Date.now();
  const arr = (rateMap.get(ip)||[]).filter(t => now - t < 60000);
  arr.push(now);
  rateMap.set(ip, arr);
  if(arr.length > 20) return res.status(429).json({error:'Too many requests — wait a moment'});
  next();
}
function needAdmin(req, res){
  if(!ADMIN_KEY) return false;
  if(req.headers['x-admin-key'] !== ADMIN_KEY){
    res.status(401).json({error:'Admin key required'});
    return true;
  }
  return false;
}

// ---------- Anti-cheat (pure, unit-tested) ----------
export const MAX_SCORE = {snake:1500, memory:600, blaster:2500, runner:2500, simon:600, tictac:200};
export const MAX_XP_PER_HIT = 400;
export const MAX_COINS_PER_HIT = 100;
export function applyStatsUpdate(u, body){
  // u: {xp,played,wins,best,coins} where best may be object or JSON string.
  // Returns {patch, activity, clamped} — never mutates inputs.
  let clamped = false;
  const {xp, played, wins, best, action, score, xp_earned, gameId, coins} = body || {};
  let safeScore = Math.floor(Number(score) || 0);
  if(gameId && MAX_SCORE[gameId] && safeScore > MAX_SCORE[gameId]){ safeScore = MAX_SCORE[gameId]; clamped = true; }
  if(safeScore > 5000){ safeScore = 5000; clamped = true; }
  if(safeScore < 0) safeScore = 0;
  let safeXpEarn = Math.floor(Number(xp_earned) || 0);
  if(safeXpEarn > MAX_XP_PER_HIT){ safeXpEarn = MAX_XP_PER_HIT; clamped = true; }
  if(safeXpEarn < 0) safeXpEarn = 0;
  const patch = {};
  if(typeof xp === 'number' && Number.isFinite(xp)){
    const delta = xp - (u.xp || 0);
    if(delta > MAX_XP_PER_HIT){ patch.xp = (u.xp || 0) + MAX_XP_PER_HIT; clamped = true; }
    else if(delta < 0){ clamped = true; /* ignore rollbacks */ }
    else patch.xp = Math.floor(xp);
  }
  if(typeof played === 'number' && Number.isFinite(played)){
    const d = Math.floor(played) - (u.played || 0);
    if(d > 0 && d <= 5) patch.played = Math.floor(played);
    else if(d > 5){ patch.played = (u.played || 0) + 1; clamped = true; }
  }
  if(typeof wins === 'number' && Number.isFinite(wins)){
    const d = Math.floor(wins) - (u.wins || 0);
    if(d >= 0 && d <= 3) patch.wins = Math.floor(wins);
    else if(d > 3){ patch.wins = (u.wins || 0) + 1; clamped = true; }
    // rollbacks (d < 0) are ignored silently
  }
  if(coins !== undefined){
    const c = Math.floor(Number(coins) || 0);
    if(c >= 0 && c <= MAX_COINS_PER_HIT) patch.coins = (u.coins || 0) + c;
    else { clamped = true; /* negative or absurd coin grants rejected */ }
  }
  if(best && typeof best === 'object' && !Array.isArray(best)){
    let cur = {};
    try{ cur = typeof u.best === 'string' ? JSON.parse(u.best || '{}') : {...(u.best || {})}; }catch{ cur = {}; }
    const nb = {...cur};
    for(const k of Object.keys(best)){
      let v = Math.floor(Number(best[k]) || 0);
      const cap = MAX_SCORE[k] || 2000;
      if(v > cap){ v = cap; clamped = true; }
      if(v < 0){ v = 0; clamped = true; }
      if(v > 0) nb[k] = Math.max(nb[k] || 0, v);
    }
    patch.best = JSON.stringify(nb);
  }
  const safeAction = typeof action === 'string' ? action.slice(0, 120) : '';
  return {patch, activity: safeAction ? {action: safeAction, score: safeScore, xp_earned: safeXpEarn} : null, clamped};
}

// ---------- Row helpers ----------
function parseBest(v){
  if(!v) return {};
  if(typeof v === 'object') return v;
  try{ return JSON.parse(v); }catch{ return {}; }
}
function parseItems(v){
  if(!v) return {};
  if(typeof v === 'object') return v;
  try{ return JSON.parse(v); }catch{ return {}; }
}
function publicUser(u){
  return {
    id: u.id, username: u.username, avatar: u.avatar, genre: u.genre,
    xp: u.xp, played: u.played, wins: u.wins, best: parseBest(u.best),
    coins: u.coins || 0, items: parseItems(u.items),
    created_at: u.created_at, last_seen: u.last_seen,
    isOnline: (Date.now() - new Date(u.last_seen).getTime()) < 2 * 60 * 1000,
  };
}
// ALTER TABLE migration for DBs created before coins/items existed
function migrateColumns(){
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if(!cols.includes('coins')) db.exec('ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0');
  if(!cols.includes('items')) db.exec(`ALTER TABLE users ADD COLUMN items TEXT NOT NULL DEFAULT '{}'`);
}

// Honeypot + registration cooldown (bots mass-create accounts; humans never touch these)
const regCooldown = new Map();
app.post('/api/auth', rateLimit, (req, res) => {
  const { username, avatar, genre, pin } = req.body;
  if(req.body.website) return res.status(400).json({error:'Registration unavailable'});
  if(!username || username.trim().length < 2) return res.status(400).json({error:'Username min 2 chars'});
  if(pin && !/^\d{4}$/.test(String(pin))) return res.status(400).json({error:'PIN must be 4 digits'});
  const clean = username.trim().slice(0, 20);
  const pinStr = String(pin || '0000');
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const ua = req.headers['user-agent'] || '';
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(clean);
  if(user){
    if(user.pin_hash){
      if(!verifyPin(pinStr, user.pin_hash)) return res.status(403).json({error:'Username taken — wrong PIN'});
    } else {
      db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(pinStr), user.id);
    }
    const token = makeToken();
    db.prepare('UPDATE users SET avatar = ?, genre = ?, token = ?, last_seen = ?, last_ip = ? WHERE id = ?')
      .run(avatar || user.avatar, genre || user.genre, token, nowISO(), ip, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  } else {
    // max 5 new accounts per IP per hour
    const now = Date.now();
    const made = (regCooldown.get(ip) || []).filter(t => now - t < 3600000);
    if(made.length >= 5) return res.status(429).json({error:'Too many new accounts — try again later'});
    made.push(now); regCooldown.set(ip, made);
    const token = makeToken();
    const r = db.prepare(`INSERT INTO users (username,avatar,genre,pin_hash,token,xp,played,wins,best,coins,items,created_at,last_seen,last_ip) VALUES (?,?,?,?,?,0,0,0,'{}',0,'{}',?,?,?)`)
      .run(clean, avatar || '⚡', genre || 'Arcade', hashPin(pinStr), token, nowISO(), nowISO(), ip);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    db.prepare('INSERT INTO activity (user_id,username,avatar,action,score,xp_earned,created_at) VALUES (?,?,?,\'Registered\',0,0,?)')
      .run(user.id, user.username, user.avatar, nowISO());
  }
  db.prepare('INSERT INTO sessions (user_id,username,avatar,login_at,logout_at,ip,user_agent) VALUES (?,?,?, ?,NULL,?,?)')
    .run(user.id, user.username, user.avatar, nowISO(), ip, ua);
  db.prepare('INSERT INTO activity (user_id,username,avatar,action,score,xp_earned,created_at) VALUES (?,?,?,\'Login\',0,0,?)')
    .run(user.id, user.username, user.avatar, nowISO());
  res.json({user: publicUser(user), token: user.token});
});

app.post('/api/heartbeat', (req, res) => {
  const {userId} = req.body;
  const token = req.headers['x-gv-token'];
  if(!userId) return res.status(400).json({error:'userId required'});
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if(!u) return res.status(404).json({error:'User not found'});
  if(u.token && token && token !== u.token) return res.status(403).json({error:'Invalid token'});
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowISO(), u.id);
  res.json({ok:true});
});

const statsRate = new Map();
const statsIpRate = new Map();
app.post('/api/stats', (req, res) => {
  const {userId} = req.body;
  const token = req.headers['x-gv-token'];
  if(!userId) return res.status(400).json({error:'userId required'});
  const now = Date.now();
  const key = 's' + userId;
  const arr = (statsRate.get(key) || []).filter(t => now - t < 60000);
  arr.push(now); statsRate.set(key, arr);
  if(arr.length > 30) return res.status(429).json({error:'Too many score updates'});
  // per-IP backstop so scripts can't rotate userIds to evade the per-user cap
  const iparr = (statsIpRate.get(req.ip) || []).filter(t => now - t < 60000);
  iparr.push(now); statsIpRate.set(req.ip, iparr);
  if(iparr.length > 120) return res.status(429).json({error:'Too many score updates'});
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if(!u) return res.status(404).json({error:'User not found'});
  if(u.token && token && token !== u.token) return res.status(403).json({error:'Invalid token'});
  const current = {xp: u.xp, played: u.played, wins: u.wins, best: u.best, coins: u.coins};
  const {patch, activity, clamped} = applyStatsUpdate(current, req.body);
  if(patch.xp !== undefined) db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(patch.xp, u.id);
  if(patch.played !== undefined) db.prepare('UPDATE users SET played = ? WHERE id = ?').run(patch.played, u.id);
  if(patch.wins !== undefined) db.prepare('UPDATE users SET wins = ? WHERE id = ?').run(patch.wins, u.id);
  if(patch.best !== undefined) db.prepare('UPDATE users SET best = ? WHERE id = ?').run(patch.best, u.id);
  if(patch.coins !== undefined) db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(patch.coins, u.id);
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowISO(), u.id);
  if(activity){
    db.prepare('INSERT INTO activity (user_id,username,avatar,action,score,xp_earned,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(u.id, u.username, u.avatar, activity.action, activity.score, activity.xp_earned, nowISO());
  }
  res.json({ok:true, clamped});
});

app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT id,username,avatar,genre,xp,played,wins,best,coins,items,created_at,last_seen FROM users ORDER BY xp DESC').all();
  res.json(rows.map(publicUser));
});
// Per-game leaderboard, ranked by best score (public, no secrets)
app.get('/api/leaderboard/:game', (req, res) => {
  const game = String(req.params.game || '');
  if(!MAX_SCORE[game]) return res.status(400).json({error:'Unknown game'});
  const rows = db.prepare('SELECT username,avatar,best FROM users').all();
  const list = [];
  for(const r of rows){
    const b = parseBest(r.best);
    const s = Math.floor(Number(b[game]) || 0);
    if(s > 0) list.push({username: r.username, avatar: r.avatar, score: s});
  }
  list.sort((a, b) => b.score - a.score);
  res.json(list.slice(0, 10));
});
// Shop — spend coins on freezes / avatar unlocks
export const SHOP = {
  freeze:  {cost: 100, label: '❄ Streak freeze'},
  crown:   {cost: 200, label: '👑 Crown avatar'},
  diamond: {cost: 300, label: '💎 Diamond avatar'},
};
app.post('/api/shop/buy', (req, res) => {
  const {userId, item} = req.body;
  const token = req.headers['x-gv-token'];
  if(!userId || !SHOP[item]) return res.status(400).json({error:'Unknown item'});
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if(!u) return res.status(404).json({error:'User not found'});
  if(u.token && token && token !== u.token) return res.status(403).json({error:'Invalid token'});
  const items = parseItems(u.items);
  if(item === 'freeze'){
    if((u.coins || 0) < SHOP.freeze.cost) return res.status(400).json({error:'Not enough coins'});
    items.freezes = (items.freezes || 0) + 1;
  } else {
    if(items[item]) return res.status(400).json({error:'Already owned'});
    if((u.coins || 0) < SHOP[item].cost) return res.status(400).json({error:'Not enough coins'});
    items[item] = true;
  }
  db.prepare('UPDATE users SET coins = ?, items = ?, last_seen = ? WHERE id = ?')
    .run((u.coins || 0) - SHOP[item].cost, JSON.stringify(items), nowISO(), u.id);
  db.prepare('INSERT INTO activity (user_id,username,avatar,action,score,xp_earned,created_at) VALUES (?,?,?,\'Shop: bought ' + item + '\',0,0,?)')
    .run(u.id, u.username, u.avatar, nowISO());
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ok:true, coins: fresh.coins, items: parseItems(fresh.items)});
});
app.get('/api/activity', (req, res) => {
  const rows = db.prepare('SELECT id,user_id,username,avatar,action,score,xp_earned,created_at FROM activity ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});
app.get('/api/sessions', (req, res) => {
  if(needAdmin(req, res)) return;
  const rows = db.prepare('SELECT id,user_id,username,avatar,login_at,logout_at,ip,user_agent FROM sessions ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});
app.get('/api/stats/summary', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const online = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE last_seen > datetime('now','-2 minutes')`).get().c;
  const totalXp = db.prepare('SELECT COALESCE(SUM(xp),0) AS s FROM users').get().s;
  const totalPlayed = db.prepare('SELECT COALESCE(SUM(played),0) AS s FROM users').get().s;
  res.json({totalUsers: total, onlineNow: online, totalXp, totalPlayed});
});
app.post('/api/logout', (req, res) => {
  const {userId} = req.body;
  if(userId) db.prepare(`UPDATE sessions SET logout_at = ? WHERE user_id = ? AND logout_at IS NULL`).run(nowISO(), Number(userId));
  res.json({ok:true});
});

// ---------- Backups ----------
function backupDb(){
  try{
    fs.mkdirSync(BACKUP_DIR, {recursive:true});
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const dest = path.join(BACKUP_DIR, `gameverse-${stamp}.db`);
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    // prune: keep newest 14
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    for(const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log('Backup written:', dest);
    return dest;
  }catch(e){ console.warn('Backup failed:', e.message); return null; }
}
app.post('/api/backup', (req, res) => {
  if(needAdmin(req, res)) return;
  const dest = backupDb();
  if(!dest) return res.status(500).json({error:'Backup failed'});
  res.json({ok:true, file: path.basename(dest)});
});
// Download a backup snapshot (admin-gated when ADMIN_KEY is set)
app.get('/api/backup/:file', (req, res) => {
  if(needAdmin(req, res)) return;
  const f = path.basename(String(req.params.file || ''));
  if(!/^gameverse-.*\.db$/.test(f)) return res.status(400).json({error:'Unknown backup'});
  const full = path.join(BACKUP_DIR, f);
  if(!fs.existsSync(full)) return res.status(404).json({error:'Not found'});
  res.download(full, f);
});
// Restore from a backup snapshot (admin-gated when ADMIN_KEY is set).
// The live DB file is replaced; the server keeps serving (SQLite reopens per statement).
app.post('/api/restore', (req, res) => {
  if(needAdmin(req, res)) return;
  const f = path.basename(String(req.body?.file || ''));
  if(!/^gameverse-.*\.db$/.test(f)) return res.status(400).json({error:'Unknown backup'});
  const full = path.join(BACKUP_DIR, f);
  if(!fs.existsSync(full)) return res.status(404).json({error:'Not found'});
  try{
    fs.copyFileSync(DB_PATH, DB_PATH + '.pre-restore-bak');
    db.close();
    try{
      fs.copyFileSync(full, DB_PATH);
    }finally{
      openDb();
      migrateColumns();
    }
    res.json({ok:true, restored: f});
  }catch(e){ res.status(500).json({error:'Restore failed: ' + e.message}); }
});
app.get('/api/backups', (req, res) => {
  if(needAdmin(req, res)) return;
  try{
    fs.mkdirSync(BACKUP_DIR, {recursive:true});
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse();
    res.json(files.map(f => ({file: f, bytes: fs.statSync(path.join(BACKUP_DIR, f)).size})));
  }catch(e){ res.status(500).json({error:'Cannot list backups'}); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

migrateColumns();
migrateFromJson();
console.log('DB:', DB_PATH);
if(ADMIN_KEY) console.log('Admin key auth: enabled');
else console.log('Admin key auth: disabled (set ADMIN_KEY env to protect sessions + backups)');
// Nightly backup (also runs once at boot if no backup exists today)
if(!process.env.GAMEVERSE_NO_BACKUP){
  const today = new Date().toISOString().slice(0, 10);
  try{
    fs.mkdirSync(BACKUP_DIR, {recursive:true});
    const hasToday = fs.readdirSync(BACKUP_DIR).some(f => f.includes(today));
    if(!hasToday) backupDb();
  }catch{}
  const backupTimer = setInterval(backupDb, 24 * 60 * 60 * 1000);
  backupTimer.unref?.();
}

if(!process.env.GAMEVERSE_NO_LISTEN){
  const useTls = process.env.TLS_CERT && process.env.TLS_KEY
    && fs.existsSync(process.env.TLS_CERT) && fs.existsSync(process.env.TLS_KEY);
  const onReady = () => {
    const proto = useTls ? 'https' : 'http';
    console.log(`GameVerse DB server running at ${proto}://localhost:${PORT}`);
    console.log(` - Game:  ${proto}://localhost:${PORT}/`);
    console.log(` - Admin: ${proto}://localhost:${PORT}/admin.html`);
  };
  if(useTls){
    import('https').then(({default: https}) => {
      https.createServer({
        cert: fs.readFileSync(process.env.TLS_CERT),
        key: fs.readFileSync(process.env.TLS_KEY),
      }, app).listen(PORT, onReady);
    });
  } else {
    if(process.env.NODE_ENV === 'production' && !process.env.BEHIND_PROXY)
      console.warn('WARNING: no TLS configured — use a reverse proxy (nginx/Caddy) with HTTPS in production.');
    app.listen(PORT, onReady);
  }
}
export default app;
