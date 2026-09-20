@AGENTS.md

# My Tracker — working notes

Personal task + time tracker. Google Sheets is the database; this Next.js app
is the UI on top of it. Single user, runs on localhost. There is no auth layer
and that is deliberate — see "Boundaries" before adding one.

## Commands

| Command | Use |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run verify` | **The gate.** lint → typecheck → test. Run before committing. |
| `npm run lint` | ESLint (flat config). Next 16 removed `next lint`; `next build` no longer lints. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run test:coverage` | Vitest + v8 coverage |
| `npm run sheets:init` | Create/seed tabs in the configured spreadsheet |
| `npm run hooks:install` | Point git at `.githooks/` (pre-commit secret guard, pre-push verify) |

Node >= 22 (`.nvmrc` pins 24). Use `npm ci`, not `npm install`, when you want
the lockfile honored.

**`typecheck` alone is weaker than it looks.** `tsconfig.json` includes
`.next/types/**`, which does not exist on a fresh checkout — so `tsc --noEmit`
passes there while skipping every generated route type. Run `npm run build`
first if you are validating route signatures.

## Architecture

Layers, outermost first. Each one only knows the layer below it:

- `src/app/*/page.tsx` — the views. Client components, React Query for data.
- `src/app/api/**/route.ts` — thin handlers. Validate input, call `repo/`,
  return. Business rules do not live here.
- `src/lib/repo/` — typed CRUD + business rules. This is where a new operation
  belongs.
- `src/lib/storage/` — `sheets.ts` and `local.ts`, both implementing
  `StorageDriver`. **Nothing above this layer may know which driver is active.**
- `src/lib/domain/` — pure logic, zero I/O: timer state machine, quadrant
  classification, recommendation scoring, interval merging, plan math. New
  logic that can be pure belongs here, because this is the layer that is
  actually well tested.
- `src/lib/schema.ts` — the canonical spreadsheet schema. Single source of
  truth for every tab and column.

## Invariants — do not break these

1. **Timers are derived, never accumulated.** Elapsed time is always recomputed
   from the open entry's `checkIn` plus the sum of closed entries. Never store
   a running total in client state; a refresh must not be able to lose time.
2. **Every timer/entry mutation carries a client-generated `opId`.** That is
   the idempotency key that makes retries, double-clicks and offline replay
   safe. A new mutation on that path needs one too.
3. **A task's own duration is the literal sum of its entries**, but cross-task
   day totals merge overlapping intervals — two tasks running in parallel for
   30 min cost the day 30 min, not 60. See `src/lib/domain/intervals.ts`.
4. **Schema changes are append-only.** `sheets.ts` matches columns by name or
   alias and appends unknown ones. Renaming or removing a column key orphans
   the data already in a user's sheet — there is no migration mechanism and no
   schema version field. Add columns; do not rename them.
5. **The sheet is a supported input.** A user can type a bare title into the
   Tasks tab and the app claims that row on next load. Do not assume rows were
   written by the app.
6. **Writes are serialized through an in-process queue** (`sheets.ts`), which
   protects against interleaved writes within one process only. It is not a
   cross-process lock.

## Conventions

- Comments explain *why*, not what — match the existing density, which is low
  but load-bearing. Look at `src/lib/storage/index.ts` for the register.
- Reuse the shared kit in `src/components/ui.tsx` and the `useNow(ms)` hook in
  `src/hooks/use-app.ts` rather than reading the clock during render — React
  19's purity lint rule will reject `Date.now()` in a render body.
- Tests live in `tests/**/*.test.ts` (node environment, `.tsx` is not matched
  by the include pattern). Any test touching `repo/` must set
  `STORAGE_DRIVER=local` — otherwise an ambient env var can point the suite at
  the real spreadsheet.

## Secrets

`credentials/` and every `.env*` file are gitignored, and `.githooks/pre-commit`
blocks them plus any staged private-key material. A service-account key was
committed once before; `main` was rewritten clean but the blob still exists on
`backup/pre-secret-rewrite` and `feature/projects-milestones`. **Do not push
those two branches.** The key on disk has not been rotated.

## Boundaries

This app trusts its caller completely: no auth, no CSRF check, no rate limit,
and `next start` binds all interfaces. That is acceptable for localhost and
only for localhost. Exposing it to a network means adding authentication first,
not as a follow-up.
