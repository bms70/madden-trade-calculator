# Madden League Trade Calculator — Canonical Ruleset Specification v4.3

**Public release:** Web Release v1.5.0  
**Ruleset:** v4.3  
**Status:** Draft Pick revaluation specification  
**Supersedes:** Ruleset v4.2 (archived in `archive/ruleset-v4.2/`)

## Scope
Ruleset v4.3 revalues Draft Picks. It raises every first-round slot, raises round 2–7 tiers, re-anchors Future 1st projections to the new curve, ties each pick to the timings it can have, and keys draft-only trade-up protection to the strongest pick's identity rather than its value. Player valuation, player/mixed protection, package credits, verdict bands, Suggested Correction, and the seven Trade Intelligence reads are unchanged from Ruleset v4.2.

## Draft Pick values
Values are before timing. Decimals are governed values, not display rounding.

| Pick | Value | Pick | Value | Pick | Value | Pick | Value |
|---|---|---|---|---|---|---|---|
| 1.01 | 100 | 1.09 | 92.2 | 1.17 | 80 | 1.25 | 64 |
| 1.02 | 99.7 | 1.10 | 90.7 | 1.18 | 78 | 1.26 | 62 |
| 1.03 | 99 | 1.11 | 89.1 | 1.19 | 76 | 1.27 | 60 |
| 1.04 | 98.2 | 1.12 | 87.4 | 1.20 | 74 | 1.28 | 58 |
| 1.05 | 97.2 | 1.13 | 85.7 | 1.21 | 72 | 1.29 | 56 |
| 1.06 | 96.2 | 1.14 | 83.9 | 1.22 | 70 | 1.30 | 54 |
| 1.07 | 94.9 | 1.15 | 82 | 1.23 | 68 | 1.31 | 52 |
| 1.08 | 93.6 | 1.16 | 80 | 1.24 | 66 | 1.32 | 50 |

- 1.01–1.16 follow `100 − 20 × (n ÷ 15)^1.5`, where n = slot − 1, rounded to one decimal. The top seven picks hold value; the decline steepens toward 1.16.
- 1.17–1.32 decline linearly by 2.0 per slot from 80 to 50.
- Later rounds: Early 2nd 30 · Mid 2nd 26 · Late 2nd 22 · Early 3rd 16 · Mid 3rd 13 · Late 3rd 10 · 4th 7 · 5th 5 · 6th 3 · 7th 2.
- Future 1sts map to representative current slots: Early = 1.05 (97.2) · Mid = 1.13 (85.7) · Late = 1.24 (66) · Unknown = 1.14 (83.9).

## Draft timing
Current draft 1.00x · Next year 0.85x · Two years away 0.70x. Draft Pick value = pick value × timing. Each pick is discounted once.

| Pick type | Allowed timing | Default when blank or invalid |
|---|---|---|
| Exact slot 1.01–1.32 | Current draft only | Current draft |
| Future 1st (Early / Mid / Late / Unknown) | Next year, Two years away | Next year |
| Round 2–7 tiers | Any | Current draft |

An invalid pairing (for example a Future 1st set to Current draft, or 1.05 set to Two years away) is valued with the default timing for that pick type, and the web UI offers only the allowed timings.

## Player/mixed protection
A Player is eligible for protection only when OVR, age, position, and development trait are complete and Individual Asset Value is greater than zero. Each package selects its highest eligible positive-value Player using full internal precision.

For an exact same-package Player-value tie, protection rank breaks the tie in this order: Elite QB, Franchise Cornerstone, Standard. If value and rank also tie, input order breaks the tie. Protection tier does not break an exact cross-package Player-value tie.

- Standard acquisition: 1.10x required return.
- Franchise Cornerstone: age 26 or younger, 87+ OVR, Superstar/X-Factor; individual scarcity 1.25x; acquisition return 1.20x.
- Elite QB: QB, age 26 or younger, 90+ OVR, Superstar/X-Factor; acquisition return 1.30x.

If one package has the higher selected eligible Player value, that receiving side is the Protected Acquisition Side. Required Target = Protected Package × acquisition multiplier. FAIR Maximum = Required Target × 1.08. Counter-Package must be between Required Target and FAIR Maximum, inclusive.

If the selected eligible positive-value Players are exactly equal across packages, use the 8% Adjusted Gap path. If neither positive package contains an eligible positive-value Player, use the same 8% path. If either Adjusted Package Value is zero, the trade is incomplete.

## Package quality and precision
Assets rank from highest to lowest Individual Asset Value. Six positions receive 100%, 90%, 75%, 60%, 50%, and 50% credit. Exact ties rank sequentially by input order. Internal calculations and comparisons use full precision; rounding is display-only.

## Draft-only protection
Protection is selected from the identity of the strongest pick in the package receiving the higher best pick, not from its value. Because exact slots are current-draft only, 1.01–1.03 protection applies only to the current draft's 1.01–1.03.

- Acquire 1.01: 1.15x required return, target through +8%.
- Acquire 1.02 or 1.03: 1.08x, target through +8%.
- Other meaningful trade-up: 1.04x, target through +8%.
- Lateral/near-lateral: 1.00x, 8% treatment.

## Verdicts
FAIR applies when the applicable player/mixed or draft-only test is satisfied. If not FAIR: Adjusted Gap under 12% = QUESTIONABLE; 12% to under 22% = UNFAIR; 22% or more = LEAGUE-BREAKING.

## Suggested Correction
Directional mixed trades add the exact shortfall below Required Target or remove/return the exact excess above FAIR Maximum. The 8% path requires the lower package to reach 92% of the higher package. Correction math uses full precision.

## Trade Intelligence
The seven reads are Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, and Suggested Correction.

## Web UI requirements
Web Release v1.5.0 provides Calculator, How to Use, and Rules views; up to six assets per side; responsive desktop/mobile layout; compact collapsible completed asset cards that preserve expanded/collapsed state while editing; result terminology, examples/common trade types, common mistakes, and defaults in How to Use; and member-facing Rules content without publishing combined implementation formulas. The Draft Pick Timing selector offers only the timings allowed for the selected pick.

## Release gate
Excel and web must agree on v4.3 Draft Pick values, timing pairing, and draft-only protection, and on v4.2 mixed-trade semantics carried forward, regression/parity must pass, desktop Excel recalculation and browser smoke require release-owner sign-off, governed documents must align, and the final cross-file audit must pass before publication.
