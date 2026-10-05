// send-reminders.mjs — daily streak-saver push notifications.
// Targets opted-in users whose last visit was 20–30h ago (streak at risk).
// Usage: node scripts/send-reminders.mjs [--dry-run]
// Needs VAPID_PUBLIC/VAPID_PRIVATE env (same as the server).
process.env.GAMEVERSE_NO_LISTEN = '1';
process.env.GAMEVERSE_NO_BACKUP = '1';
const DRY = process.argv.includes('--dry-run');

const {sendPush} = await import('../server.js');
const {DatabaseSync} = await import('node:sqlite');
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.GAMEVERSE_DB || path.join(root, 'gameverse.db');
const db = new DatabaseSync(dbPath, {readOnly: DRY});

const rows = db.prepare(`
  SELECT u.id, u.username,
    (strftime('%s','now') - strftime('%s', u.last_seen)) / 3600.0 AS idle_h,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = u.id) AS subs
  FROM users u
`).all().filter(r => r.idle_h >= 20 && r.idle_h <= 30 && r.subs > 0);

console.log(`candidates: ${rows.length}`);
let sent = 0, pruned = 0;
for(const r of rows){
  if(DRY){ console.log(` - would notify ${r.username} (idle ${r.idle_h.toFixed(1)}h)`); continue; }
  const res = await sendPush(r.id, {
    title: 'GameVerse 🔥',
    body: `${r.username}, your streak + daily challenge expire soon — one quick game saves them!`,
    tag: 'streak-reminder',
    url: './',
  });
  sent += res.sent || 0; pruned += res.pruned || 0;
  console.log(` - ${r.username}: sent=${res.sent || 0} pruned=${res.pruned || 0}`);
}
console.log(DRY ? 'dry run — nothing sent' : `done: sent=${sent} pruned=${pruned}`);
db.close();
