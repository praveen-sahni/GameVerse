# GameVerse — Ember Forge
Premium gaming hub — 6 games, one profile, live DB.

## Run (URL)
```bash
cd /Users/praveensahni/Desktop/GameVerse
npm install
npm start
# Game:   http://localhost:3000/
# Admin:  http://localhost:3000/admin.html
# LAN:    http://<your-ip>:3000/  (e.g. 192.168.90.114:3000)
```
Keep terminal open. If port busy: `PORT=3001 npm start`.

## Folder
```
GameVerse/
├── index.html          # hub + a11y, theme picker, d-pad
├── style.css           # aurora + glass + will-change + reduced-motion
├── js/main.js          # app shell: state, hub UI, modals, lifecycle, boot
├── js/                 # shared modules (one-way imports, no cycles)
│   ├── utils.js        # sound, beep, toast, confetti, shake
│   ├── profile.js      # local profile + stats storage
│   ├── theme.js        # theme switcher
│   ├── api.js          # auth / heartbeat / stats sync
│   ├── data.js         # game catalogue + SVG thumbnails
│   ├── quests.js       # streaks, rotating quests, challenge links
│   └── games/          # snake, memory, tictac, blaster, runner, simon
│                        # each exports mountX(env) — no imports, all app
│                        # access flows through the env object
├── react.js            # retired shim (points to js/main.js)
├── server.js           # Express + SQLite + scrypt PINs + tokens + rate limit
├── gameverse.db        # SQLite database (auto-created, git-ignored)
├── database.json       # legacy JSON (migrated once, then unused)
├── backups/            # nightly VACUUM INTO snapshots (keeps 14)
├── admin.html          # dashboard + CSV export + backup button
├── tests/smoke.test.mjs   # unit + HTTP + static checks
├── tests/e2e.test.mjs     # headless-Chrome E2E over raw CDP (zero deps)
└── .gitignore
```

## Stack
- Frontend: vanilla HTML/CSS/JS as ES modules — no framework, no bundler.
- Backend: Node 22+ (`node:sqlite` built-in) + Express + cors. Zero native deps.

## Security model
- PINs are scrypt-hashed (salted); plaintext PINs are never stored or returned.
- Session tokens are 256-bit random hex, checked on heartbeat/stats.
- `/api/users` exposes public fields only (no hashes, tokens, or IPs).
- `/api/sessions`, `/api/backup*`, `/api/restore` require `ADMIN_KEY` env (when set).
- Score/XP/coin updates are clamped server-side (`applyStatsUpdate`, unit-tested).
- Basic hardening headers on all responses; set `TLS_CERT`+`TLS_KEY` (or run behind
  nginx/Caddy with HTTPS) for production — see "Deploy" below.

## Features
- Themes: Ember (default #FF6A00), Neon, Emerald, Frost — picker top-right, persisted `gv_theme`.
- Daily streak (+freeze shop item) +20-50 XP, rotating daily quests + weekly quest + 7-day history, first-run welcome, power-up 1/game, challenge links with ghost scores, sound toggle.
- Coins: earned in Runner, spent in the 🪙 shop (streak freezes, 👑/💎 avatar unlocks — locked in the picker until earned or bought).
- Leaderboards: XP board + per-game tabs (`GET /api/leaderboard/:game`), also shown in each game modal.
- DB: SQLite (WAL mode) users/sessions/activity, online <2min, token per user, nightly backups.

## Tests
```bash
npm test            # unit + HTTP + static + browser E2E (34 tests)
npm run verify:backup  # prove the newest snapshot restores
```

## Deploy (public launch runbook)
```bash
# 0. Node 22+ required (uses built-in node:sqlite).
# 1. Copy files to the host (no node_modules needed — npm install first).
# 2. Generate secrets:
openssl rand -hex 32   # → ADMIN_KEY
# 3. Run (systemd example in deploy/gameverse.service):
PORT=3000 ADMIN_KEY=<hex> NODE_ENV=production node server.js
# 4. HTTPS via Caddy (deploy/Caddyfile.example) — auto Let's Encrypt.
#    Only for direct TLS without a proxy:
TLS_CERT=/path/fullchain.pem TLS_KEY=/path/privkey.pem node server.js
# 5. Smoke test over HTTPS: register → play → quest claim → shop buy →
#    admin login (key) → backup download. Then: npm test && npm run verify:backup
```
> This app needs a persistent Node process + disk (SQLite file), so it does
> not fit serverless hosts (Vercel/Netlify functions). Use a VPS, Render/Railway
> with a disk, or any always-on host. Nightly snapshots land in `backups/`
> (keep 14, downloadable from admin.html with the admin key).
