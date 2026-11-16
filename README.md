# Madden League Trade Calculator

A free, single-page web calculator for grading player and draft-pick trades in a Madden league. Enter what each team receives and the calculator values the assets, applies Ruleset v4.0, compresses multi-asset packages, and returns a verdict with Trade Intelligence.

**Release:** v1.0.0  
**Ruleset:** v4.0  
**Live site:** [Madden League Trade Calculator](https://bms70.github.io/madden-trade-calculator/)

## How to use it

1. Under **Team A receives** and **Team B receives**, add the assets each team receives. Each side supports up to 9 assets.
2. Choose **Player** or **Draft Pick** for each populated row.
   - **Player:** enter OVR, age, position, and dev trait. These four fields are required before the player contributes value. Cap hit, years remaining, years in league, current role, and projected role refine the valuation.
   - **Draft Pick:** select the exact pick or future-first projection and its timing.
3. Review the individual values, raw totals, adjusted totals, verdict, and Trade Intelligence as the trade updates.
4. **Clear trade** resets the calculator.

### Blank-field defaults

- Blank Years in League = 1.00x. It is **not** treated as Year 0.
- Blank Years Remaining = 1.00x contract control.
- Blank Current or Projected Role = no role adjustment.
- Blank Draft Timing = Current draft / 1.00x.
- Blank cap hit = $0M for valuation.

Calculations use full internal precision. Display rounding does not determine the verdict.

## How trades are valued

### Players

Players begin with `max(0, OVR - 60)` and are adjusted for:

- development trait and age;
- position scarcity;
- QB and non-QB cap-hit tiers;
- Franchise Cornerstone status;
- early-career value;
- current and projected role;
- aging adjustments for 70-79 OVR players age 31+;
- contract control; and
- QB-versus-QB age comparison.

Premium acquisition protection uses this precedence:

- **Elite QB:** 1.30x required adjusted return
- **Franchise Cornerstone:** 1.20x
- **Standard player acquisition:** 1.10x

An Elite QB is age 26 or younger, 90+ OVR, Superstar or X-Factor. A Franchise Cornerstone is age 26 or younger, 87+ OVR, Superstar or X-Factor. Qualifying Cornerstones receive a 1.25x individual scarcity multiplier.

When both packages include quarterbacks, each QB is compared with the youngest opposing QB for the QB-age adjustment.

### Draft picks

Ruleset v4.0 uses exact values for every current first-round selection:

`1.01-1.08: 90, 83, 77, 71, 67, 63, 60, 57`  
`1.09-1.16: 55, 53, 50, 48, 46, 44, 42, 40`  
`1.17-1.24: 38, 37, 36, 35, 34, 33, 32, 31`  
`1.25-1.32: 30, 29, 28, 27, 26, 25, 24, 23`

Other draft values:

- Early / Mid / Late 2nd: **19 / 16 / 13**
- Early / Mid / Late 3rd: **9 / 7 / 5**
- 4th / 5th / 6th / 7th: **4 / 3 / 2 / 1**
- Future Early / Mid / Late / Unknown 1st: **67 / 46 / 31 / 44**

Timing multipliers:

- Current draft: **1.00x**
- Next year: **0.85x**
- Two years away: **0.70x**

For draft-trade classification, **Best Pick Value** is calculated after the timing multiplier is applied.

## Package quality

Assets on each side are ranked by individual value and receive:

`100% / 90% / 75% / 60% / 50% thereafter`

This prevents a pile of smaller assets from matching a premium asset at full face value. Equal-valued assets still occupy sequential package positions; input-row order breaks exact ties.

## Draft-only trade protection

Draft-only trades use a one-sided acquisition test for the team moving up:

- **1.01:** 1.15x required adjusted return
- **1.02-1.03:** 1.08x
- **Other meaningful trade-ups:** 1.04x
- **Lateral / near-lateral moves:** 1.00x

A meaningful ordinary trade-up occurs when the stronger Best Pick Value is more than 8% greater than the other package's Best Pick Value.

### FAIR window

The trade-down package must reach the required target and remain within **8% above the target**.

For 1.01 at 90:

- Required minimum: `90 x 1.15 = 103.5`
- FAIR ceiling: `103.5 x 1.08 = 111.78`

So the displayed FAIR range is approximately **103.5-111.8 adjusted value**.

### Adjacent-pick guidance

These are commissioner guidelines, not separate hard-coded validation gates:

- Top-10 one-slot move: at least a **5th**
- Later 1st / 2nd: at least a **6th**
- 3rd round or later: at least a **7th**

The actual pick-value gap can require more.

## How the verdict works

- **FAIR:** the applicable player/mixed acquisition requirements are satisfied, or the draft-only trade meets its acquisition requirement and FAIR window.
- **QUESTIONABLE:** not FAIR; adjusted gap is under 12%.
- **UNFAIR:** not FAIR; adjusted gap is 12% to under 22%.
- **LEAGUE-BREAKING:** not FAIR; adjusted gap is 22% or more.

`REASONABLE` is not an active Ruleset v4.0 verdict.

## Trade Intelligence

The calculator provides seven reads:

1. **Primary Read**
2. **Best Asset**
3. **Raw Value**
4. **Adjusted Value**
5. **Draft Capital**
6. **Package Structure**
7. **Suggested Correction**

These explain the major ruleset driver, value balance, draft-capital balance, package structure, and which side needs additional adjusted value when the trade is not FAIR.

## Ruleset and parity

**Ruleset v4.0 is the source of truth.** The Excel workbook and web calculator are synchronized implementations of the same ruleset.

The current Excel-versus-web regression baseline records **55 tests passed and 0 failed**, covering the v4.0 draft curve, timing, package compression, player protections, blank/default behavior, Trade Intelligence, representative trade scenarios, and verdict boundaries.

Interactive browser smoke testing and Excel desktop recalculation remain separate release-gate activities.

## Version history

| Version | Summary |
|---|---|
| v4.0 | Exact first-round values, premium top-10 curve, 1.01 haul protection, graduated draft trade-up rules, 8% draft FAIR window, synchronized Excel/web logic, and expanded Trade Intelligence |
| v3.3 | Trade explanations and Elite QB protection |
| v3.1-v3.2 | Premium-asset protection, package quality, multi-scenario Excel calculators, and documentation development |
| v3.0 | Contract control, Year 0 rookie treatment, role, aging, and QB-age model |
| v2.x | Tighter verdict bands, draft-pick tuning, layout, and version-history improvements |
| v1.x | Original player and draft calculator foundation |

## Hosting

The calculator is available at [https://bms70.github.io/madden-trade-calculator/](https://bms70.github.io/madden-trade-calculator/). There is no build step or installation required.

## Credits

Originally built as an Excel workbook and evolved through multiple ruleset releases. **Release v1.0.0** is the first public site release and uses **Ruleset v4.0**.
