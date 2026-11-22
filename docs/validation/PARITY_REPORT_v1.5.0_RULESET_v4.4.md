# Excel/Web Parity — Web Release v1.5.0 / Ruleset v4.4

**Reference workbook:** `reference/Madden League Trade Calculator v4.4.xlsx`  
**Web engine:** `valuation.js` (Ruleset v4.4)  
**Scenarios:** `tests/parity-scenarios-v4.4.json`  
**Result:** 16 / 16 PASS (LibreOffice recalculation). Desktop Excel recalculation: **COMPLETE** (release-owner sign-off, 2026-11-22), after a pick-entry fix (see the end of this report).

Each scenario was entered into the workbook's input cells and recalculated, then compared with the web engine on every Individual Asset Value, both Adjusted Package Values, the verdict, the Fairness Score, and the favored side. Numeric tolerance: 1e-6.

| Scenario | Web adjusted (A / B) | Excel adjusted (A / B) | Web verdict | Excel verdict | Web score | Excel score | Result |
|---|---|---|---|---|---|---|---|
| Elite QB for 1.01+1.12 | 154.5682 / 178.6600 | 154.5682 / 178.6600 | UNFAIR | UNFAIR | 42.58 | 42.58 | PASS |
| Elite QB for 1.01+1.02+E2 | 154.5682 / 212.2300 | 154.5682 / 212.2300 | QUESTIONABLE | QUESTIONABLE | 99.76 | 99.76 | PASS |
| 88 SS WR for 1.05+M2 | 83.0117 / 120.6000 | 83.0117 / 120.6000 | LEAGUE-BREAKING | LEAGUE-BREAKING | 19.67 | 19.67 | PASS |
| Aging EDGE 33 for 1.24 | 28.5287 / 66.0000 | 28.5287 / 66.0000 | LEAGUE-BREAKING | LEAGUE-BREAKING | 0.00 | 0.00 | PASS |
| 3 starters for HB | 71.7913 / 71.8665 | 71.7913 / 71.8665 | LEAGUE-BREAKING | LEAGUE-BREAKING | 14.82 | 14.82 | PASS |
| Rookie WR Y0 + roles for 1.16 | 50.5223 / 80.0000 | 50.5223 / 80.0000 | LEAGUE-BREAKING | LEAGUE-BREAKING | 0.01 | 0.01 | PASS |
| OT for DT | 44.8386 / 38.2229 | 44.8386 / 38.2229 | LEAGUE-BREAKING | LEAGUE-BREAKING | 2.97 | 2.97 | PASS |
| QB vs QB age context + expensive 7yr | 59.8913 / 44.9173 | 59.8913 / 44.9173 | LEAGUE-BREAKING | LEAGUE-BREAKING | 0.09 | 0.09 | PASS |
| 1.04 for 1.09+FutMid next | 98.2000 / 157.7605 | 98.2000 / 157.7605 | LEAGUE-BREAKING | LEAGUE-BREAKING | 0.00 | 0.00 | PASS |
| 1.08 for FutEarly set current | 93.6000 / 82.6200 | 93.6000 / 82.6200 | LEAGUE-BREAKING | LEAGUE-BREAKING | 20.42 | 20.42 | PASS |
| 1.01 for 1.02+L2 FAIR | 100.0000 / 119.5000 | 100.0000 / 119.5000 | FAIR | FAIR | 100.00 | 100.00 | PASS |
| 1.03 for 1.06+M3 | 99.0000 / 107.9000 | 99.0000 / 107.9000 | FAIR | FAIR | 100.00 | 100.00 | PASS |
| equal picks even | 92.5000 / 110.2075 | 92.5000 / 110.2075 | UNFAIR | UNFAIR | 42.72 | 42.72 | PASS |
| no eligible players | 74.0000 / 79.9450 | 74.0000 / 79.9450 | QUESTIONABLE | QUESTIONABLE | 95.96 | 95.96 | PASS |
| slot pick set two years | 97.2000 / 97.2000 | 97.2000 / 97.2000 | FAIR | FAIR | 100.00 | 100.00 | PASS |
| aging under80 vet + cornerstone | 119.6592 / 160.7378 | 119.6592 / 160.7378 | UNFAIR | UNFAIR | 73.82 | 73.82 | PASS |

## Coverage

Elite QB and Franchise Cornerstone protection, Standard protection, quantity-for-quality bundling, rookie Year 0 with role change, QB-to-QB age context, expensive 7-year contract, aging under and over 80 OVR, OT position, draft-only 1.01 / 1.03 / meaningful trade-up, equal best picks, no eligible player, Future 1st set to Current draft, exact slot set to Two years away.

## Workbook changes for v4.4

- Logic Tables: v4.4 pick values, OT, CB/WR 1.20, timing and control values as formulas, Ruleset v4.4 / Release v1.5.0 labels, 5% window.
- Trade Calculator: Asset Value formula rebuilt for the OVR curve, exponential aging, contract integral, and pick/timing pairing; QB-age context now uses `MINIFS` (the v4.2 file stored `AGGREGATE` with an `_xludf.` prefix, which Excel treats as an unknown function). Verdict, Fairness Score, favored side, and Suggested Correction rebuilt on window-based helper cells (hidden columns AK–AZ). Fairness Score shown under the verdict and as a Trade Intelligence read; Suggested Correction moved to row 40. Position list uses OT.
- Rules & Definitions: v4.4 values; restored table rows whose detail cells had been lost to merged cells in v4.2.
- Version History and Version History Details: v4.4 entries.

Display differences that are not parity issues: the workbook keeps Team A / Team B wording and its existing Reduce-correction wording.

## Desktop Excel check and pick-entry fix (2026-11-22)

**Found in desktop Excel (risk R13):** a Draft Pick typed into **Player / Pick** (for example `1.32`) showed an Asset Value of **0**, and the verdict stayed "Add assets to both sides".

**Cause:** Excel stores a typed `1.32` as the **number** 1.32, and `1.10` as 1.1. The formulas look picks up as **text** (`1.32`, `1.10`) in Logic Tables column K, so a number found nothing. The LibreOffice parity run had entered picks as text, so it didn't show the problem.

**Fix (valuation unchanged):**

- Player / Pick cells (`B6:B11`, `B19:B24`) are formatted as **Text**, so a typed pick keeps its exact form.
- The 15 formulas that read those cells convert a number back to text first (`IF(ISNUMBER(B6),TEXT(B6,"0.00"),B6)`):
  - the 12 Asset Value cells (`N6:N11`, `N19:N24`)
  - the best-pick lookup for draft-only protection (`AN30`)
  - the two best-asset labels (`Z15`, `Z28`)
- A **pick drop-down** on the same cells lists every valid pick (`'Logic Tables'!K2:K47`). Its error alert is off, so player names can still be typed.

**Re-verified in LibreOffice:** all 16 scenarios, entered twice (picks as text, and picks as numbers the way Excel stores them): **32 / 32 PASS** against the web engine, tolerance 1e-6. The pre-fix workbook reproduces the defect with picks as numbers: 0 value, "Add assets to both sides".

**Desktop Excel sign-off (release owner, 2026-11-22), fixed file:**

| Trade | Excel (Asset Values, totals) | Verdict, value difference, Fairness | Web engine | Result |
|---|---|---|---|---|
| Elite QB for 1.01+1.12 | 154.56824 / 100.0 + 87.4 = 187.4 | UNFAIR, 13.5%, 43 (Team A, 11.1% outside) | Same | PASS |
| QB vs QB age context + expensive 7yr (uses `MINIFS`) | 59.89128 / 44.917267 | LEAGUE-BREAKING, 25.0%, 0 (Team A, 31.8% outside) | Same | PASS |
| Aging EDGE 33 for 1.24, entered with 7 years remaining instead of 2 | 38.067415 / 66 | LEAGUE-BREAKING, 42.3%, 0 (Team B, 50.1% outside) | Same for the 7-year entry (38.067415, 42.3%, 50.1%) | PASS |

Picks were entered from the new drop-down. **R13 closed.**
