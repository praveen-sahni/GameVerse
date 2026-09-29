# Hosting GameVerse on Railway (persistent, public URL)

Railway keeps one container always on and offers a persistent volume, which is
what the SQLite database needs. Total: ~10 minutes, no credit card for trial.

## 1. Login (on your machine)

```bash
cd /Users/praveensahni/Desktop/GameVerse
railway login        # opens browser — log in / sign up
railway init         # → "Create new project" → name it gameverse
```

## 2. Add a volume (keeps gameverse.db + backups across deploys)

In the Railway dashboard → your service → **Volumes** → **Add Volume**,
mount path: **`/data`**. (Without this, player data resets on every deploy.)

## 3. Set environment variables (service → Variables)

| Key | Value |
|---|---|
| `GAMEVERSE_DB` | `/data/gameverse.db` |
| `GAMEVERSE_BACKUPS` | `/data/backups` |
| `ADMIN_KEY` | generate: `openssl rand -hex 32` |
| `NODE_ENV` | `production` |

Railway injects `PORT` automatically — the server already respects it.
HTTPS is automatic on the Railway domain (set `BEHIND_PROXY=1` too so
rate limits see real visitor IPs and HSTS activates).

| `BEHIND_PROXY` | `1` |

## 4. Deploy

```bash
railway up           # deploys this folder (uses railway.json + npm start)
```

Railway assigns a public domain: service → **Settings → Networking →
Generate Domain** → you get `https://gameverse-xxxx.up.railway.app`.

## 5. Verify (run these against YOUR domain)

```bash
U=https://gameverse-xxxx.up.railway.app
curl $U/api/stats/summary
curl -s $U/api/sessions -o /dev/null -w "%{http_code}\n"   # expect 401
```

Then in a browser: create a profile → play Snake → check the leaderboard →
open `/admin.html`, enter the ADMIN_KEY → confirm sessions + backup button.

## Notes
- The repo is private; connect it in Railway dashboard (Deploy → Repo) for
  auto-deploys on `git push`, or keep deploying with `railway up`.
- `npm test` runs the full suite (28 tests) — Railway runs no tests by
  default; CI is optional.
