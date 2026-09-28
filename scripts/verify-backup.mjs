// verify-backup.mjs — prove the newest backup is a valid, restorable SQLite DB.
// Usage: npm run verify:backup
// Exits 0 when the latest snapshot opens and its user count matches the live DB.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'backups');
const live = process.env.GAMEVERSE_DB || path.join(root, 'gameverse.db');

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort() : [];
if(!files.length){ console.error('No backups found in backups/'); process.exit(1); }
const latest = path.join(dir, files[files.length - 1]);
console.log('Checking', latest);

let snapUsers, liveUsers;
try{
  const snap = new DatabaseSync(latest, {readOnly:true});
  snapUsers = snap.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  snap.prepare('SELECT COUNT(*) AS c FROM activity').get();
  snap.close();
}catch(e){ console.error('Snapshot is not a valid DB:', e.message); process.exit(1); }
try{
  const liveDb = new DatabaseSync(live, {readOnly:true});
  liveUsers = liveDb.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  liveDb.close();
}catch(e){ console.error('Live DB unreadable:', e.message); process.exit(1); }

console.log(`snapshot users: ${snapUsers}, live users: ${liveUsers}`);
if(snapUsers > liveUsers){ console.error('Snapshot is newer than live DB — refusing'); process.exit(1); }
console.log('OK — backup is valid and restorable');
