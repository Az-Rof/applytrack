# ApplyTrack

Automated job application tracking & analytics — Next.js + Prisma + PostgreSQL + a Chrome extension + a report layer.

Implements the full PRD (V1 + V2 + V3).

## Features

| PRD | Feature | Where |
| --- | --- | --- |
| V1 | Manual add application | `/applications/new` |
| V1 | Status tracking with history | `/applications/[id]` |
| V1 | Dashboard analytics | `/`, `/analytics` |
| V1 | Follow-up reminders (14 days inactivity) | `/reminders`, `src/lib/services/reminders.ts` |
| V2 | Chrome extension (auto-capture apply events) | `extension/` |
| V2 | Auto fill database via `/api/capture` | `src/app/api/capture/route.ts` |
| V2+ | Sync submitted applications from Glints — one click, no file needed | `/sync`, `src/lib/import/*`, `src/app/api/sync/glints/route.ts`, `extension/` |
| V2+ | Offline fallback: import from a Glints HAR capture | `/sync`, `src/app/api/sync/har/route.ts` |
| V3 | Extraction + weekly/on-demand report | `src/lib/agent/*`, `/insights` |

## Quick start

```bash
# 1. Configure environment
cp .env.example .env        # then edit DATABASE_URL / EXTENSION_API_KEY

# 2. Create the database schema
npm run db:push             # or: npm run db:migrate

# 3. (optional) Load demo data
npm run db:seed

# 4. Run
npm run dev                 # http://localhost:3000
```

### PostgreSQL

Install PostgreSQL 16 (or newer) and make sure the service is running. With the
default install (`postgres` superuser, password `postgres`, port `5432`) the
`.env.example` connection string works out of the box.

On Windows:

```powershell
winget install PostgreSQL.PostgreSQL.16
```

Then create the database:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE applytrack;"
```

> **Portable alternative (no admin needed).** This repo was verified with the
> portable binaries from
> [theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries).
> Download `postgresql-<ver>-x86_64-pc-windows-msvc.zip`, extract to `.pgbin/`, then:
>
> ```powershell
> .\.pgbin\postgresql-<ver>-x86_64-pc-windows-msvc\bin\initdb.exe -D .pgdata -U postgres --auth=trust -E UTF8
> .\.pgbin\postgresql-<ver>-x86_64-pc-windows-msvc\bin\pg_ctl.exe -D .pgdata -o "-p 5433" -l .pgdata\server.log start
> .\.pgbin\postgresql-<ver>-x86_64-pc-windows-msvc\bin\psql.exe -h localhost -p 5433 -U postgres -c "CREATE DATABASE applytrack;"
> ```
>
> …and set `DATABASE_URL="postgresql://postgres@localhost:5433/applytrack?schema=public"`.

## Chrome extension

```bash
node extension/generate-icons.mjs   # optional — icons are already included
```

1. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder.
2. Open the extension **Settings** and set the API URL (`http://localhost:3000`) and the API key (must match `EXTENSION_API_KEY` in `.env`).
3. Browse Glints / LinkedIn / Kalibrr / Indeed and click **Apply** — the application is captured automatically. You can also press **Capture this job** in the popup.

The content script detects apply clicks/form submits, waits for the SPA to settle, scrapes JSON-LD + platform selectors, and posts to `/api/capture`. The server verifies the API key, optionally enriches the data with an LLM, then saves it with duplicate detection (normalized URL).

### Auth: email + password (user id)

Every account is a user identified by its `id`. **Register** on `/login`
(email + password, min. 8 chars) or log in with an existing account; the
password is stored as a scrypt hash (`src/lib/password.ts`, Node's built-in
crypto — no extra dependency). Login creates a row in the `Session` table
and sets an httpOnly cookie (`applytrack_session`, 30 days); only the
session token's SHA-256 hash is stored, so a database leak does not expose
live sessions. Log out deletes the session row server-side.

**Extension:** log in once in the popup (or Settings) with the same email +
password. The login returns a session token, stored in
`chrome.storage.local` and sent as `X-ApplyTrack-Session` on every
capture/sync — no cookies needed, so third-party-cookie blocking is
irrelevant. On a 401 the token is cleared and the popup asks you to log in
again. **Open dashboard** opens `${apiUrl}/` — the web dashboard has its
own login (same email + password, cookie session).

Demo account (seeded by `npm run db:seed`): **demo@applytrack.dev /
demo12345** — delete it in production. Registration is open by default;
for a shared/public deployment, gate or remove `POST /api/auth/register`.

> Migrating from the old workspace-code auth (before 12 Nov 2026):
> one command does the whole migration — `npm run db:migrate-auth`
> (`scripts/migrate-to-email-auth.ts`). It checks the Prisma CLI is 6.x,
> generates the client, fills the legacy users' NULL emails with
> placeholders (`<workspace-code>@applytrack.local`, so `db push` can
> make `email` required), runs `npx prisma db push --accept-data-loss`
> (drops the old `User.code` column and the `PlatformConnection` table),
> and seeds the demo account. Then run `npm run dev`, register on the
> dashboard, and log in in the extension with the same email + password.
> Existing accounts keep their data but have no password — register a new
> account (or set `passwordHash` directly) and re-import, because the old
> workspace codes no longer log anyone in. If your `node_modules` is
> stale (Prisma CLI 7.x), the script refuses and tells you to extract the
> zip into a fresh folder and run `npm ci` first.
>
> Extension login errors, in plain words:
> - `Can't reach the ApplyTrack server at …` — `npm run dev` is not
>   running (or `apiUrl` in Settings is wrong).
> - `Invalid email or password.` — that account doesn't exist yet:
>   register on the dashboard first.
> - `Server error — the database still needs the migration` — run
>   `npm run db:migrate-auth`.
> - `Can't reach` / blank popup after an extension update — click
>   **Reload** (↻) on the card in `chrome://extensions`.

### Deploying the backend (so others can install only the extension)

1. **Database:** create a free Postgres at [Neon](https://neon.tech) (or Supabase/Railway). Copy the connection string.
2. **Hosting:** import the repo on [Vercel](https://vercel.com) and set env vars:
   - `DATABASE_URL` — the Neon connection string (use `?sslmode=require`; Neon needs pooling, i.e. the pooled `-pooler` URL, for serverless)
   - `EXTENSION_API_KEY` — a strong random string shared with the extension
   - `CRON_SECRET` — for the `/api/cron/reminders` endpoint
   - `OPENAI_API_KEY` — *(optional)* enables LLM enrichment & report narratives; heuristics are used otherwise
3. `npx prisma db push` against the Neon URL (run locally with `DATABASE_URL` set, or add a one-off Vercel build step).
4. In `extension/options.js` change the default `apiUrl` to your deployed URL (and `manifest.json` `host_permissions` accordingly), then share the `extension/` folder (zip it, or publish to the Chrome Web Store).
5. Optionally add a Vercel Cron entry hitting `POST /api/cron/reminders` daily.

### Troubleshooting (V2)

| Symptom | Cause / fix |
| --- | --- |
| `HTTP 500` with `Prisma Client on edge runtime` in dev logs | Middleware imported Prisma. Middleware runs on the Edge runtime — it now only checks the `applytrack_session` cookie and redirects to `/login`. Restart `npm run dev` (and delete `.next`) after changing `src/middleware.ts`. |
| Stuck on a redirect loop to `/login` | No/invalid session cookie. Log in with your email and password (or the demo account). |
| `Capture failed: Unauthorized` | `apiKey` in the extension settings ≠ `EXTENSION_API_KEY` in `.env`. In development a mismatch is only logged; in production it returns 401. |
| `Not logged in` (401) | The session expired or the account was logged out. Log in again in the extension popup (or the dashboard). |
| `Capture failed: HTTP 404` / CORS error | `apiUrl` in the extension settings is wrong (must be `http://localhost:3000`), or you browsed via `127.0.0.1` — both are allowed in `host_permissions`. |
| `Could not extract required fields` (422) | The page didn't expose a job title/company. Fill it manually via **Add Application**, or use **Capture this job** from the popup on the job detail page. |
| Extension changes not applied | Click **Reload** (↻) on the card in `chrome://extensions`. |


## Sync from Glints (no file needed)

`/sync` keeps every submitted Glints application and its current status /
status timeline up to date. **No `.har` file is required.**

> **Why the pull runs in the browser:** glints.com fronts its API with a
> firewall that blocks *server-side* requests (HTTP 403 "Glints - Firewall",
> regardless of the cookie). Requests from a real Chrome extension service
> worker, made with the user's own session, pass the firewall.

1. **One click via the extension (the only way):** open the ApplyTrack popup
   while logged in to glints.com and press **Sync Glints applications**. The
   background worker pages through `/api/me/applications`, fetches every
   application's status timeline and the `/api/companies` payloads **inside
   your browser** (`credentials: include`), and POSTs the raw API payloads to
   `POST /api/sync/glints`, which normalizes and upserts them exactly like the
   HAR importer. The session cookie itself is **never sent to ApplyTrack** —
   only the application payloads.
2. **No server-side pull anymore:** since 12 Nov 2026 the server never pulls
   from glints.com and never stores a Glints cookie — there is no connection
   panel, no pasted cookie, no stored `PlatformConnection`. The old
   server-pull code (`pullGlintsApplications`, `checkGlintsSession`,
   `/api/sync/glints/connection`) was deleted together with the model. If the
   extension says your Glints session expired, just log in to glints.com
   and press Sync again.
3. **Offline fallback:** *Import from a .har capture* in the collapsible
   block on `/sync` still works without any live session — the parser reads
   the `getApplications` GraphQL / `/api/me/applications` responses plus
   per-application `applicationStatusTracking` timelines and `/api/companies`.
   Only the response bodies are read; the HAR's cookies are never used.

   | Glints | ApplyTrack |
   | --- | --- |
   | NEW → Applied, IN_REVIEW → HR Screening, ASSESSMENT → Technical test, INTERVIEWING → Interview, OFFERED → Offer, HIRED → Accepted, REJECTED → Rejected |

**Job-posting signals** are mirrored separately from the application status,
and a closed posting has two distinct flavors:
- **Job Removed** (red, like Rejected) — posting closed *and* carrying a
  Glints moderation flag, e.g. `fraudReportFlag: VERIFIED_SCAM_FRAUD`
  (removed because it was verified scam). The flag itself is shown in amber
  ("Verified scam").
- **Closed** (red, like Rejected) — posting closed by the employer without
  moderation (`status: CLOSED` + `closedAt`, no flag): "no longer accepting
  applications".

The application's own status (e.g. HR Screening) is kept untouched, exactly
like Glints shows the chips next to the progress.

**Auto-reject**: users can set a "days without status change" threshold
(settings card on `/reminders`, stored per user). Once an in-progress
application has been quiet longer than the threshold, it is automatically
marked Rejected (with a history note). Runs when the reminders page loads,
during every Glints sync, and can be triggered manually
from the card. A sync never overrides an auto-rejected row unless the platform
itself recorded a newer event after the auto-rejection.

Sync is idempotent: existing rows are matched by the Glints application/job ID
(`Application.externalId`, with a URL-fragment fallback for rows captured by
the extension). Rows created by the extension get enriched and their status is
updated from Glints (with a `StatusHistory` entry dated to the real Glints
event); rows created **manually** are only enriched — status differences are
reported as conflicts instead of being overwritten. When Glints answers 401
to the pull (expired session), the extension says so and you just log in to
glints.com and press Sync again. Useful check scripts:

```powershell
npx tsx scripts/test-glints-har.ts path\to\capture.har   # parse + map preview (Glints)
npx tsx scripts/verify-glints-import.ts                  # dump imported rows
npx tsx scripts/seed-demo-duplicate.ts                   # dedupe test fixture
```

## Sync from JobStreet — REMOVED (12 Nov 2026)

JobStreet sync was removed for now: its sync kept failing and, in the
first redesign, unifying the extension sync listeners accidentally deleted
the JobStreet browser-pull implementation while leaving a reference to it
in `PLATFORM_SYNC_RUNNERS` — that `ReferenceError` killed the whole
extension service worker at load, so *every* sync (Glints included)
failed. The fix: JobStreet is out of the product surface for now —
`/api/sync/jobstreet` + `/connection`, `src/lib/import/jobstreet*.ts`,
the JobStreet panel/button in `/sync` and the extension, and the
JobStreet entries in the extension manifest are all gone. The unified
Glints fetch (`aggregateGlintsPayloads` in `src/lib/import/glints-client.ts`,
extension payloads in, candidates out) is the only fetch left. Historical JobStreet rows already in the database
and the `JobStreet` platform value in the status map / manual-add form are
kept so old data still displays. Restoring JobStreet later means
re-implementing the pull (the previous server pull used the `GetAppliedJobs`
GraphQL query on `https://id.jobstreet.com/graphql`) and adding it back
through the same single fetch function.

## Reports & extraction

- **Extraction** (`src/lib/agent/extract.ts`): repairs/normalizes extension payloads. Falls back to deterministic heuristics when `OPENAI_API_KEY` is empty.
- **Insights** (`src/lib/agent/insights.ts`): computes metrics, platform performance, monthly trend and funnel; LLM writes the narrative. A rule-based analyst is used as fallback so the feature always works.

## One fetch function (Glints)

All Glints fetching goes through a single function,
`aggregateGlintsPayloads(payloads)` in `src/lib/import/glints-client.ts`:
raw payloads in (captured by the extension inside the user's browser, or
read out of a HAR file), `{ candidates, counts }` out. It makes no request
of its own — in particular no server→glints.com request and no cookie is
ever involved on the server side. `/api/sync/glints` and `/api/sync/har`
both call it, so neither duplicates pull/normalize logic. The extension
mirrors this: one `syncPlatform(platform)` in `extension/background.js`
(one message type, `APPLYTRACK_SYNC_PLATFORM`) and one
`syncPlatform(platform, button)` in `extension/popup.js`, driving the
single **Sync Glints applications** button. (The function used to be a
two-mode `fetchGlintsApplications` with a server pull; the server-pull
branch was removed on 12 Nov 2026 — see above.)

## Data model

- `User` → `Application` (unique per `userId + jobUrl`, re-identified by `externalId` for platform syncs)
- `StatusHistory` (audit trail), `Reminder`, `Report`
- `Session` (login sessions: token hash + expiry; the browser gets an httpOnly cookie, the extension sends the token as `X-ApplyTrack-Session`)

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register `{ email, password, name? }` → `{ user }` + session cookie |
| POST | `/api/auth/login` | Login `{ email, password }` → `{ user, token }` + session cookie (CORS `*`, used by the extension) |
| DELETE | `/api/auth/logout` | Delete the session (cookie or `X-ApplyTrack-Session` header) + clear cookie |
| GET | `/api/auth/me` | The currently logged-in user, or 401 |
| GET/POST | `/api/applications` | List (filters: `platform`, `status`, `company`, `q`, `from`, `to`) / create |
| GET/PATCH/DELETE | `/api/applications/[id]` | Detail / update (status change logged) / delete |
| POST | `/api/capture` | Extension capture (Bearer `EXTENSION_API_KEY` + `X-ApplyTrack-Session`) |
| POST | `/api/sync/glints` | Sync from extension payloads pulled in-browser (`{ payloads }`) — no cookies, no server-side pull |
| POST | `/api/sync/har` | Offline fallback: import/sync Glints applications from a `.har` upload (multipart) |
| GET/POST | `/api/reminders` | List (+scan) / `scan` or `resolve` |
| GET/POST | `/api/agent/report` | Latest report / generate new |
| POST | `/api/cron/reminders` | Generate reminders for all users (Bearer `CRON_SECRET`) |

## Notes

- Auth is **email + password**, users identified by `id`: login creates a `Session` row (token hashed with SHA-256), the browser gets an httpOnly cookie, the extension sends the token as `X-ApplyTrack-Session`. Demo account: demo@applytrack.dev / demo12345 (seeded; delete in production).
- Middleware is edge-safe (no Prisma) — it only checks the `applytrack_session` cookie and redirects to `/login`. Never import Prisma from `src/middleware.ts`.
- Reminder generation runs opportunistically when `/reminders` or `/api/reminders` is hit. For production, schedule `POST /api/cron/reminders` from a cron job (Vercel Cron / GitHub Actions / Task Scheduler).
