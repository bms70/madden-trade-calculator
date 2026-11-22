# Madden League Trade Calculator — Web Release v1.5.0

**Ruleset:** v4.4
**Release theme:** Draft Pick revaluation, continuous value curves, tighter verdicts
**Ruleset impact:** Yes — Draft Pick values and timing, player value curves, positions, verdict windows and severity

## Overview

Web Release v1.5.0 introduces Ruleset v4.4. It raises Draft Pick values and fixes Future 1st timing, replaces several step tables with continuous curves, tightens the FAIR window, and measures how unfair a trade is from the FAIR window rather than from an even swap. Ruleset v4.3 was never released; its pick changes are part of v4.4.

Protection tiers and multipliers, the dev/age table, cap tiers, early-career and role multipliers, package credits, Trade History, and Admin are unchanged.

## Valuation changes

| Pick | v4.2 | v4.4 |
|---|---|---|
| 1.01 | 90 | 100 |
| 1.07 | 60 | 94.9 |
| 1.16 | 40 | 80 |
| 1.17 | 38 | 80 |
| 1.32 | 23 | 50 |
| Early / Mid / Late 2nd | 19 / 16 / 13 | 30 / 26 / 22 |
| Early / Mid / Late 3rd | 9 / 7 / 5 | 16 / 13 / 10 |
| 4th / 5th / 6th / 7th | 4 / 3 / 2 / 1 | 7 / 5 / 3 / 2 |
| Future Early / Mid / Late / Unknown 1st | 67 / 46 / 31 / 44 | 97.2 / 85.7 / 66 / 83.9 |

The full first-round table is in `docs/rules/CANONICAL_RULESET_v4.4.md`.

## Rule changes

- **Pick/timing pairing.** Exact slots 1.01–1.32 are Current draft only. Future 1sts are Next year or Two years away (blank means Next year). Round 2–7 tiers allow any timing. Previously a Future 1st could be set to Current draft and skip the discount entirely, and a specific slot could be set to a later year.
- **Draft-only protection by pick identity.** The 1.15x (1.01) and 1.08x (1.02–1.03) trade-up premiums were triggered by values of exactly 90 and 77 or more. With the new values that would have applied the 1.08x premium to most of round 1, so the premium is now chosen by the strongest pick's slot.

## Player value changes

| Factor | v4.2 | v4.4 |
|---|---|---|
| OVR | Linear: OVR − 60 | Star curve: 34 × ((OVR − 60) ÷ 30)^1.3 (90 OVR = 34, was 30) |
| Positions | EDGE 1.20, CB/WR 1.15, LT 1.10 | EDGE/CB/WR 1.20, OT 1.10 (covers both tackles) |
| Aging | 70–79 OVR only, steps 0.90 / 0.75 / 0.60 from 31 | Every player: e^(−0.105 × years past 30) under 80 OVR; e^(−0.08 × years past 31) at 80+ |
| Contract control | 1.00 / 1.07 / 1.16 / 1.25 / 1.34 (5+) | Discounted integral: 1.00 / 1.10 / 1.19 / 1.27 / 1.34 / 1.41 / 1.47 |
| Draft timing | 1.00 / 0.85 / 0.70 | e^(−rt): 1.00 / 0.85 / 0.7225 |

## Verdict changes

- FAIR window: target through +5% (was +8%); even-trade path 5% (was 8%).
- Severity is distance outside the FAIR window: QUESTIONABLE under 5%, UNFAIR 5% to under 15%, LEAGUE-BREAKING 15%+. Previously it was the gap from an even trade (12% / 22%), which could rate a bargain for an elite QB milder than a slight overpay.
- **Fairness Score** (0–100) = 100 × e^(−(d ÷ 0.12)²), with the side the trade favors. Shown under the verdict and as an eighth Trade Intelligence read.

## Interface changes

- The Timing selector lists only the timings allowed for the selected pick, and changing the pick corrects the timing.
- How to Use and Rules show the v4.4 values, curves, and verdict rules.
- The verdict box shows the Fairness Score and favored side instead of the raw Adjusted gap.
- Accepted-Trade snapshots record `web_release: v1.5.0` and `ruleset_version: v4.4`. Trades logged before this release keep their original v4.2 values.

## Backend

- `supabase/functions/accept-trade` now accepts v1.5.0 / v4.4 as well as v1.4.0 / v4.2. **Deploy it before the v1.5.0 site goes live**, or Accept & Log will be rejected.

## Validation

- `node tests/ruleset-v4.4.test.js`: 64 / 64 PASS
- Sample-trade impact: `docs/validation/IMPACT_COMPARISON_v4.2_to_v4.4.md`
- Excel/Web parity: 16 / 16 PASS (`docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md`); desktop Excel recalculation pending release-owner sign-off
- Browser smoke: COMPLETE (release-owner sign-off)
- Member guide: `docs/rules/Madden League Trade Rules and Valuation Guide - Ruleset v4.4.docx`
- Reference workbook: `reference/Madden League Trade Calculator v4.4.xlsx`

## Maintenance: Snallabot connection (backend only, 2026-11-21)

Recorded as maintenance on v1.5.0; no site change and no new Web Release number. Ruleset v4.4 is unchanged.

- New migration `supabase/migrations/20261122060000_snallabot_import.sql`: `leagues` (minimal), `import_snapshots`, `import_payloads`, a health check, a retention rule (full bodies for the newest 10 snapshots) and the `import_snapshot_summary` view. No existing table or function changes.
- New Edge Function `supabase/functions/snallabot-import` (deploy with `--no-verify-jwt`; Snallabot sends no auth header, so the secret in the URL is checked as a hash).
- Site-owner script `docs/roadmap/v5/sql/connect-snallabot.sql`. Design and setup: `docs/roadmap/v5/V5_SNALLABOT_CONNECTION.md`.
- Tests: `tests/snallabot-import-logic.test.mjs` (28 / 28 PASS), `tests/snallabot-import-db.test.py` (37 / 37 PASS); `node tests/ruleset-v4.4.test.js` 64 / 64 PASS.
- **Live 2026-11-22:** migration applied (`npx.cmd supabase db push --remote`), function deployed, league record created. First main-league export complete: 44 requests, 7.06 MB, 32 / 32 rosters, season 2027, week 5.
- **Retention setting (2026-11-22):** migration `20261122070000_snallabot_retention_setting.sql` adds `leagues.import_keep_full_snapshots` (default 5, was a fixed 10). Tests: database 40 / 40 PASS.
