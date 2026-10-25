# TraceIt

**Your eraser is hiding the good stuff.**

**Live demo:** <your Railway URL> · **Demo video:** <link>

TraceIt is a handwriting notes app for lectures (made for a tablet and stylus) that
keeps what you erase. Erased ink stays as _ghost ink_. TraceIt notices where you hesitated (slower
writing, erasing, going quiet while the lecture moves on), pairs each erase with what you wrote instead,
and links every moment to that point in the lecture. Study mode then walks you through the moments that
matter, and teachers see where the whole class got stuck.

TraceIt — our CalHacks 13.0 project, by Pranav Chowdary, Nagasai Kakani and Aasrith Mandava.

## Features

**Students**

- **Sign in / Sign up**: email and password, as a Student or a Teacher.
- **My notes** (`/app`): your sessions, lectures and classes.
- **Writing screen** (`/session/[id]`): Pen (Fine / Medium / Bold), Eraser (Small / Large), Undo and
  **Show erased ink**. Write alongside an uploaded lecture (the player) or a **live lecture** with browser
  captions. A hesitation meter shows how you're doing as you write. **Finish & review** takes you to Study mode.
- **Study mode** (`/review/[id]`): a guided review that opens the most important moment first and steps
  through the rest (‹ 2 of N ›, **Next moment →**, until **All caught up**). Each moment shows:
  - **Why we flagged this**
  - **First try vs second try** (the erased attempt next to the rewrite)
  - **What the lecture said**, with **Play this part**
  - a **Quick self-test** in 10 languages, and **Read it to me**

  Also on this screen: **Download PDF**, **Keep writing** and **Done**.
- **Moment types**: **Fixed** (you corrected it), **Still fuzzy** (not resolved yet) and **Aha moment**.
- **My progress** (`/progress`): your fuzzy spots, which clear as you revisit and fix them.

**Teachers**

- **Classes** (`/classes`): create a class and share its join code; students join at `/join/<code>`.
- **Class insights** (`/teacher/[lectureId]`): an anonymous heatmap of where enrolled students hesitated.
  A spot shows only when at least 3 students hit it (k ≥ 3). It also lists 3 moments worth re-teaching.

**Hidden demo pages** (reachable by URL only): `/compare/<sessionId>` (TraceIt's process laid over a
Notability PDF export of the same notes), `/insights/<sessionId>` and `/insights/evaluation`.

The landing page is `/welcome` (`/` redirects there). It has an **Ask TraceIt** chat (`POST /api/ask`).

## Quick start

Node 22+.

```bash
npm install
cp .env.local.example .env.local   # optional: add GROQ_API_KEY=gsk_… for live AI
npm run dev                          # http://localhost:3000
npm run seed:demo                    # optional: Maya's sample notes (idempotent; -- --reset rebuilds them)
npm run demo                         # demo mode: seed + production build (if stale) + next start, DEMO_MODE=1
```

Everything works **without any keys**. AI features fall back to built-in answers or show a quiet "needs an
API key" note, and read-aloud uses the browser's voice. Data is stored in a local SQLite file
(`data/traceit.db`) unless `DATABASE_URL` is set.

`npm run demo` serves on `0.0.0.0:3000` and prints the LAN address, so you can open it on a tablet on the
same Wi-Fi. Options: `--reset | --no-build | --build | --port 3001 | --host 127.0.0.1`.

## Demo mode

`DEMO_MODE=1` turns the app into a public demo:

- `/signin` shows **Try the demo** (the shared guest student, Maya) and **Try the teacher view** (her
  teacher, class "Calculus I", join code `MAYA2026`).
- Sign-up, class creation, lecture uploads, Notability import, Whisper and Live lecture are off. They
  answer 403, and their controls are shown disabled with a note. `PUBLIC_UPLOADS=1` re-enables
  rate-limited lecture uploads.
- Study-mode AI is served from hand-checked fixtures (`public/demo/ai-cache.json`). Nothing calls a model
  except the landing chat, and only if `GROQ_API_KEY` is set.
- Demo data resets itself: Maya's sessions are rebuilt every `DEMO_RESET_MINUTES` (default 30), and
  visitor sessions are cleared. Real password accounts are never touched.
- It runs fully offline once built: fonts are self-hosted, the pdf.js worker is bundled and voice falls
  back to the browser.

**What the seed creates.** Maya's Session 1 is on the bundled chain-rule lecture:

- a **Fixed** moment: `d/dx sin(x²) = cos(x²)` erased and rewritten as `cos(x²) · 2x`
- an **Aha moment**: `2(3x+1)` → `6(3x+1)`
- a **Still fuzzy** spot: product rule vs chain rule, where she erased and went quiet

Session 2 revisits and clears the fuzzy spot. The seed also adds a Notability PDF export of Session 1 and
five classmates' sessions, so Class insights has a shape.

**The demo lecture** (`public/demo/`: audio, transcript and AI fixtures) is a synthetic, generated talk on
the chain rule, so it needs no attribution. The landing page credits its lecture clip to MIT
OpenCourseWare 18.01 (CC BY-NC-SA). If you add a real lecture, its file stays in `data/uploads`
(gitignored). Never commit it, and respect its license.

## AI and voice

Set a key for any **one** provider:

- **Groq** (recommended): text, Whisper transcription and the landing chat.
- **OpenAI**, **Google Gemini** or **xAI Grok**.

`AI_PROVIDER` forces a provider. If it's unset, the first key found wins, in this order: OpenAI → Groq →
Gemini → Grok.

All four go through one OpenAI-compatible client (`lib/ai/compat.ts`). It uses strict JSON-schema output,
a repair retry, a 10 s deadline, per-session rate limits and a result cache. The AI works on two inputs:

- **Revision crops**: vision reads the before/after images of a correction.
- **Lecture text**: text writes the short re-explanation and a check question. The answer is graded on the
  server and never sent to the client first.

Lecture text and handwriting are treated as untrusted data in every prompt.

**Groq vs Grok.** Groq is GroqCloud (`GROQ_API_KEY=gsk_…`). Grok is xAI's model (`XAI_API_KEY=xai-…`).
They're different companies with different keys.

On Groq:

- Text uses `GROQ_MODEL` (default `openai/gpt-oss-120b`).
- Handwriting revisions use `GROQ_VISION_MODEL` (default `qwen/qwen3.8-27b`; `none` turns it off).
- Transcription uses Whisper (`whisper-large-v3-turbo`), but only when no OpenAI key is set. Files can be
  up to 25 MB.

**Read it to me** uses ElevenLabs if a key is set, else OpenAI TTS, else the browser's voice.

## Environment

Every variable is optional. `.env.local.example` documents each one. Keys are read on the server only and
are never logged. Old `INKLING_*` names are still accepted for every `TRACEIT_*` variable.

| Variable | What it does |
| --- | --- |
| `AI_PROVIDER` | `openai` \| `groq` \| `gemini` \| `grok` \| `fake`; unset = first key found |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL` | Groq text, vision, Whisper and the landing chat |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI (default `gpt-5-mini`), Whisper and TTS |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google Gemini via its OpenAI-compatible API |
| `XAI_API_KEY`, `XAI_MODEL` | xAI Grok |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Read-aloud voice |
| `DEMO_MODE=1` | Public demo mode (see above); `PUBLIC_UPLOADS=1` allows guest lecture uploads |
| `AI_RATE_LIMIT`, `AI_MAX_CONCURRENCY`, `AI_PREFETCH` | Cost controls |
| `DATABASE_URL` | Postgres / TimescaleDB instead of SQLite (`pglite:<dir>` = embedded local Postgres) |
| `TRACEIT_DATA_DIR`, `TRACEIT_DB_PATH`, `TRACEIT_UPLOAD_DIR` | Where SQLite and uploads live (default `data/`) |
| `TRACEIT_SESSION_DAYS` | How long a sign-in lasts (default 30) |
| `TRACEIT_COOKIE_SECURE` | `auto` (default) \| `1` \| `0` |
| `TRACEIT_ADOPT_LOCAL_DATA` | First account takes over pre-account notes (default `1`) |
| `LANDING_AI_DISABLED`, `LANDING_AI_DAILY_CAP` | Landing chat controls |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for `og:image` (baked in at build time) |

Accounts need **no auth secret**. Passwords are hashed with scrypt, and sign-in sessions are random tokens
stored hashed.

## Storage

The default is SQLite (`better-sqlite3`, `data/traceit.db`), with no setup. Set `DATABASE_URL` to a Postgres
URL (for example a free Tiger Data / Timescale Cloud service) to use Postgres instead:

- Tables are created and migrated on first use.
- Remote hosts use TLS by default.
- `/api/health` shows `{ backend, timescale }`.

With TimescaleDB, `lib/dbPostgres.ts` adds three things:

- an `ink_samples` hypertable (one summary row per stroke)
- `time_bucket` window stats (`GET /api/sessions/<id>/ink-stats`)
- a continuous aggregate of class-wide ink per 30 s of a lecture (`GET /api/lectures/<id>/hotspots`)

Plain Postgres and SQLite compute the same numbers without the extension.

## Tests

```bash
npx tsc --noEmit && npm run lint
npm test                           # vitest: unit + integration, on SQLite and embedded Postgres (PGlite)
npm run test:e2e                   # Playwright
TRACEIT_TEST_PG=1 npm run test:e2e # the same e2e suite on the Postgres repository (PGlite)
```

Playwright starts its own servers, so ports **3100** and **3101** must be free:

- **3100**: a dev server on SQLite with the fake AI provider.
- **3101**: the production demo build (`DEMO_MODE=1`).

They build into their own folders (`.next-e2e`, `.next-e2e-demo`), so they can run next to `npm run dev`.

The test projects:

| Project | What it covers |
| --- | --- |
| `setup` | Signs in the test accounts |
| `chromium` | The core suite, with AI off |
| `ai` | AI re-teach and multilingual help, on the fake provider |
| `demo` | The seeded demo, offline, against the production build |
| `landing` | `/welcome` and the Ask TraceIt chat, offline |

## Deploy (Railway)

1. On Railway, click **New project** → **Deploy from GitHub repo** → `Aasrith-Mandava/traceit` (branch
   `main`). The repo's `railway.json` selects the `Dockerfile`.
2. Add a **Volume** mounted at `/data`.
3. Set these variables: `DEMO_MODE=1` and `TRACEIT_DATA_DIR=/data`. `GROQ_API_KEY` (for the landing chat
   only) and `NEXT_PUBLIC_SITE_URL` are optional. Don't set `DATABASE_URL`.
4. Go to **Networking** → **Generate domain** (target port 3000).

Every push to `main` redeploys. The start script (`npm run start:railway` → `scripts/start-prod.mjs`)
seeds the demo, then runs `next start`. The health check is `/api/health`.
[`docs/railway.md`](docs/railway.md) covers the details: every variable, custom domains, the smoke test
and the reset internals.

## Project structure

```text
app/
  (marketing)/welcome/   landing page + Ask TraceIt chat
  (product)/             the app: signin, signup, app (My notes), session, review (Study mode),
                         progress, classes, join, teacher (Class insights), lectures/new, account,
                         compare / insights (hidden demo pages)
  api/                   route handlers: auth, sessions, lectures, events, classes, progress, ask, health
components/              UI: InkCanvas, SessionCapture, ReviewView, MomentDetail, HelpPanel,
                         TeacherView, DeskShell (app shell), landing/, auth/, classes/
lib/                     analysis (scoring, pairing, classify, moments, gaps), storage (db.ts SQLite,
                         dbPostgres.ts), ai/ (providers, prompts, fixtures, TTS), auth/, demo seed + reset
scripts/                 seed-demo, demo, start-prod (Railway), demo asset generators
public/demo/             bundled lecture: audio, transcript, AI fixtures
e2e/                     Playwright specs         lib/__tests__/  vitest
docs/                    railway.md and write-ups
Dockerfile, railway.json, instrumentation.ts (periodic demo reset)
```

## Notes

- `npm run seed:demo` uses `tsx` and `pdf-lib`. They're dev dependencies, so seed from a normal
  `npm install`, not `--omit=dev`.
- This is Next.js 16. `AGENTS.md` is generated by `next dev` and points agents at the bundled Next docs.
