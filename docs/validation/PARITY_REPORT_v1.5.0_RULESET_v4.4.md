# Excel/Web Parity — Web Release v1.5.0 / Ruleset v4.4

**Reference workbook:** `reference/Madden League Trade Calculator v4.4.xlsx`  
**Web engine:** `valuation.js` (Ruleset v4.4)  
**Scenarios:** `tests/parity-scenarios-v4.4.json`  
**Result:** 16 / 16 PASS (LibreOffice recalculation). Desktop Excel recalculation: pending release-owner sign-off.

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
