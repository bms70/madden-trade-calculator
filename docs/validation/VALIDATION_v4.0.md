# Validation — Web Release v4.0 / Ruleset v4.4

Recorded 2026-11-27 (America/Chicago) on `web-v4.0`.

| Gate | Result |
|---|---|
| Valuation unchanged | **PASS**: `valuation.js` byte-identical to `ruleset-v4.4-baseline` |
| Automated suites | **PASS** (below) |
| Headless browser check | **PASS** (stubbed backend, 1280 px and 390 px). League context shows DAL "Win-now · strong" (7-1) and OMH "Rebuilding · strong" (1-7), with the selling-while-winning warning; League activity lists Needs a look, Trades to check, Handled and Other moves. No page errors |
| Launch and live check | **PENDING**: release owner (`V5_WEB_V4.0_RUNBOOK.md`) |

| Suite | Result |
|---|---|
| Ruleset v4.4 regression | 64 / 64 |
| Browser scripts (`tests/web-league-mode.test.js`) | 182 / 182 |
| Edge Function logic (`tests/web-functions.test.mjs`) | 147 / 147 |
| **League activity and posture database (new, `tests/web-v4.0-db.test.py`)** | **37 / 37** |
| v3.0 picks, v2.1 teams, v2.0 league, owner toolkit, Snallabot, import history, ledger, team IDs, free agents | 64, 23, 67, 54, 40 + 28, 45, 53, 22, 22: all PASS |

What the new checks establish:
- **Posture:**
  - Timing weights match the roadmap rules, and the labels and strength follow the decided bands (.600 / .400, ties half).
  - Both warnings fire only for human teams.
  - Edits and the week override work.
  - The submission and Trade History carry the posture, and the review queue flags warnings.
- **Database:**
  - The posture is stored on submit and kept through a correction, and it's refused when it isn't an object or is over 4000 characters.
  - Posture inputs follow the current export.
- **Activity:**
  - Moves are listed with `check_this` and limited to recent exports.
  - Handled marks can be set and undone, with notes; both are audited.
  - Trades to check list unlinked players and players not seen in game.
  - Player candidates and linking work, back to automatic as well (audited).
- **Access:** the commissioner functions are refused to the browser.
