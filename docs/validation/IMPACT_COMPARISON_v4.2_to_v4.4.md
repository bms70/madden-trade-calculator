# Impact Comparison — Ruleset v4.2 → v4.4

Sample trades evaluated with the v4.2 engine (`main` before v1.5.0) and the v4.4 engine. Values are Adjusted Package Values. "User" is the side receiving the first asset listed. LT was used for the v4.2 run where v4.4 says OT.

| Trade (User receives / CPU receives) | v4.2 User / CPU | v4.2 verdict | v4.4 User / CPU | v4.4 verdict | Score · favors |
|---|---|---|---|---|---|
| Young elite QB for 1.01 + 1.12 | 130.7 / 133.2 | QUESTIONABLE | 154.6 / 178.7 | UNFAIR | 43 · User |
| Young elite QB for 1.01 + 1.02 + Early 2nd | 130.7 / 178.9 | FAIR | 154.6 / 212.2 | QUESTIONABLE | 99 · CPU |
| 88 Superstar WR (25) for 1.05 + Mid 2nd | 70.0 / 81.4 | UNFAIR | 83.0 / 120.6 | LEAGUE-BREAKING | 20 · CPU |
| 85 Star CB (27) for 1.20 | 38.2 / 35.0 | QUESTIONABLE | 43.9 / 74.0 | LEAGUE-BREAKING | 0 · CPU |
| 85 Star CB (27) for Late 1st + Late 2nd | 38.2 / 38.7 | QUESTIONABLE | 43.9 / 77.8 | LEAGUE-BREAKING | 0 · CPU |
| Aging 86 Star EDGE (33) for 1.24 | 30.0 / 31.0 | QUESTIONABLE | 28.5 / 66.0 | LEAGUE-BREAKING | 0 · CPU |
| Aging 89 Superstar QB (34) for 1.10 | 43.4 / 53.0 | UNFAIR | 39.3 / 90.7 | LEAGUE-BREAKING | 0 · CPU |
| Three 78 OVR starters for one 88 Superstar HB | 63.8 / 71.0 | QUESTIONABLE | 71.8 / 71.9 | LEAGUE-BREAKING | 15 · User |
| Rookie 76 Star WR (Year 0) for 1.16 | 53.6 / 40.0 | LEAGUE-BREAKING | 53.2 / 80.0 | LEAGUE-BREAKING | 0 · CPU |
| 84 Star OT (26) for 82 Star DT (26) | 41.3 / 36.2 | UNFAIR | 44.8 / 38.2 | LEAGUE-BREAKING | 3 · User |
| 1.04 for 1.09 + Future Mid 1st (next year) | 71.0 / 90.2 | UNFAIR | 98.2 / 157.8 | LEAGUE-BREAKING | 0 · CPU |
| 1.08 for Future Early 1st (set to Current draft) | 57.0 / 67.0 | UNFAIR | 93.6 / 82.6 | LEAGUE-BREAKING | 20 · User |

## Reading the results

- **First-round picks carry about 1.74× their v4.2 weight against players** (player scale 34 at OVR 90). Before rescaling, the pick revaluation alone made it about 1.97×.
- The shift is not uniform: about 1.05× at 1.01, 1.88× at 1.16, 2.05× at 1.32. Late firsts gained the most, so mid-tier starters for late firsts move furthest.
- Under v4.2, an 85 OVR Star CB was worth about pick 1.20. Under v4.4 (43.9) he is worth less than any first-round pick (1.32 = 50).
- The window-based severity is working as intended: the elite QB for 1.01 + 1.02 + Early 2nd was FAIR under v4.2's 8% window, and is now UNFAIR because the QB side overpays by more than 5%.
- The Future Early 1st set to Current draft no longer skips the timing discount.

These are sample trades, not league data. Calibrate against real league trades before release.
