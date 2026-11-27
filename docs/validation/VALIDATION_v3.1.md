# Validation — Web Release v3.1 / Ruleset v4.4

Recorded 2026-11-27 (America/Chicago) on `web-v3.1`.

| Gate | Result |
|---|---|
| Valuation unchanged | **PASS**: `valuation.js` byte-identical to `ruleset-v4.4-baseline` |
| Automated suites | **PASS** (below) |
| Headless browser check | **PASS** (stubbed backend, 1280 px and 390 px). Future pick: Timing / Round / Projected; current pick: Timing / Round / Pick number, titled "Pick 2.14" and valued as Mid 2nd (26.0); Whose pick unchanged. No page errors |
| Launch and live check | **PENDING**: release owner |

| Suite | Result |
|---|---|
| Ruleset v4.4 regression (`node tests/ruleset-v4.4.test.js`) | 64 / 64 |
| Browser scripts (`node tests/web-league-mode.test.js`) | 151 / 151 |
| Edge Function logic (`node --experimental-strip-types tests/web-functions.test.mjs`) | 125 / 125 |
| Database suites | Unchanged from v3.0 (no migration) |

What the new checks establish:
- Every Timing / Round / Pick number / Projected combination builds a Ruleset v4.4 value key.
- 2nd and 3rd-round picks map 1–10 to Early, 11–21 to Mid and 22–32 to Late.
- Switching timing moves between a pick number and a tier sensibly.
- Older labels load: "Mid 2nd" in the current draft becomes pick 11, and a slot pick is always the current draft.
- `pick_number` is stored only for current-draft picks.
- Trade History shows "Pick 2.14".
- Every parity scenario gives the v1.5.0 snapshot apart from `web_release`, `pick_id: null` and `pick_number`.
