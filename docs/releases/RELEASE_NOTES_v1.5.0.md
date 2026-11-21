# Madden League Trade Calculator — Web Release v1.5.0

**Ruleset:** v4.3
**Release theme:** Draft Pick revaluation
**Ruleset impact:** Yes — Draft Pick values, timing, and draft-only protection

## Overview

Web Release v1.5.0 introduces Ruleset v4.3. Draft Picks were undervalued compared with the players they are traded for, and Future 1sts could avoid the timing discount. Ruleset v4.3 raises pick values, ties each pick to the timings it can have, and selects draft-only trade-up protection by which pick is involved.

Player valuation, player/mixed protection, package credits, verdict bands, Suggested Correction, Trade Intelligence, Trade History, and Admin are unchanged.

## Valuation changes

| Pick | v4.2 | v4.3 |
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

The full first-round table is in `docs/rules/CANONICAL_RULESET_v4.3.md`.

## Rule changes

- **Pick/timing pairing.** Exact slots 1.01–1.32 are Current draft only. Future 1sts are Next year or Two years away (blank means Next year). Round 2–7 tiers allow any timing. Previously a Future 1st could be set to Current draft and skip the discount entirely, and a specific slot could be set to a later year.
- **Draft-only protection by pick identity.** The 1.15x (1.01) and 1.08x (1.02–1.03) trade-up premiums were triggered by values of exactly 90 and 77 or more. With the new values that would have applied the 1.08x premium to most of round 1, so the premium is now chosen by the strongest pick's slot.

## Interface changes

- The Timing selector lists only the timings allowed for the selected pick, and changing the pick corrects the timing.
- How to Use and Rules show the v4.3 values and timing rules.
- Accepted-Trade snapshots record `web_release: v1.5.0` and `ruleset_version: v4.3`. Trades logged before this release keep their original v4.2 values.

## Validation

- `node tests/ruleset-v4.3-draft-picks.test.js`: 30 / 30 PASS
- Excel/Web parity, member guide (.docx), Wiki, and browser smoke: pending
