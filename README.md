# Madden League Trade Calculator v4.0

v4.0 is the sole source of truth for evaluating player and draft-pick trades.

## Release files

- `Madden League Trade Calculator v4.0.xlsx`
- `index.html`
- `README.md`

## Draft values

Current first-round values:

- 1.01-1.08: 90, 83, 77, 71, 67, 63, 60, 57
- 1.09-1.16: 55, 53, 50, 48, 46, 44, 42, 40
- 1.17-1.24: 38, 37, 36, 35, 34, 33, 32, 31
- 1.25-1.32: 30, 29, 28, 27, 26, 25, 24, 23

Other picks:

- Early / Mid / Late 2nd: 19 / 16 / 13
- Early / Mid / Late 3rd: 9 / 7 / 5
- 4th / 5th / 6th / 7th: 4 / 3 / 2 / 1
- Future Early / Mid / Late / Unknown 1st: 67 / 46 / 31 / 44

Timing multipliers are 1.00x for the current draft, 0.85x for next year, and 0.70x for two years away.

## Package quality

Assets are ranked on each side and credited at 100%, 90%, 75%, 60%, then 50% for later assets.

## Draft-only trade protection

- 1.01 acquisition: 1.15x adjusted return
- 1.02-1.03 acquisition: 1.08x
- Other meaningful trade-ups: 1.04x
- Lateral / near-lateral moves: no added premium
- FAIR window: required target through 8% above the target

For 1.01 at 90, the FAIR adjusted return is 103.5 through 111.8.

Adjacent-pick guidance:

- Top 10: at least a 5th-round sweetener
- Later 1st / 2nd: at least a 6th
- 3rd round or later: at least a 7th

## Player model

Player value uses OVR, age/development, position, cap hit, early-career status, role, contract control, aging adjustments, and QB age comparison.

Premium acquisition thresholds:

- Standard premium player: 1.10x
- Franchise Cornerstone: 1.20x
- Elite QB: 1.30x

An Elite QB is age 26 or younger, 90+ OVR, and Superstar or X-Factor.

## Verdicts

If the applicable FAIR test is not met:

- Under 12% adjusted gap: QUESTIONABLE
- Under 22%: UNFAIR
- 22% or more: LEAGUE-BREAKING

## Source of truth

If an older workbook, experimental file, prior README, or historical rule conflicts with this release, v4.0 takes precedence.
