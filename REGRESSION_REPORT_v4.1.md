# Excel-versus-Web Regression Report - Ruleset v4.1

**Public release:** v1.2.0  
**Ruleset:** v4.1  
**Baseline:** Ruleset v4.0 regression recorded 55 passed / 0 failed.

## Purpose
Ruleset v4.1 is a usability/structure update. The intentional rules change is the maximum package size from nine assets per side to six. The v4.0-derived player valuation, draft curve, timing, premium protections, package-quality schedule, verdict thresholds, precision requirements, and seven Trade Intelligence reads are carried forward.

## Carry-forward regression baseline
The following v4.0 behaviors remain release requirements for v4.1:

- Exact current 1.01-1.32 curve.
- Early/Mid/Late 2nd = 19 / 16 / 13.
- Early/Mid/Late 3rd = 9 / 7 / 5.
- 4th / 5th / 6th / 7th = 4 / 3 / 2 / 1.
- Future Early/Mid/Late/Unknown 1st = 67 / 46 / 31 / 44.
- Timing = 1.00 / 0.85 / 0.70.
- Elite QB acquisition = 1.30x; Cornerstone = 1.20x; Standard = 1.10x.
- Franchise Cornerstone individual scarcity = 1.25x.
- Package credits = 100% / 90% / 75% / 60% / 50% / 50% for the six available package positions.
- Sequential tied-value ranking; input order breaks exact ties.
- Draft acquisition premiums = 1.15x / 1.08x / 1.04x / 1.00x.
- Draft-only FAIR target window = 8%.
- Active verdicts = FAIR / QUESTIONABLE / UNFAIR / LEAGUE-BREAKING.
- Fallback boundaries = under 12%, 12% to under 22%, 22% or more.
- Full internal precision; display rounding does not determine verdicts.
- Trade Intelligence = Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, Suggested Correction.

## v4.1 structural checks

| Area | Check | Status | Detail |
|---|---|---|---|
| Trade structure | Six assets per side | STATIC PASS | Current v4.1 web and workbook are structured for a six-asset maximum. |
| Trade structure | Seventh asset blocked | STATIC PASS | Web add control is capped at six; workbook current input surface is six assets per side. |
| Trade structure | Removal restores capacity | STATIC PASS | Web remove flow reduces the package count and restores an available slot. |
| Web navigation | Calculator tab | STATIC PASS | Present in the v1.2.0 single-page navigation. |
| Web navigation | How to Use tab | STATIC PASS | Present with receiving-side entry, defaults, result guidance, examples, and common mistakes. |
| Web navigation | Rules tab | STATIC PASS | Present as member-facing rules/reference content. |
| Rules presentation | Combined formulas hidden from public Rules tab | STATIC PASS | Rules tab uses descriptions, thresholds, multipliers, and point references rather than full implementation formulas. |
| Responsive UI | Compact/collapsible asset editing | STATIC PASS | Asset details are expanded only while editing. |
| Responsive UI | Mobile single-column flow | STATIC PASS | Mobile styling stacks the trade sections rather than requiring a wide table. |
| Trade Intelligence | Seven reads available | STATIC PASS | Primary Read plus six expandable supporting reads remain present. |
| Versioning | Release v1.2.0 / Ruleset v4.1 | STATIC PASS | Current web, workbook, and release documentation use the new version mapping. |
| Help migration | Standalone help page superseded | STATIC PASS | Current operating guidance is integrated into How to Use; prior help.html is an archive artifact. |

## Carry-forward scenario set
The v4.0 numerical regression report recorded the following representative scenarios and boundaries as passing; they remain the v4.1 parity targets because the valuation model is not intentionally retuned in this release:

- 1.01 minimum boundary.
- 1.01 overpay ceiling.
- 1.02 trade-up.
- Meaningful ordinary trade-up.
- Near-lateral adjacent move.
- Equal-best-pick packages.
- Current-versus-future timed comparison.
- Three firsts for 1.01.
- Late quantity versus premium pick.
- 7.9999% / 8.0000% fallback boundary cases.
- 11.9999% / 12.0000% fallback boundary cases.
- 21.9999% / 22.0000% fallback boundary cases.

## Release gates
- **Interactive browser smoke test:** COMPLETE. Recorded complete by release owner.
- **Excel desktop recalculation check:** COMPLETE. Recorded complete by release owner.

## Release decision
**Static v4.1 regression/release checks:** PASS.  
**Manual release gates:** COMPLETE by release-owner sign-off.  
**Final publication gate:** PASS.
