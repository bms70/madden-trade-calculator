# Madden League Trade Calculator — Canonical Ruleset Specification v4.4

**Public release:** Web Release v1.5.0  
**Ruleset:** v4.4  
**Status:** Draft Pick revaluation, continuous value curves, and window-based verdicts  
**Supersedes:** Ruleset v4.2 (archived in `archive/ruleset-v4.2/`). There is no released Ruleset v4.4.

## Scope
Ruleset v4.4 revalues Draft Picks, replaces several step tables with continuous curves, tightens the FAIR window, and measures verdict severity from the FAIR window instead of from an even trade. Player/mixed protection tiers and multipliers, the dev/age table, cap tiers, early-career and role multipliers, QB-to-QB age context, and package credits are unchanged from Ruleset v4.2.

## Player value
Player value = OVR value × Position × Dev/Age × Cap × Contract control × Early career × Cornerstone scarcity × Role × Aging, then × QB-to-QB age context. Unchanged factors keep their v4.2 values.

### OVR value (star curve)
OVR value = 34 × (max(0, OVR − 60) ÷ 30)^1.3.

The derivative, (34 ÷ 30) × 1.3 × ((OVR − 60) ÷ 30)^0.3, rises with OVR, so each point is worth more than the one before it. Reference: 70 = 8.2 · 75 = 13.8 · 80 = 20.1 · 85 = 26.8 · 90 = 34 · 95 = 41.5 · 99 = 47.8.

**Pick/player balance.** The scale of 34 (v4.2 equivalent: 30) is set so that, across a reference basket of 400 players (OVR 76–92, ages 23–32, all dev traits, QB/WR/EDGE/HB/LB, $8M, 3 years) and the 32 first-round slots, first-round picks carry about 1.74× their v4.2 weight relative to players (geometric means). The effect is not uniform: about 1.05× at 1.01, 1.88× at 1.16, and 2.05× at 1.32. OVR 60 or lower = 0.

### Position
QB 1.40 · EDGE 1.20 · CB 1.20 · WR 1.20 · OT 1.10 · DT 1.05 · TE 1.00 · S 1.00 · LB 0.95 · HB 0.90 · IOL 0.90 · FB 0.50 · K 0.50 · P 0.50. OT replaces LT and covers both tackle spots.

### Aging (exponential decay)
Aging = e^(−k × max(0, age − start)), the solution of dA/d(age) = −k·A. Applies to every development trait.

| OVR | start | k | 31 | 32 | 33 | 34 | 35 | 36 | 37 |
|---|---|---|---|---|---|---|---|---|---|
| Under 80 | 30 | 0.105 | 0.900 | 0.811 | 0.730 | 0.657 | 0.592 | 0.533 | 0.480 |
| 80+ | 31 | 0.08 | 1.000 | 0.923 | 0.852 | 0.787 | 0.726 | 0.670 | 0.619 |

### Contract control (discounted integral)
base(Y) = 1 + b × ∫₀^(Y−1) e^(−0.1t) dt = 1 + b × (1 − e^(−0.1(Y−1))) ÷ 0.1, with b set so base(5) = 1.34 (b ≈ 0.1031). Blank years = 1. Reference: 1 = 1.000 · 2 = 1.098 · 3 = 1.187 · 4 = 1.267 · 5 = 1.340 · 6 = 1.406 · 7 = 1.465. The cap-tier interaction is unchanged: full bonus at cap multiplier ≥ 1.00, half the bonus at 0.90, none at 0.80.

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
Timing = e^(−r·t), with r = ln(1 ÷ 0.85) so that Next year is exactly 0.85x. Current draft 1.00x · Next year 0.85x · Two years away 0.7225x. Draft Pick value = pick value × timing. Each pick is discounted once.

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

If one package has the higher selected eligible Player value, that receiving side is the Protected Acquisition Side. Required Target = Protected Package × acquisition multiplier. FAIR Maximum = Required Target × 1.05. Counter-Package must be between Required Target and FAIR Maximum, inclusive.

If the selected eligible positive-value Players are exactly equal across packages, use the 5% Adjusted Gap path. If neither positive package contains an eligible positive-value Player, use the same 5% path. If either Adjusted Package Value is zero, the trade is incomplete.

## Package quality and precision
Assets rank from highest to lowest Individual Asset Value. Six positions receive 100%, 90%, 75%, 60%, 50%, and 50% credit. Exact ties rank sequentially by input order. Internal calculations and comparisons use full precision; rounding is display-only.

## Draft-only protection
Protection is selected from the identity of the strongest pick in the package receiving the higher best pick, not from its value. Because exact slots are current-draft only, 1.01–1.03 protection applies only to the current draft's 1.01–1.03.

- Acquire 1.01: 1.15x required return, target through +5%.
- Acquire 1.02 or 1.03: 1.08x, target through +5%.
- Other meaningful trade-up: 1.04x, target through +5%.
- Lateral/near-lateral: 1.00x, target through +5%.

## Verdicts
Each test has a FAIR window: Required Target through Required Target × 1.05 for directional and draft-only trade-ups, and an Adjusted Gap of 5% or less for the even path (equal best picks, exact Player-value tie, or no eligible Player).

Distance d is how far the trade lands outside its window, relative to the nearest edge:
- Short of the target: d = (Target − Counter) ÷ Target.
- Above the ceiling: d = (Counter − FAIR Maximum) ÷ FAIR Maximum.
- Even path: d = Adjusted Gap − 0.05.

Verdict: d = 0 FAIR · d under 5% QUESTIONABLE · 5% to under 15% UNFAIR · 15% or more LEAGUE-BREAKING. Band edges are lower-inclusive. On the even path this equals FAIR ≤ 5% gap, QUESTIONABLE under 10%, UNFAIR under 20%.

**Favored side.** Outside the window, the verdict names the side the trade favors: the protected (acquiring) side when the counter-package is short, the counter side when it is above the ceiling, and the higher Adjusted Value side on the even path.

**Fairness Score** = 100 × e^(−(d ÷ 0.12)²): 100 inside the window, about 84 at d = 5%, about 21 at d = 15%.

## Suggested Correction
Directional and draft-only trades add the exact shortfall below Required Target or remove/return the exact excess above FAIR Maximum. The even path requires the lower package to reach 95% of the higher package. Correction math uses full precision.

## Trade Intelligence
The eight reads are Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, Fairness Score, and Suggested Correction.

## Web UI requirements
Web Release v1.5.0 provides Calculator, How to Use, and Rules views; up to six assets per side; responsive desktop/mobile layout; compact collapsible completed asset cards that preserve expanded/collapsed state while editing; result terminology, examples/common trade types, common mistakes, and defaults in How to Use; and member-facing Rules content without publishing combined implementation formulas. The Draft Pick Timing selector offers only the timings allowed for the selected pick.

## Release gate
Excel and web must agree on all v4.4 values, curves, and verdict rules, regression/parity must pass, desktop Excel recalculation and browser smoke require release-owner sign-off, governed documents must align, and the final cross-file audit must pass before publication.
