# V5_SNALLABOT_CONNECTION

The Snallabot connection: a backend-only receiver that stores every Snallabot export from the league. Drafted and built 2026-11-21, ahead of Web v2.0 (order change decided 2026-11-21; see `V5_OPEN_QUESTIONS.md`). **Ruleset v4.4 and the live site are unchanged.** It's recorded as backend maintenance on Web Release v1.5.0, with no new Web Release number.

**Status: live since 2026-11-22.** Merged in #31, migration applied and function deployed. The first main-league export was complete: 44 requests, 7.06 MB, 0 duplicates, all 32 rosters, season 2027, week 5, stage 1.

## What it does

- Receives Snallabot export requests at a secret URL (`snallabot-import` Edge Function).
- Stores every request **as received** (raw JSON body, route, size, SHA-256), grouped into **one import snapshot per export burst**.
- Keeps a **health check** per snapshot, updated with every request:
  - which teams sent rosters, and which are missing (checked against the `leagueteams` list)
  - whether league teams, standings and free agents arrived
  - the weekly routes received, plus any unknown routes
  - the season, current week and stage from standings
  - a `complete` flag
- **Retention:** full bodies are kept for the newest 10 snapshots per league. Older payloads keep their row, route, size and hash, but the body is cleared.
- **Nothing reads the data yet.** No site change, no pickers, nothing in the calculator. You view it in the Supabase dashboard. Normalizing rosters into a player list comes later (Web v3.0), from the stored raw bodies, so nothing is lost by waiting.

## What it doesn't do

- No league mode, commissioner area or site change (those are Web v2.0).
- No changes to `valuation.js`, `calculator-ui.js`, `accept-trade` or the existing tables.
- No review or "mark current" step. Snapshots are `RECEIVING`, then `RECEIVED`; the review statuses wait for Web v3.0.
- Free agents are stored raw but not used (out of scope).

## How it works

| Piece | File |
|---|---|
| Migration: `leagues` (minimal), `import_snapshots`, `import_payloads`, health check, retention, receiver function, summary view | `supabase/migrations/20261122060000_snallabot_import.sql` |
| Edge Function (path parsing, size and JSON checks, hashing) | `supabase/functions/snallabot-import/index.ts`, `logic.ts` |
| Function config (`verify_jwt = false`, since Snallabot sends no auth header) | `supabase/config.toml` |
| Site-owner script: create the league record and its secret, rotate the secret | `docs/roadmap/v5/sql/connect-snallabot.sql` |
| Tests | `tests/snallabot-import-logic.test.mjs`, `tests/snallabot-import-db.test.py` |

**Request path:** `…/functions/v1/snallabot-import/<secret>/<platform>/<leagueId>/<route>`. The function hashes the secret and passes the hash to `record_snallabot_payload()`, which does the following in one transaction:

1. **Finds the league** by the secret's hash. An unknown or archived league gets a **404**.
2. **Checks the league ID.** The first request records the Snallabot league ID and platform label. Any later request with a different league ID gets a **403**, so a leaked URL can't feed another league's data in.
3. **Locks the league** for the duration, so a parallel burst can't open two snapshots.
4. **Joins the open snapshot** if the last request was less than 10 minutes ago. Otherwise it closes the old snapshot (`RECEIVED`), opens a new one and trims old bodies.
5. **Stores the payload.** An identical route and body in the same snapshot counts as a duplicate and isn't stored twice.
6. **Updates the counters and the health check.**

**Responses:** `200 {"success": true}` when stored. `400` for bad JSON or a bad path, `413` over 5 MB, `404` for an unknown URL, `403` for a wrong league, `500` for a storage error. Error responses never reveal anything about the league.

**Access:** browser roles can't read or write any of these tables or call the function. Only the service role (the Edge Function and the dashboard) can.

**Storage:** one current-week export is about 40 requests and 6 MB. With 10 snapshots kept in full, that's about 60 MB of bodies. Older snapshots keep only their rows.

## Setup (site owner)

Do these in order. Steps 1–3 don't affect the live site.

1. **Merge the PR** into `main` (merge commit) and pull `main` in GitHub Desktop. GitHub Pages redeploys, but no site file changed.
2. **Apply the migration** to the linked (remote) project from the local repo folder:
   `npx.cmd supabase db push --remote`
   Without `--remote`, the current CLI targets a local Docker database and fails to connect. Confirm only if `20261122060000_snallabot_import.sql` is the only migration listed. It only adds new tables and functions; nothing existing is altered.
3. **Deploy the function:**
   `npx.cmd supabase functions deploy snallabot-import --no-verify-jwt`
   A "Docker is not running" warning is harmless; the function is built on Supabase's servers.
4. **Create the league record and secret.** Open the Supabase dashboard → **Explorer** (the query editor; older dashboards call it SQL Editor) → a new query against the database. Paste `docs/roadmap/v5/sql/connect-snallabot.sql`, replace `<LEAGUE NAME>` with the league's name, and run it. If the dashboard warns about Row Level Security, choose **Run and enable RLS** (RLS is already on). **Copy the `import_secret` it prints.** It's shown only once (only its hash is stored). Don't save the edited query as a notebook or anywhere public.
5. **Build the export URL:**
   `https://zcuycdgvpfotjnlltdyt.supabase.co/functions/v1/snallabot-import/<import_secret>`
   Treat it like a password: anyone with it can send data into the league's snapshots.
6. **Point Snallabot at it.** In the Snallabot dashboard, replace the old webhook.site destination (if it's still there) with this URL. Enter only this base URL; Snallabot adds the rest.
7. **Run one export** (current week), wait a couple of minutes, then check in Explorer:
   `select * from public.import_snapshot_summary order by first_received_at desc;`
   Expect one snapshot of about 40 requests, `rosters_received` = 32 if no teams were skipped, and `missing_roster_team_ids` listing any that were.
8. **Auto update (optional).** Once a manual export looks right, Snallabot's auto update can be turned on. Retention keeps it within storage.

**If the secret leaks or is lost:** run the "Rotate the secret" block at the bottom of the connect script, then paste the new URL into Snallabot. The old URL stops working at once.

## Tests

| Test | Result (2026-11-21) |
|---|---|
| `node --experimental-strip-types tests/snallabot-import-logic.test.mjs`: path parsing with all 40 captured paths, body checks, hashing, error mapping | 28 / 28 PASS |
| `tests/snallabot-import-db.test.py` on a scratch Postgres 16 database: all migrations, the connect script, a replay of the 40 captured requests, health check (29 rosters, TEN / HOU / MIN missing, 2027 week 5), duplicates, rejects, burst splitting, a complete 32-roster export, retention, access, an archived league, v1.4.0 delete still working | 37 / 37 PASS |
| `V5_SAMPLE_SCHEMA_TESTS.sql` over all migrations, including this one | 33 / 33 PASS |
| `node tests/ruleset-v4.4.test.js` | 64 / 64 PASS |

## Effects on later phases

- **Web v2.0:** `leagues` already exists (created here, with `commissioner_password_hash` nullable). The v2.0 migration adds `league_teams` and the trade tables, sets the commissioner password on this league row, and then makes the password column required. Release step 2 sets the password and seeds the teams instead of creating the league.
- **Web v3.0:** normalizing rosters, standings and teams reads from `import_payloads`. Review and "mark current" use the reserved statuses.
- **R21 (missing rosters):** resolved. The first live export had all 32 rosters, so the capture's three missing rosters were a one-off. The health check keeps flagging any future gaps.

## Decisions and assumptions

- **Order:** connection first, then Phase 2 (decided 2026-11-21).
- **Raw payloads only for now**, plus the health check; normalizing comes later (assumed, as recommended; Q29).
- **Retention: full bodies for the newest 10 snapshots** (assumed; Q30 asks how often the league exports).
