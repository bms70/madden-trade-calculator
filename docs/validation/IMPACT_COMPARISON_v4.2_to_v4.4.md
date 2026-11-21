# Impact Comparison — Ruleset v4.2 → v4.4

Sample trades evaluated with the v4.2 engine (`main` before v1.5.0) and the v4.4 engine. Values are Adjusted Package Values. "User" is the side receiving the first asset listed. LT was used for the v4.2 run where v4.4 says OT.

| Trade (User receives / CPU receives) | v4.2 User / CPU | v4.2 verdict | v4.4 User / CPU | v4.4 verdict | Score · favors |
|---|---|---|---|---|---|
| Young elite QB for 1.01 + 1.12 | 130.7 / 133.2 | QUESTIONABLE | 136.4 / 178.7 | FAIR | 100 |
| Young elite QB for 1.01 + 1.02 + Early 2nd | 130.7 / 178.9 | FAIR | 136.4 / 212.2 | UNFAIR | 26 · CPU |
| 88 Superstar WR (25) for 1.05 + Mid 2nd | 70.0 / 81.4 | UNFAIR | 73.2 / 120.6 | LEAGUE-BREAKING | 0 · CPU |
| 85 Star CB (27) for 1.20 | 38.2 / 35.0 | QUESTIONABLE | 38.7 / 74.0 | LEAGUE-BREAKING | 0 · CPU |
| 85 Star CB (27) for Late 1st + Late 2nd | 38.2 / 38.7 | QUESTIONABLE | 38.7 / 77.8 | LEAGUE-BREAKING | 0 · CPU |
| Aging 86 Star EDGE (33) for 1.24 | 30.0 / 31.0 | QUESTIONABLE | 25.2 / 66.0 | LEAGUE-BREAKING | 0 · CPU |
| Aging 89 Superstar QB (34) for 1.10 | 43.4 / 53.0 | UNFAIR | 34.7 / 90.7 | LEAGUE-BREAKING | 0 · CPU |
| Three 78 OVR starters for one 88 Superstar HB | 63.8 / 71.0 | QUESTIONABLE | 63.3 / 63.4 | LEAGUE-BREAKING | 15 · User |
| Rookie 76 Star WR (Year 0) for 1.16 | 53.6 / 40.0 | LEAGUE-BREAKING | 46.9 / 80.0 | LEAGUE-BREAKING | 0 · CPU |
| 84 Star OT (26) for 82 Star DT (26) | 41.3 / 36.2 | UNFAIR | 39.6 / 33.7 | LEAGUE-BREAKING | 3 · User |
| 1.04 for 1.09 + Future Mid 1st (next year) | 71.0 / 90.2 | UNFAIR | 98.2 / 157.8 | LEAGUE-BREAKING | 0 · CPU |
| 1.08 for Future Early 1st (set to Current draft) | 57.0 / 67.0 | UNFAIR | 93.6 / 82.6 | LEAGUE-BREAKING | 20 · User |

## Reading the results

- **Picks now outweigh players by about 2x.** Most of the movement comes from the Draft Pick revaluation, not from the new curves. A Ruleset v4.3 interim engine (picks only, no curves) produced the same direction for every player-for-pick trade above.
- Under v4.2, an 85 OVR Star CB was worth about pick 1.20. Under v4.4 he is worth about half of it, and less than 1.32 (50).
- The window-based severity is working as intended: the elite QB for 1.01 + 1.02 + Early 2nd was FAIR under v4.2's 8% window, and is now UNFAIR because the QB side overpays by more than 5%.
- The Future Early 1st set to Current draft no longer skips the timing discount.

These are sample trades, not league data. Calibrate against real league trades before release.
