# Madden League Trade Calculator

A free, single-page web calculator for grading trades in a Madden league. Enter what each team receives, and it values every asset, applies the league's trade rules, and returns a verdict with a plain-language explanation.

**Version: v4.0**  
**Live site:** [Madden League Trade Calculator](https://bms70.github.io/madden-trade-calculator/)

## How to use it

1. Under **Team A receives** and **Team B receives**, add the assets each team is getting. Each side supports up to 9 assets.
2. For each asset, choose **Player** or **Draft Pick**.
   - **Player:** enter OVR, age, position, dev trait, cap hit, years remaining, years in league, current role and projected role. A rookie is **Year 0**.
   - **Draft Pick:** choose the pick and its timing: current draft, next year, or two years away.
3. Watch the asset values, adjusted totals, verdict, and Trade Intelligence update as you enter the trade.

A player needs OVR, age, position, and dev trait before it contributes to the calculation. **Clear trade** resets the calculator.

## How trades are valued

### Players

Players start from `(OVR - 60)` and are adjusted for dev trait and age, position scarcity, cap hit, Franchise Cornerstone status, early-career value, current/projected role, aging, contract control, and QB age comparison.

Premium acquisition thresholds remain **1.10x** by default, **1.20x** for a Franchise Cornerstone, and **1.30x** for an elite QB age 26 or younger with 90+ OVR and Superstar or X-Factor.

### Draft picks

v4.0 uses exact values for every current first-round pick, with a premium top-10 curve:

`1.01-1.08: 90, 83, 77, 71, 67, 63, 60, 57`  
`1.09-1.16: 55, 53, 50, 48, 46, 44, 42, 40`  
`1.17-1.24: 38, 37, 36, 35, 34, 33, 32, 31`  
`1.25-1.32: 30, 29, 28, 27, 26, 25, 24, 23`

Other pick values:

- Early / Mid / Late 2nd: 19 / 16 / 13
- Early / Mid / Late 3rd: 9 / 7 / 5
- 4th / 5th / 6th / 7th: 4 / 3 / 2 / 1
- Future Early / Mid / Late / Unknown 1st: 67 / 46 / 31 / 44

Timing is **1.00x current**, **0.85x next year**, and **0.70x two years away**.

**Package quality:** assets are ranked by value and receive 100%, 90%, 75%, 60%, then 50% credit.

## Draft-only trade protection

- **1.01:** 1.15x required adjusted return
- **1.02-1.03:** 1.08x
- **Other meaningful trade-ups:** 1.04x
- **Lateral / near-lateral moves:** no added premium
- **FAIR window:** required target through 8% above it

For 1.01 at 90, the FAIR range is approximately **103.5-111.8 adjusted value**.

For one-slot moves, use at least a **5th in the top 10**, a **6th in the later first or second round**, and a **7th in the third round or later**. The value gap can require more.

## How the verdict works

- **FAIR** when the applicable adjusted-return test is satisfied.
- Under 12% adjusted gap: **QUESTIONABLE**
- Under 22%: **UNFAIR**
- 22% or more: **LEAGUE-BREAKING**

Trade Intelligence explains the main reason for the result, including premium-asset protection, draft capital, package quality, raw versus adjusted value, and whether additional value is needed.

## Version history

| Version | Summary |
|---|---|
| v4.0 | Exact first-round values, premium top-10 curve, 1.01 haul protection, graduated draft trade-up rules, 8% draft FAIR window, and expanded Trade Intelligence |
| v3.3 | Trade explanations and elite-QB protection |
| v3.1-v3.2 | Blockbuster protection, package quality, multi-scenario Excel calculators, documentation rebuild |
| v3.0 | Contract, rookie, role, aging, and QB-age model |
| v2.x | Tighter verdict bands, pick tuning, and layout cleanup |
| v1.x | Original calculator and early-career premium |

## Hosting

The calculator is available at [https://bms70.github.io/madden-trade-calculator/](https://bms70.github.io/madden-trade-calculator/). There is no build step or installation required.

## Credits

Originally built as an Excel workbook and evolved through multiple releases. **v4.0 is the current source of truth** for the calculator rules.
