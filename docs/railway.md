# Deploying TraceIt on Railway (public demo at <your-domain>)

This deploys one Railway service that builds the repo's `Dockerfile` and runs `scripts/start-prod.mjs`. It stores SQLite, the seeded Notability PDF and any other files on a Railway Volume mounted at `/data`, and serves the offline demo (`DEMO_MODE=1`).

**No database service is involved.** Do not add Postgres or Tiger Data, and do not set `DATABASE_URL`.

Everything below is click-by-click. You need about 20 minutes, plus DNS and certificate waits.

---

## What the repo already does

| Piece | Where | What it does |
|---|---|---|
| Build | `Dockerfile` (selected by `railway.json`) | Uses Node 22 on Debian bookworm. `npm ci` builds better-sqlite3 (a native module) with the bundled linux prebuild; then `next build` runs. |
| Start | `scripts/start-prod.mjs` (`npm run start:railway`) | 1. Creates `/data`, `/data/uploads/notability` and `/data/tts`. 2. Seeds the demo if it is missing, or rebuilds it when `DEMO_RESET_ON_START=1`. 3. Runs `next start -H 0.0.0.0 -p $PORT`. |
| Periodic reset | `instrumentation.ts` → `lib/demoReset.ts` | See the note below this table. |
| Health check | `/api/health`, configured in `railway.json` | Returns `{"ok":true,"backend":"sqlite"}`, or 503 if the database can't be opened. |
| Restart policy | `railway.json` | On failure, up to 10 retries. |
| Public lock-down | `DEMO_MODE=1` | See the note below this table. |

**Periodic reset.** Every `DEMO_RESET_MINUTES` (default 30):

- Maya's sessions are rebuilt, and the demo accounts and class are restored if anything is missing.
- Visitor sessions (the shared guest accounts' sessions, other than the seeded ones) older than `DEMO_KEEP_VISITOR_MINUTES` (default 60) are deleted, and so are guest uploads (with `PUBLIC_UPLOADS=1`) of that age.
- Expired sign-in sessions are deleted.
- Real accounts (anyone who signs in with a password) are never touched: not their sessions, lectures or sign-ins.
- Everything runs inside one SQLite transaction. Requests that arrive during the reset (about 0.2 s) wait for it to finish rather than failing.

**Accounts on the demo.** Every page except `/welcome` needs a sign-in. On the demo, `/signin` offers two buttons that need no account: **Try the demo** signs the visitor into the shared student guest (Maya, `demo-student`), and **Try the teacher view** into the shared demo teacher, whose class "Calculus I" (join code `MAYA2026`) has Maya and five classmates enrolled. Guest sign-ins last a day. Every visitor shares the same guests, which is why the periodic reset exists. Password sign-in still works, but creating an account and creating classes answer 403 on the demo.

**Public lock-down with `DEMO_MODE=1`:**

- These routes answer 403 and show a disabled control with the note "…available when you run TraceIt yourself":
  - lecture upload
  - Notability PDF import and replace
  - Whisper auto-transcribe
  - Live lecture
  - sign-up and class creation
- All re-teach AI comes from the bundled fixtures (offline).
- The only route that can call a model is the landing assistant, `/api/ask`, and only if `GROQ_API_KEY` is set. It keeps its per-IP limits and its daily cap.

---

## 1. Create the project from GitHub

1. Go to <https://railway.com> and log in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
   - If Railway asks, click **Configure GitHub App** and grant it access to **Aasrith-Mandava/traceit**.
3. Pick **Aasrith-Mandava/traceit**. Railway creates a service and starts building from `main`. It finds `railway.json`, so it uses the Dockerfile.
   - The first build may start before the variables are set. That's fine; you'll redeploy in step 4.

## 2. Add the Volume at `/data`

1. On the project canvas, right-click the **TraceIt** service → **Attach Volume**. (Or press ⌘K / Ctrl+K and type "Volume".)
2. Set the **Mount path** to `/data`, then click **Add** or **Attach**.

**Why this matters:**

- Without a volume, the database lives inside the container and is wiped on every deploy. The app still works, because it re-seeds on start, but visitor sessions vanish.
- A service with a volume runs one replica, and each redeploy has a few seconds of downtime. That's fine for a demo.
- The container runs as root, so it can write to the volume. Nothing to configure.

## 3. Set the variables

Open the service → **Variables** → **Raw Editor**. Paste the block below and set the values. Never paste keys anywhere else.

```dotenv
DEMO_MODE=1
TRACEIT_DATA_DIR=/data
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_SITE_URL=https://<your-domain>
DEMO_RESET_ON_START=1
DEMO_RESET_MINUTES=30
DEMO_KEEP_VISITOR_MINUTES=60
# Optional: live answers in the landing assistant (/api/ask) only. Leave unset for offline answers.
GROQ_API_KEY=<your Groq key>
LANDING_AI_DAILY_CAP=200
```

| Variable | Value | Notes |
|---|---|---|
| `DEMO_MODE` | `1` | Required. Offline fixtures; uploads, Whisper, Live lecture, sign-up and class creation are off (403); "Try the demo" guest sign-in is on. |
| `TRACEIT_DATA_DIR` | `/data` | Required. Must match the volume's mount path. The DB is `/data/traceit.db`, uploads and PDFs go in `/data/uploads`, and the TTS cache in `/data/tts`. The Dockerfile defaults to `/data` too. From before the rename, `INKLING_DATA_DIR` (and every other `INKLING_*` name) still works, and an existing `/data/inkling.db` keeps being used. |
| `NODE_ENV` | `production` | The start script sets it anyway. |
| `PORT` | `3000` | Pins the port, so the domain's target port is always 3000. |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | The base for `og:image` and similar links. **It is baked in at build time.** Change it, then **redeploy**. Use `https://<your-domain>` only if the apex is served directly (see 6b, option 2). |
| `DEMO_RESET_ON_START` | `1` | Rebuilds Maya's sessions on every deploy or restart. Without it, the demo is seeded only when missing. |
| `DEMO_RESET_MINUTES` | `30` | Interval of the in-process reset. `0` turns it off. |
| `DEMO_KEEP_VISITOR_MINUTES` | `60` | Visitor sessions younger than this survive a reset. `0` removes them all at every reset. |
| `GROQ_API_KEY` | optional | Used **only** by `/api/ask`. DEMO_MODE blocks Whisper, so this key can't be spent on transcription. |
| `LANDING_AI_DAILY_CAP` | e.g. `200` | Global daily cap on assistant model calls (default 500). `LANDING_AI_DISABLED=1` keeps the assistant fully offline. |
| `TRACEIT_SESSION_DAYS` | optional | How long a password sign-in lasts, in days (default 30, at most 365). Demo guest sign-ins always last 1 day. |
| `TRACEIT_COOKIE_SECURE` | optional | `auto` (default): the session cookie is `Secure` when the request came over HTTPS (Railway's edge sends `X-Forwarded-Proto: https`). `1` always sets `Secure`; `0` never does (plain-HTTP testing only). |
| `TRACEIT_ADOPT_LOCAL_DATA` | optional | Outside DEMO_MODE, the first account created takes over the notes and lectures made before accounts existed (default on). `0` turns that off; set it on a hosted, non-demo instance that already has data. DEMO_MODE never adopts. |

**Do not set these:**

- `DATABASE_URL`: it would switch storage to Postgres and ignore the volume.
- `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`: DEMO_MODE doesn't use them. Leaving them out removes any chance of spend.

Accounts need **no secret**: passwords are hashed with scrypt and sign-in sessions are random tokens stored hashed in the database, so there is nothing to add for them.

`TRACEIT_DISABLE_AI=1` is optional and changes nothing here, because DEMO_MODE already wins. Note that it does **not** turn off `/api/ask`; only `LANDING_AI_DISABLED=1` or an unset `GROQ_API_KEY` does.

## 4. Deploy

1. Click **Deploy** on the staged changes banner, or **Deployments** → ⋯ → **Redeploy**.
2. Watch the build logs. `npm ci` then `next build` take about 3–6 minutes.
3. Watch the deploy logs. You should see:

   ```text
   ▸ TraceIt (production) · storage: SQLite at /data/traceit.db · files under /data
   ▸ DEMO_MODE: seeding the demo (DEMO_RESET_ON_START=1: rebuilding it)
   Seeded the demo into SQLite (/data/traceit.db).
   ▸ The demo resets every 30 min …
   ▸ next start on 0.0.0.0:3000
   [traceit] DEMO_MODE: the demo resets every 30 min
   ```

4. The deploy turns green once `/api/health` answers 200.

## 5. Generate the Railway domain

1. Open the service → **Settings** → **Networking** → **Public Networking** → **Generate Domain**.
2. If Railway asks for the target port, enter **3000**.
3. You get something like `<your-service>.up.railway.app`. Open it: `/` redirects to `/welcome`.

## 6. Custom domain: <your-domain> (registered at get.tech)

### 6a. <your-domain> → Railway (do this first)

1. In Railway, open the service → **Settings** → **Networking** → **+ Custom Domain**.
   - Enter `<your-domain>`.
   - Target port **3000**.
2. Railway shows **two records**. Copy both exactly:
   - a **CNAME**: `www` → something like `abc123.up.railway.app`
   - a **TXT**: `_railway-verify.www` (or similar) → a `railway-verify=…` value

   **Both are required.** With only the CNAME, the domain returns 404 until the TXT verifies.
3. In get.tech, log in at <https://manage.get.tech> (the .TECH control panel), then:
   1. Go to **Domains** → **List / Search Orders** → click `<your-domain>`.
   2. Click **Manage DNS**, which opens the DNS panel.
   3. Delete any default parking records for `www` (a CNAME or A record).
   4. Open the **CNAME Records** tab → **Add CNAME Record**.
      - **Host name:** `www` (only the part before `<your-domain>`; the panel appends the domain).
      - **Value / Points to:** the Railway target, e.g. `abc123.up.railway.app`.
      - **TTL:** `300`, or the lowest the panel allows.
   5. Open the **TXT Records** tab → **Add TXT Record**.
      - **Host name:** the TXT name Railway shows, without `<your-domain>` (e.g. `_railway-verify.www`).
      - **Value:** the exact value Railway shows.
      - **TTL:** `300`.
4. Check from a terminal:

   ```bash
   dig +short CNAME <your-domain>          # → abc123.up.railway.app.
   dig +short TXT _railway-verify.<your-domain>
   ```

5. Wait for Railway to show a green check next to the domain. Certificate issuance (Let's Encrypt) usually takes minutes and at most about an hour after DNS resolves. Then <https://<your-domain>> works.

### 6b. The apex <your-domain>

A CNAME can't sit at the apex. Railway supports the apex only through **CNAME flattening** or an **ALIAS/ANAME** record at your DNS provider; it names Cloudflare, DNSimple, Namecheap and bunny.net.

The get.tech DNS panel, a LogicBoxes/Radix panel, offers A, AAAA, CNAME, MX, NS, TXT and SRV records, and **no ALIAS/ANAME or flattening**. I couldn't open their help pages to confirm this. If your panel does show an ALIAS or ANAME type, use it like the CNAME in 6a.

**Option 1: forward the apex to www (fastest, recommended tonight).**

1. In the get.tech control panel, on the domain's page, open **Domain Forwarding**.
2. Forward `<your-domain>` → `https://<your-domain>`.
   - Choose a permanent (301) redirect if offered, and turn on path forwarding if offered.
   - Leave masking/frame forwarding **off**. The app sends `X-Frame-Options: DENY`, so a masked frame would stay blank.
3. Keep `NEXT_PUBLIC_SITE_URL=https://<your-domain>`.
4. You **don't** add the apex in Railway for this option. Railway only serves `www`.

**Caveat:** registrar forwarding is often **HTTP-only**. `https://<your-domain>` redirects fine, but `https://<your-domain>` may show a certificate warning, because the forwarder has no certificate for your apex. Test both. If HTTPS on the apex matters (for example, because the Devpost link is `https://<your-domain>`), use option 2, or make the Devpost link `https://<your-domain>`.

**Option 2: Cloudflare DNS (free), which serves the apex with HTTPS.**

1. Create a free Cloudflare account → **Add a site** → `<your-domain>` → Free plan.
2. Cloudflare imports the existing records. Then add these, each **DNS only (grey cloud)**:
   - `CNAME www → abc123.up.railway.app`
   - `CNAME @ → <the apex target Railway shows>` (Cloudflare flattens it)
   - both `_railway-verify…` TXT records
3. In get.tech: domain page → **Name Servers** → replace them with the two Cloudflare nameservers. `.tech` NS changes usually apply within an hour.
4. In Railway, add **both** `<your-domain>` and `<your-domain>` as custom domains. Each gets its own CNAME target and TXT record.
5. Set `NEXT_PUBLIC_SITE_URL=https://<your-domain>` and **redeploy**.

Keep the Cloudflare proxy **off** (grey cloud):

- With the orange cloud, every client IP becomes a Cloudflare IP to the assistant's per-IP limits.
- Railway also has to issue its certificate through the proxy.

**Same-origin check:** the app refuses cross-site POSTs by comparing `Origin` with `Host` or `X-Forwarded-Host` (`lib/http.ts`). The apex and www are different origins. That's fine, because visitors always end up on one host (the forward or redirect happens on GET), and all the app's POSTs go to the host the page came from.

## 7. Smoke test (about 3 minutes)

```bash
SITE=https://<your-domain>
curl -s $SITE/api/health                                  # {"ok":true,"backend":"sqlite","timescale":false}
curl -sI $SITE/ | grep -i location                        # /welcome
curl -s -o /dev/null -w '%{http_code}\n' $SITE/api/sessions            # 401 (signed out)
JAR=$(mktemp)                                             # "Try the demo": a guest sign-in as Maya
curl -s -c $JAR -X POST -H "Origin: $SITE" -H 'Content-Type: application/json' -d '{"as":"student"}' $SITE/api/auth/demo   # {"user":{"id":"demo-student",...}}
curl -s -b $JAR -o /dev/null -w '%{http_code}\n' -H 'Range: bytes=0-1023' $SITE/api/lectures/demo-chain-rule/media   # 206
curl -s -b $JAR -X POST -H "Origin: $SITE" $SITE/api/lectures/demo-chain-rule/transcribe   # 403 "Auto-transcribe is available when you run TraceIt yourself."
curl -s -X POST -H "Origin: $SITE" -H 'Content-Type: application/json' -d '{"name":"x","email":"x@example.com","password":"long enough","role":"student"}' $SITE/api/auth/signup   # 403
```

Then check in a browser (an iPad too):

- `/welcome` → the app link → `/signin` → **Try the demo** → `/app` shows Maya's two sessions.
- `/review/demo-maya-1`: **Replay** plays audio, and opening a moment shows a hand-written help card.
- `/compare/demo-maya-1`: the Notability PDF renders; **Replace PDF** is disabled.
- `/progress`. Then sign out (from `/account`), choose **Try the teacher view**: `/classes` shows "Calculus I" with code `MAYA2026`, and its lecture's class insights open `/teacher/demo-chain-rule`.
- `/lectures/new`: the upload form is disabled, with the note.
- Ask the landing assistant one question.

## 8. Operating it

- **Reset now:** Deployments → ⋯ → **Restart**. With `DEMO_RESET_ON_START=1`, the demo is rebuilt on start.
- **Wipe everything,** including visitor sessions:
  1. Remove and re-attach the volume, or set `DEMO_KEEP_VISITOR_MINUTES=0`.
  2. Restart. The next periodic reset then removes all visitor sessions.
- **Logs:** each reset prints `[traceit] demo reset in N ms (K visitor sessions removed)`.
- **Changed `NEXT_PUBLIC_SITE_URL`?** Redeploy; a restart isn't enough, because the value is baked in at build time.

### Why the reset runs in-process, not as a Railway cron job

Railway cron services are separate services, and **a volume attaches to one service only**. A cron job therefore can't open `/data/traceit.db`. It could only call an HTTP "reset" endpoint, which would be one more thing on the public internet to protect.

The in-process timer shares the app's database handle. It:

- takes the same (student, lecture) lock the app's writers use, then one SQLite transaction
- makes requests during the ~0.2 s reset wait rather than fail
- guarantees a visitor never sees a half-rebuilt demo
- deletes the replaced PDF files only after COMMIT

**If you ever prefer no timer:** set `DEMO_RESET_MINUTES=0`, keep `DEMO_RESET_ON_START=1`, and restart the deployment when you want a fresh demo. The tradeoff is manual resets, and drawings stay until the next restart.

### Local rehearsal of the production setup

```bash
TRACEIT_DIST_DIR=.next-rail NEXT_PUBLIC_SITE_URL=https://<your-domain> DATABASE_URL= npx next build
DEMO_MODE=1 TRACEIT_DATA_DIR=/tmp/traceit-data DATABASE_URL= TRACEIT_DIST_DIR=.next-rail PORT=3500 \
  DEMO_RESET_MINUTES=0.5 npm run start:railway
```

`npm run demo` (the laptop demo) never sets `DEMO_RESET_MINUTES`, so a rehearsal is never reset under you.
