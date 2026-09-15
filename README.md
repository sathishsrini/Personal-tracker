# My Tracker

A personal task-management and time-tracking app. Google Sheets is the
database; this Next.js app is the UI on top of it — plan your day, prioritize
by effort vs. impact, track time down to the second, and see where your time
actually went.

You can type a task straight into the spreadsheet with nothing but a title —
the app fills in an id, status, priority, category and timestamps the next
time it loads, and writes them back to the sheet.

## Quick start (no Google account needed yet)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Google credentials configured, the app
automatically falls back to a local JSON file at `data/local-db.json` — fully
functional, just not synced to a spreadsheet. Settings → Storage shows which
mode you're in.

## Connecting Google Sheets

1. **Create a spreadsheet.** Any blank Google Sheet works — the app creates
   all 13 tabs (Tasks, Subtasks, TimeEntries, DailyPlan, WeeklyPlan,
   TaskHistory, Categories, Priorities, Statuses, ActivityTags,
   DashboardData, Reports, Settings) and seeds sensible defaults the first
   time it connects. Copy the spreadsheet id out of its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

2. **Create a service account** (this is how the app authenticates —
   there's no interactive Google login):
   - Go to the [Google Cloud Console](https://console.cloud.google.com/),
     create a project (or reuse one).
   - Enable the **Google Sheets API** for that project.
   - Under *APIs & Services → Credentials*, create a **Service account**.
   - Open the service account, go to *Keys → Add key → Create new key →
     JSON*, and download it.

3. **Share the spreadsheet** with the service account. Open the JSON key
   file and copy the `client_email` field (looks like
   `something@your-project.iam.gserviceaccount.com`). In your Google Sheet,
   click *Share* and give that email address **Editor** access.

4. **Configure the app.** Copy `.env.example` to `.env` and fill in:

   ```bash
   STORAGE_DRIVER=sheets
   GOOGLE_SHEETS_SPREADSHEET_ID=<the id from step 1>
   GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json
   ```

   Put the downloaded JSON key at that path (the `credentials/` folder is
   git-ignored). If you'd rather not keep a key file around, you can instead
   set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` directly —
   see the comments in `.env.example`.

5. **Initialize and run:**

   ```bash
   npm run sheets:init   # creates tabs/headers and seeds defaults — optional,
                         # the app does this automatically on first request too
   npm run dev
   ```

   Settings → Storage should now show "Google Sheets" with a link to open
   the spreadsheet.

### Using the sheet directly

The **Tasks** tab is the one place designed for quick manual entry — type a
title into the `Task` column (or its header can just say `Task` or `Point`)
and leave everything else blank. The app claims that row on its next load:
assigns an id, `Yet to Start` status, `Medium` priority, your default
category/type, and a created timestamp, then writes those back so the row
becomes a fully-fledged task. Everything else — priority, effort/impact,
planning, time tracking, subtasks, notes — is meant to be managed from the
UI, though the sheet is never off-limits: edit a cell by hand and it'll be
picked up (and, for dates/numbers, is read back correctly whether Sheets
stored it as text or as a real date/number cell).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the unit/integration test suite (Vitest) |
| `npm run sheets:init` | Ensure tabs/headers/defaults exist in the configured spreadsheet |

## How it's put together

- **`src/lib/schema.ts`** — the canonical spreadsheet schema (every tab,
  every column, and the header aliases that let a hand-typed `Task` column
  map onto the real field).
- **`src/lib/storage/`** — the storage layer. `sheets.ts` talks to the
  Google Sheets API; `local.ts` is the JSON-file fallback. Both implement
  the same row-level `StorageDriver` interface, so nothing above this layer
  knows or cares which one is active. Every mutation is serialized through
  an in-process queue so a double-click can't interleave two writes.
- **`src/lib/domain/`** — pure logic with no I/O: the timer state machine
  (derives running/accumulated time from stored entries, not a client
  accumulator, so a refresh can never lose it), effort/impact quadrant
  classification, the "what should I work on" scoring, concurrency-safe
  time aggregation, and daily-plan math.
- **`src/lib/repo/`** — typed CRUD and business rules on top of storage:
  task/subtask/timer/plan/settings/lookup operations, all timer actions
  keyed by a client-generated `opId` so retries and offline replays can
  never create a duplicate entry or double-count time.
- **`src/app/api/`** — thin Next.js route handlers that validate input and
  delegate to `repo/`.
- **`src/app/*/page.tsx`** — the eight primary views (Dashboard, Task List,
  Task Detail, Quadrant, Daily/Weekly Planner, Time Tracker, Reports,
  Settings), plus `src/components/` and `src/lib/client/` for the shared UI
  kit, the offline-safe API client, and snapshot polling.

## Reliability notes

- **Timers** are derived state, not client state: starting/pausing/
  resuming/stopping writes a row to `TimeEntries`, and the UI always
  recomputes elapsed time from that row's `checkIn` plus the sum of earlier
  closed entries. Refresh, navigate away, close the tab — the timer is
  exactly where it left off because it was never anywhere else.
- **Every timer/entry mutation carries an idempotency key** (`opId`). If a
  request is retried (a flaky connection, a double click, an offline queue
  replay), the server recognizes the same `opId` and returns the existing
  result instead of creating a second entry.
- **Concurrent tasks don't double-count time.** A task's own recorded
  duration is always the literal sum of its entries, but cross-task
  "how much of my day did I use" figures merge overlapping intervals so two
  tasks run in parallel for 30 minutes cost 30 minutes of the day, not 60.
- **Offline safety.** If a timer action fails for a network reason, it's
  queued in `localStorage` with its `opId` intact and replayed in order the
  next time the app is online — never dropped, never duplicated.

## Known limitations

- The **Daily Planner** and **Weekly Planner** save a full day/week as one
  unit (add/edit/remove all persist immediately — there's no separate "Save"
  step to forget). Reports that need history across many days fetch what's
  cheaply available from the live snapshot; very long historical trends
  beyond "today / this week / all time" would need a dedicated endpoint.
- Sheets writes go through the standard Sheets API rate limits, which are
  generous for one person's use but not built for many simultaneous editors.
