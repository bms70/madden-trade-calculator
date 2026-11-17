# Madden League Trade Calculator

A responsive single-page web calculator for grading player and draft-pick trades in a Madden league. **Web Release v1.2.0** uses **Ruleset v4.1**.

## Release v1.2.0 / Ruleset v4.1
- Maximum trade package: **6 assets per side**.
- Compact collapsible asset cards reduce scrolling.
- Desktop uses side-by-side receiving packages; mobile stacks the trade vertically.
- Navigation is integrated into one page: **Calculator | How to Use | Rules**.
- The former standalone help experience is folded into the **How to Use** tab; keep older `help.html` only with archived prior-release materials.
- The **Rules** tab explains algorithms, thresholds, multipliers, and basic point values without reproducing combined formulas.
- The v4.0-derived player, draft, package-quality, precision, verdict, and seven-read Trade Intelligence behavior is carried forward; the intentional rules change is the package maximum from 9 to 6.

## How to use it
1. Add assets under the team that **receives** them.
2. Choose **Player** or **Draft Pick**.
3. Player: OVR, age, position, and dev trait are required before the player contributes value. Cap hit, years remaining, years in league, current role, and projected role refine valuation.
4. Draft Pick: select the exact current pick or future-first projection and timing.
5. Review Adjusted Value and the verdict at the top; expand **Trade Analysis** for the seven reads.
6. Reopen a completed asset card to edit it, remove an asset to free a slot, or use **Clear trade** to reset.

### Blank-field defaults
- Blank Years in League = neutral 1.00x; blank is **not** Year 0. Enter `0` explicitly for Year 0 rookie treatment.
- Blank Years Remaining = neutral 1.00x contract control.
- Blank Current or Projected Role = no role adjustment.
- Blank Draft Timing = Current draft / 1.00x.
- Blank cap hit = $0M for valuation.
- Calculations use full internal precision; display rounding does not determine the verdict.

## Rules at a glance
### Premium player protection
- Elite QB: QB, age 26 or younger, 90+ OVR, Superstar/X-Factor; **1.30x required adjusted return**.
- Franchise Cornerstone: age 26 or younger, 87+ OVR, Superstar/X-Factor; **1.25x individual scarcity** and **1.20x required return**.
- Standard player acquisition: **1.10x required adjusted return**.

### Package quality
The six available package positions receive **100% / 90% / 75% / 60% / 50% / 50%** credit. Equal-valued assets occupy sequential positions; input order breaks exact ties.

### Draft references
Current first round:
- 1.01-1.08: **90, 83, 77, 71, 67, 63, 60, 57**
- 1.09-1.16: **55, 53, 50, 48, 46, 44, 42, 40**
- 1.17-1.24: **38, 37, 36, 35, 34, 33, 32, 31**
- 1.25-1.32: **30, 29, 28, 27, 26, 25, 24, 23**

Other draft values: Early/Mid/Late 2nd **19/16/13**; Early/Mid/Late 3rd **9/7/5**; 4th/5th/6th/7th **4/3/2/1**; Future Early/Mid/Late/Unknown 1st **67/46/31/44**.

Timing: Current **1.00x**, Next year **0.85x**, Two years away **0.70x**.

Draft-only acquisition: 1.01 **1.15x**; 1.02-1.03 **1.08x**; other meaningful trade-up **1.04x**; lateral/near-lateral **1.00x**. Draft-only FAIR treatment uses the **8% target window**.

### Verdicts
- **FAIR**: applicable player/mixed or draft-only FAIR test passes.
- **QUESTIONABLE**: not FAIR; adjusted gap under 12%.
- **UNFAIR**: adjusted gap 12% to under 22%.
- **LEAGUE-BREAKING**: adjusted gap 22% or more.

## Trade Analysis
Seven reads remain available: **Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, Suggested Correction**.

## Files in the v1.2.0 / v4.1 release set
- `index.html`
- `README.md`
- `CANONICAL_RULESET_v4.1.md`
- `Madden League Trade Calculator v4.1.xlsx`
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.1.docx`
- `Madden League Ruleset Change Log and Archive Index - v1.2.0.docx`
- `Madden League Ruleset Update Record - v1.2.0 Ruleset v4.1.docx`

## Versioning and archive
Public web releases and calculator rulesets are versioned independently. This package maps **Web Release v1.2.0** to **Ruleset v4.1**. Preserve the frozen v4.0 materials and prior standalone `help.html` in the historical archive rather than reusing them as current files.
