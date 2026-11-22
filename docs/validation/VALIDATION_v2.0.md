# Validation — Web Release v2.0 / Ruleset v4.4

Recorded 2026-11-22 (America/Chicago) on `release/web-v2.0` (build steps 1–7, PRs #34–#39 and the release-docs PR).

## Result

| Gate | Result |
|---|---|
| Valuation unchanged | **PASS**: `valuation.js` byte-identical to `ruleset-v4.4-baseline`; 10 of 12 baseline files unchanged (manifest addendum) |
| Automated suites | **PASS**: 7 suites, 421 checks, 0 failures |
| Headless browser checks | **PASS** (stubbed backend; see below) |
| Launch, history counts and live smoke test | **PENDING**: release owner, following `docs/roadmap/v5/V5_WEB_V2.0_RUNBOOK.md` |

## Automated suites

| Suite | Command (repo root) | Result |
|---|---|---|
| Ruleset v4.4 regression | `node tests/ruleset-v4.4.test.js` | 64 / 64 PASS |
| Browser scripts (league mode, history, commissioner) | `node tests/web-v2.0-league-mode.test.js` | 85 / 85 PASS |
| Edge Function logic | `node --experimental-strip-types tests/web-v2.0-functions.test.mjs` | 83 / 83 PASS |
| League-mode database | `python3 tests/web-v2.0-db.test.py` | 67 / 67 PASS |
| Owner toolkit and launch sequence | `python3 tests/web-v2.0-owner-toolkit.test.py` | 54 / 54 PASS |
| Snallabot receiver database (regression) | `python3 tests/snallabot-import-db.test.py` | 40 / 40 PASS |
| Snallabot receiver logic (regression) | `node --experimental-strip-types tests/snallabot-import-logic.test.mjs` | 28 / 28 PASS |

The Python suites need a scratch Postgres 15+ (`PGHOST`, `PGPORT`, `PGUSER`). They create and drop their own databases and never touch the live project. The new TypeScript modules also type-check under `tsc --strict`.

### What they establish

- **Snapshot contract:** for all 16 parity scenarios, the v2.0 snapshot equals the v1.5.0 snapshot (from `calculator-ui.js` at the baseline tag) field for field, apart from `web_release`. This holds with League mode on and teams chosen. Stored text keeps the engine's side names, and team names appear on screen only, HTML-escaped.
- **Practice mode** cannot submit (Q25).
- **`accept-trade`:**
  - v2.0/v4.4 league trades need the league fields and are logged through `submit_league_trade`. An unknown league returns 404, and a team from another league returns 400.
  - v1.5.0/v4.4 works for the switchover. v1.4.0/v4.2 is refused.
- **Commissioner sessions:**
  - They are signed and expire after 30 minutes. A tampered league is rejected.
  - v1 Admin and v2 commissioner tokens can't be swapped in either direction.
  - Every action uses the token's league.
- **Database:**
  - Teams per league (32, OMH, AZ, 6 human), submit and its rejects, revisions and assets, review / correct / reverse.
  - Another league can't act. Login returns OK, BAD, LOCKED (5 wrong in 15 minutes), NOT_SET or UNKNOWN.
  - Browser roles have no direct table access, and the staged step-5 policy drop works.
- **Owner toolkit:** creates a league, loads teams from a Snallabot export (re-run safe; IDs kept), fixes teams, and sets and resets the password (clearing the lockout).
  - It moves pre-league history with counts and Q22 statuses, and the switchover sweep works.
  - It renames, archives and rotates the secret.
  - It is refused to anon, authenticated and service_role.

## Headless browser checks

Done in Chrome (headless) against the page served locally, with the Supabase client stubbed:

- **Practice:** values identical to League mode, no submit button.
- **League:** an unknown name gives "No league with that name". Entering the league, choosing teams and submitting a trade sends the right fields to `accept-trade`, and the remembered league comes back after a reload.
- **Trade History:** the four badges, team headings, and a corrected trade with its original submission.
- **Commissioner:** sign-in, the queue with flags, correction mode and Save correction (the request carries `CORRECT`, the reason and the edited snapshot), and the audit log.
- Light, dark and mobile (390 px). There were no page errors in any run.

## Found and fixed during the build

- The history list stayed visible under an opened trade (`display: grid` overrode `hidden`). This bug was present in v1.5.0 and is fixed in step 4.
- The page code checked `controlled_by = 'HUMAN'` while the database stores `'USER'`. Human teams would have shown as CPU. Fixed in step 6.

## Pending (release owner)

1. Launch runbook steps 0–6, including the step 4 count check against the step 0 backup.
2. Live smoke test (runbook step 7) on desktop and phone.
3. Retire the v1.5.0 Admin functions and `ADMIN_PASSWORD`.
4. About a week later: remove `v1.5.0` from `accept-trade` and record its hash in the manifest addendum.
5. Carried over from v1.5.0: desktop Excel recalculation sign-off for the v4.4 workbook (risk R13). v2.0 doesn't change the workbook.
