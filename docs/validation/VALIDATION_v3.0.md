# Validation — Web Release v3.0 / Ruleset v4.4

Recorded 2026-11-27 (America/Chicago) on `web-v3.0`.

## Result

| Gate | Result |
|---|---|
| Valuation unchanged | **PASS**: `valuation.js` byte-identical to `ruleset-v4.4-baseline` |
| Automated suites | **PASS**: 13 suites, 0 failures (below) |
| Headless browser check | **PASS** (stubbed backend), at 1280 px and 390 px. "Whose pick" lists the giving team's picks; submit stays disabled with "Choose whose pick Mid 2nd (Next year) is." until one is chosen, then enables; the card shows "via KC". The Commissioner tab renders Draft picks (rollover hint, filters, owner selects) and Exports (health, Mark current). No page errors |
| Launch and live check | **PENDING**: release owner (`V5_WEB_V3.0_RUNBOOK.md`) |

## Automated suites

| Suite | Command (repo root) | Result |
|---|---|---|
| Ruleset v4.4 regression | `node tests/ruleset-v4.4.test.js` | 64 / 64 |
| Browser scripts | `node tests/web-league-mode.test.js` | 132 / 132 |
| Edge Function logic | `node --experimental-strip-types tests/web-functions.test.mjs` | 123 / 123 |
| **Draft picks and exports database (new)** | `python3 tests/web-v3.0-picks-db.test.py` | **64 / 64** |
| Team editing database | `python3 tests/web-v2.1-teams.test.py` | 23 / 23 |
| League-mode database | `python3 tests/web-v2.0-db.test.py` | 67 / 67 |
| Owner toolkit | `python3 tests/web-v2.0-owner-toolkit.test.py` | 54 / 54 |
| Snallabot receiver database | `python3 tests/snallabot-import-db.test.py` | 40 / 40 |
| Snallabot receiver logic | `node --experimental-strip-types tests/snallabot-import-logic.test.mjs` | 28 / 28 |
| Import history | `python3 tests/import-history-db.test.py` | 45 / 45 |
| Trade ledger | `python3 tests/trade-ledger-db.test.py` | 53 / 53 |
| Team ID changes | `python3 tests/team-id-changes-db.test.py` | 22 / 22 |
| Free agents | `python3 tests/free-agents-db.test.py` | 22 / 22 |

The new TypeScript type-checks under `tsc --strict`.

### What the new checks establish

- **Snapshot:** v3.0 is the v1.5.0 snapshot apart from `web_release` and a trailing `pick_id: null` on every asset, for every parity scenario.
- **Submit:**
  - Picks move both ways in the same transaction.
  - A refused pick leaves no trade and no move.
  - Refused cases: no choice, the wrong round, the wrong year, the same pick twice, a pick owned by someone else, an unknown pick, a used pick.
  - Trades without picks and leagues without tracking are unaffected.
- **Correction and reversal:**
  - A correction moves the old picks back and the new ones in.
  - A refused correction changes nothing.
  - A reversal is refused while a pick has moved on ("trade #N"). Reversing in order restores every pick.
- **Commissioner and owner functions:**
  - Moving a pick, and the same owner again.
  - Draft complete: a double-click guard, then 2028 used, 2029 current, 2031 created.
  - Export review: one still arriving is refused; mark current works and is audited.
  - Setup, replay (MOVED / SKIPPED, safe to re-run) and access.
- **Browser:**
  - Auto-selection, choosing between two picks, the "no pick" message, and a duplicate pick blocking submit.
  - The submission carries `pick_id`, and choices reload after a submit and around a correction.
  - Commissioner panels, a pick move, Draft complete (confirm step) and Mark current.
