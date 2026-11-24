# Validation — Web Release v2.1 / Ruleset v4.4

Recorded 2026-11-24 (America/Chicago) on `release/web-v2.1`.

## Result

| Gate | Result |
|---|---|
| Valuation unchanged | **PASS**: `valuation.js` byte-identical to `ruleset-v4.4-baseline` |
| Automated suites | **PASS**: 8 suites, 0 failures (below) |
| Headless browser check | **PASS** (stubbed backend). The Teams section renders on desktop and at 390 px, a save sends the right request and shows "NYG saved.", and there are no page errors |
| Launch and live check | **PENDING**: release owner (`RELEASE_NOTES_v2.1.md`, Launch) |

## Automated suites

| Suite | Command (repo root) | Result |
|---|---|---|
| Ruleset v4.4 regression | `node tests/ruleset-v4.4.test.js` | 64 / 64 |
| Browser scripts | `node tests/web-league-mode.test.js` (renamed from `web-v2.0-league-mode.test.js`) | 94 / 94 |
| Edge Function logic | `node --experimental-strip-types tests/web-functions.test.mjs` (renamed from `web-v2.0-functions.test.mjs`) | 98 / 98 |
| Team editing database | `python3 tests/web-v2.1-teams.test.py` | 23 / 23 |
| League-mode database | `python3 tests/web-v2.0-db.test.py` | 67 / 67 |
| Owner toolkit | `python3 tests/web-v2.0-owner-toolkit.test.py` | 54 / 54 |
| Snallabot receiver database | `python3 tests/snallabot-import-db.test.py` | 40 / 40 |
| Snallabot receiver logic | `node --experimental-strip-types tests/snallabot-import-logic.test.mjs` | 28 / 28 |

The new TypeScript type-checks under `tsc --strict`.

### What the new checks establish

- **Snapshot:** for all 16 parity scenarios, the v2.1 snapshot equals the v1.5.0 snapshot from the baseline tag, apart from `web_release`.
- **`accept-trade`:** v2.1 and v2.0 are accepted; v1.5.0 is refused with no database call.
- **Corrections:** v2.1 snapshots are accepted.
- **`commissioner-teams`:**
  - LIST is the default action and uses the token's league. A request with no token gets 401, and one for another league gets 403.
  - UPDATE accepts any case, "Human" means USER, and a blank label becomes null.
  - Bad control, label, name or team values are refused before any database call. A team in another league gets 404.
- **Database:**
  - The commissioner list includes owner labels. The public list shows the new control and no labels.
  - Each change is audited with before and after values. A save with no change creates no event. An empty label clears it.
  - A team from another league, an archived league, and the anon and authenticated roles are all refused.
  - `owner_load_teams` restores Snallabot's values, as documented.
- **Page:**
  - The Teams list is escaped and shows the count of human teams.
  - Saving needs the commissioner's name and sends the trimmed label.
  - The pickers reload after a change but not after an unchanged save.
  - A 401 signs out and clears the list.
