# Excel-versus-Web Regression Report

**Total:** 55  
**Passed:** 55  
**Failed:** 0

## Results

| Area | Test | Status | Detail |
|---|---|---|---|
| Draft | Exact 1.01-1.32 curve | PASS | Excel/Web length 32/32 |
| Draft | Early 2nd value | PASS | Excel=19; Web expected=19 |
| Draft | Mid 2nd value | PASS | Excel=16; Web expected=16 |
| Draft | Late 2nd value | PASS | Excel=13; Web expected=13 |
| Draft | Early 3rd value | PASS | Excel=9; Web expected=9 |
| Draft | Mid 3rd value | PASS | Excel=7; Web expected=7 |
| Draft | Late 3rd value | PASS | Excel=5; Web expected=5 |
| Draft | 4th value | PASS | Excel=4; Web expected=4 |
| Draft | 5th value | PASS | Excel=3; Web expected=3 |
| Draft | 6th value | PASS | Excel=2; Web expected=2 |
| Draft | 7th value | PASS | Excel=1; Web expected=1 |
| Draft | Future Early 1st value | PASS | Excel=67; Web expected=67 |
| Draft | Future Mid 1st value | PASS | Excel=46; Web expected=46 |
| Draft | Future Late 1st value | PASS | Excel=31; Web expected=31 |
| Draft | Future 1st - Unknown value | PASS | Excel=44; Web expected=44 |
| Draft | Current draft timing | PASS | Excel=1 |
| Draft | Next year timing | PASS | Excel=0.85 |
| Draft | Two years away timing | PASS | Excel=0.7 |
| Player | Elite QB 1.30x | PASS |  |
| Player | Cornerstone 1.20x | PASS |  |
| Player | Standard 1.10x | PASS |  |
| Player | Required fields enforced | PASS |  |
| Player | Blank Years in League is 1.00x | PASS |  |
| Player | Blank roles are neutral | PASS |  |
| Player | QB age comparison present | PASS |  |
| Package | Sequential tie ranking | PASS |  |
| Package | Credit schedule | PASS |  |
| Verdict | No REASONABLE active | PASS |  |
| Verdict | Fallback bands 12% / 22% | PASS |  |
| Draft | Premiums 1.15 / 1.08 / 1.04 | PASS |  |
| Draft | 8% FAIR ceiling | PASS |  |
| Branding | Release v1.0.0 | PASS |  |
| Branding | Ruleset v4.0 | PASS |  |
| Trade Intelligence | Primary Read | PASS |  |
| Trade Intelligence | Best Asset | PASS |  |
| Trade Intelligence | Raw Value | PASS |  |
| Trade Intelligence | Adjusted Value | PASS |  |
| Trade Intelligence | Draft Capital | PASS |  |
| Trade Intelligence | Package Structure | PASS |  |
| Trade Intelligence | Suggested Correction | PASS |  |
| Scenario | 1.01 minimum boundary | PASS | Adjusted A=90.000; B=108.400; Verdict=FAIR |
| Scenario | 1.01 overpay ceiling | PASS | Adjusted A=90.000; B=119.950; Verdict=LEAGUE-BREAKING |
| Scenario | 1.02 trade-up | PASS | Adjusted A=83.000; B=96.200; Verdict=FAIR |
| Scenario | Meaningful ordinary trade-up | PASS | Adjusted A=55.000; B=57.700; Verdict=FAIR |
| Scenario | Near-lateral adjacent | PASS | Adjusted A=55.000; B=55.700; Verdict=FAIR |
| Scenario | Equal best pick packages | PASS | Adjusted A=57.700; B=54.100; Verdict=FAIR |
| Scenario | Current versus future timed | PASS | Adjusted A=67.000; B=68.650; Verdict=QUESTIONABLE |
| Scenario | Three firsts for 1.01 | PASS | Adjusted A=90.000; B=108.850; Verdict=FAIR |
| Scenario | Late quantity versus premium | PASS | Adjusted A=57.000; B=77.100; Verdict=LEAGUE-BREAKING |
| Boundary | 7.9999% fallback | PASS | Expected=QUESTIONABLE; got=QUESTIONABLE |
| Boundary | 8.0000% fallback | PASS | Expected=QUESTIONABLE; got=QUESTIONABLE |
| Boundary | 11.9999% fallback | PASS | Expected=QUESTIONABLE; got=QUESTIONABLE |
| Boundary | 12.0000% fallback | PASS | Expected=UNFAIR; got=UNFAIR |
| Boundary | 21.9999% fallback | PASS | Expected=UNFAIR; got=UNFAIR |
| Boundary | 22.0000% fallback | PASS | Expected=LEAGUE-BREAKING; got=LEAGUE-BREAKING |

## Interpretation

Static parity checks compare workbook logic/tables with the web implementation. Numerical scenarios exercise the canonical draft/package/verdict math. Full browser UI interaction and Excel desktop calculation-cache comparison remain separate release-gate activities.