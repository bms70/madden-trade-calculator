# Madden League Trade Calculator — Ruleset v4.4 Complete Reference

**Ruleset:** v4.4  
**Web Release:** v1.5.0  
**Compiled:** 2026-11-21, as the pre-v5.0 baseline record  
**Status:** Consolidated reference. It adds no new rules.

## Purpose and authority

The v4.4 rules are spread across three governed sources:

1. `docs/rules/CANONICAL_RULESET_v4.4.md`, covering everything v4.4 changed.
2. `archive/ruleset-v4.1/CANONICAL_RULESET_v4.1.md`, covering the factors v4.4 kept unchanged (dev/age table, role, cap tiers, early career, QB-to-QB age context, package credits, blank-field defaults).
3. `valuation.js`, the code that actually runs.

This document puts every rule, constant and formula in one place, checked line by line against `valuation.js` on `main` (commit `8def354`). It is a **record, not a new specification**. If it ever disagrees with the canonical spec or the code, those govern and this document is corrected.

Member-facing material (wiki, member guide) does not publish the combined formulas. This document is for the commissioner's records.

---

## 1. Trade structure and inputs

- Two packages: what the **User Team** receives (side A) and what the **CPU Team** receives (side B).
- Up to **six assets per side**. Each asset is a Player or a Draft Pick.
- Blank or incomplete rows contribute no value.

### 1.1 Player inputs

| Field | Entry | Blank / default |
|---|---|---|
| OVR | 0–99 | **Required.** Player is worth 0 if blank |
| Age | 18–60 | **Required.** Player is worth 0 if blank |
| Position | QB, EDGE, CB, WR, OT, DT, TE, S, LB, HB, IOL, FB, K, P | **Required.** Player is worth 0 if blank |
| Dev trait | Normal, Star, Superstar, X-Factor | **Required** (defaults to Normal) |
| Cap hit ($M) | ≥ 0 | Treated as **$0M** (cheapest cap tier) |
| Years left | Whole number 1–10 | Treated as **1 year** (no control premium). 0 is rejected |
| Years in league | 0–40 | **No early-career adjustment.** Blank is *not* Year 0 |
| Current role / Projected role | Starter, Backup | **No role adjustment** if either is blank |

### 1.2 Draft Pick inputs

| Field | Entry | Blank / default |
|---|---|---|
| Pick | 1.01–1.32, round 2–7 tiers, or Future 1st (Early / Mid / Late / Unknown) | Unrecognized pick = 0 |
| Timing | Current draft, Next year, Two years away | Blank or invalid = the pick's default timing (§3.3) |

### 1.3 Precision

All values, package totals, targets, windows and verdicts use **full internal precision**. Rounding is display-only, and a display-rounded value never feeds a comparison. Window boundaries use a floating-point tolerance of `EPS = 1e-9`.

---

## 2. Player value

```
Player Value = OVR value × Position × Dev/Age × Cap × Cornerstone scarcity
               × Early career × Role × Aging × Contract control
Individual Asset Value = Player Value × QB-to-QB age context
```

### 2.1 OVR value (star curve)

```
OVR value = 34 × (max(0, OVR − 60) ÷ 30)^1.3
```

OVR 60 or lower is worth 0. The slope of the curve,

```
d(OVR value)/d(OVR) = (34 ÷ 30) × 1.3 × ((OVR − 60) ÷ 30)^0.3
```

rises with OVR, so each point is worth more than the one before it.

| OVR | 65 | 70 | 75 | 80 | 85 | 90 | 95 | 99 |
|---|---|---|---|---|---|---|---|---|
| Value | 3.3 | 8.2 | 13.8 | 20.1 | 26.8 | 34.0 | 41.5 | 47.8 |

### 2.2 Position

| Position | Multiplier |
|---|---:|
| QB | 1.40 |
| EDGE | 1.20 |
| CB | 1.20 |
| WR | 1.20 |
| OT (covers both tackle spots) | 1.10 |
| DT | 1.05 |
| TE | 1.00 |
| S | 1.00 |
| LB | 0.95 |
| HB | 0.90 |
| IOL | 0.90 |
| FB | 0.50 |
| K | 0.50 |
| P | 0.50 |

### 2.3 Development trait × age

| Dev trait | Age ≤ 23 | 24–26 | 27–29 | 30–31 | 32+ |
|---|---:|---:|---:|---:|---:|
| Normal | 1.15 | 1.10 | 1.00 | 0.80 | 0.65 |
| Star | 1.35 | 1.25 | 1.15 | 1.05 | 0.90 |
| Superstar | 1.65 | 1.50 | 1.30 | 1.15 | 1.00 |
| X-Factor | 2.00 | 1.75 | 1.50 | 1.30 | 1.15 |

### 2.4 Cap tier

| Tier | Non-QB cap hit | QB cap hit | Multiplier |
|---|---|---|---:|
| Great | ≤ $5M | ≤ $10M | 1.15 |
| Good | > $5M to $10M | > $10M to $20M | 1.08 |
| Normal | > $10M to $20M | > $20M to $35M | 1.00 |
| Expensive | > $20M to $30M | > $35M to $50M | 0.90 |
| Very Expensive | > $30M | > $50M | 0.80 |

Upper bounds are inclusive. A blank cap hit counts as $0M (Great).

### 2.5 Franchise Cornerstone scarcity

Age ≤ 26 **and** OVR ≥ 87 **and** Superstar or X-Factor → **1.25×**. Any position qualifies, including QB. Otherwise 1.00×.

### 2.6 Early career (years in league)

| Years in league | Multiplier |
|---|---:|
| 0 (rookie) | 1.50 |
| 1 | 1.30 |
| 2 | 1.15 |
| 3+ | 1.00 |
| Blank | 1.00 |

### 2.7 Role (current → projected)

| Current → projected | Multiplier |
|---|---:|
| Starter → Starter | 1.00 |
| Starter → Backup | 0.85 |
| Backup → Starter | 0.95 |
| Backup → Backup | 0.75 |
| Either blank | 1.00 |

### 2.8 Aging (exponential decay)

Aging is the solution of the decay equation dA/d(age) = −k × A, with A = 1 at the start age. Each extra year removes the same fraction of the value that remains:

```
dA/d(age) = −k × A,  A(start) = 1
⇒ Aging = e^(−k × max(0, age − start))
```

This applies to every dev trait.

| OVR | start | k | 31 | 32 | 33 | 34 | 35 | 36 | 37 |
|---|---|---|---|---|---|---|---|---|---|
| Under 80 | 30 | 0.105 | 0.900 | 0.811 | 0.730 | 0.657 | 0.592 | 0.533 | 0.480 |
| 80+ | 31 | 0.08 | 1.000 | 0.923 | 0.852 | 0.787 | 0.726 | 0.670 | 0.619 |

### 2.9 Contract control (discounted integral)

Each future year of control is worth a little less than the one before it (a 10% continuous discount). Control is the area under that discounted curve:

```
Y = max(1, years left; blank = 1)

base(Y) = 1 + b × ∫₀^(Y−1) e^(−0.1t) dt

Solving the integral:
∫₀^(Y−1) e^(−0.1t) dt = [−e^(−0.1t) ÷ 0.1] from 0 to (Y−1)
                      = (1 − e^(−0.1(Y−1))) ÷ 0.1

so base(Y) = 1 + b × (1 − e^(−0.1(Y−1))) ÷ 0.1

b is set so five years of control is exactly 1.34:
b = 0.34 ÷ ((1 − e^(−0.4)) ÷ 0.1) ≈ 0.10313
```

| Years left | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| base | 1.000 | 1.098 | 1.187 | 1.267 | 1.340 | 1.406 | 1.465 |

How the cap tier interacts with control:

| Cap multiplier | Control used |
|---|---|
| ≥ 1.00 (Great, Good, Normal) | full `base(Y)` |
| 0.90 (Expensive) | `1 + (base(Y) − 1) ÷ 2`, half the premium |
| 0.80 (Very Expensive) | `1.00`, no premium |

### 2.10 QB-to-QB age context

This applies only to a **QB** whose package faces a package that also contains a QB with a known age. Compare the QB to the **youngest QB in the opposing package**, using `difference = this QB's age − youngest opposing QB's age`:

| Difference | Multiplier |
|---|---:|
| 0 (same age) | 1.00 |
| Younger by 1–2 | 1.05 |
| Younger by 3–4 | 1.10 |
| Younger by 5+ | 1.15 |
| Older by 1–2 | 0.98 |
| Older by 3–4 | 0.95 |
| Older by 5+ | 0.90 |

Non-QBs always get 1.00.

### 2.11 Worked example

A WR, OVR 85, age 25, Star, $8M, 3 years left, 4 years in league, Starter → Starter:

`26.825 (OVR) × 1.20 (WR) × 1.25 (Star, 24–26) × 1.08 (Good) × 1.00 × 1.00 × 1.00 × 1.00 (aging) × 1.187 (control)` = **51.58**

---

## 3. Draft Pick value

```
Draft Pick Value = pick value × timing
```

### 3.1 First round (current draft only)

| Pick | Value | Pick | Value | Pick | Value | Pick | Value |
|---|---|---|---|---|---|---|---|
| 1.01 | 100 | 1.09 | 92.2 | 1.17 | 80 | 1.25 | 64 |
| 1.02 | 99.7 | 1.10 | 90.7 | 1.18 | 78 | 1.26 | 62 |
| 1.03 | 99 | 1.11 | 89.1 | 1.19 | 76 | 1.27 | 60 |
| 1.04 | 98.2 | 1.12 | 87.4 | 1.20 | 74 | 1.28 | 58 |
| 1.05 | 97.2 | 1.13 | 85.7 | 1.21 | 72 | 1.29 | 56 |
| 1.06 | 96.2 | 1.14 | 83.9 | 1.22 | 70 | 1.30 | 54 |
| 1.07 | 94.9 | 1.15 | 82 | 1.23 | 68 | 1.31 | 52 |
| 1.08 | 93.6 | 1.16 | 80 | 1.24 | 66 | 1.32 | 50 |

How the table was built: 1.01–1.16 follow `100 − 20 × (n ÷ 15)^1.5` with n = slot − 1, rounded to one decimal; 1.17–1.32 drop 2.0 per slot from 80 to 50. The listed values are the governed values.

### 3.2 Later rounds and future firsts

| Pick | Value |
|---|---:|
| Early / Mid / Late 2nd | 30 / 26 / 22 |
| Early / Mid / Late 3rd | 16 / 13 / 10 |
| 4th / 5th / 6th / 7th | 7 / 5 / 3 / 2 |
| Future Early 1st (= 1.05) | 97.2 |
| Future Mid 1st (= 1.13) | 85.7 |
| Future Late 1st (= 1.24) | 66 |
| Future 1st – Unknown (= 1.14) | 83.9 |

### 3.3 Timing

Timing is a continuous discount, with the rate r set so that one year out is exactly 0.85:

```
Timing = e^(−r × t),  r = ln(1 ÷ 0.85) ≈ 0.1625
```

| Timing | t | Multiplier |
|---|---|---:|
| Current draft | 0 | 1.00 |
| Next year | 1 | 0.85 |
| Two years away | 2 | 0.7225 |

| Pick type | Allowed timing | Default if blank or invalid |
|---|---|---|
| Exact slot 1.01–1.32 | Current draft only | Current draft |
| Future 1st (any tier) | Next year, Two years away | Next year |
| Round 2–7 tiers | Any | Current draft |

Each pick is discounted exactly once.

---

## 4. Package value

- **Individual Asset Value** is the value of one asset (§2 or §3).
- **Raw Package Value** is the sum of the Individual Asset Values in a package.
- **Adjusted Package Value** ranks the assets from highest to lowest value and applies credits by rank:

| Rank | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Credit | 100% | 90% | 75% | 60% | 50% | 50% |

Exact ties rank one after another in input order, so equal values never share a rank. This compression is the **quantity-for-quality** protection: extra lesser assets add less and less.

---

## 5. Verdict

### 5.1 Incomplete trade

If either Adjusted Package Value is 0, the result is **ADD ASSETS** (incomplete, score 0).

### 5.2 Choosing the evaluation path

```
Adjusted Gap = |A.adj − B.adj| ÷ max(A.adj, B.adj)
```

1. **Draft-only:** every asset on both sides is a Draft Pick → §5.4. If both sides' best picks have exactly equal value, use the even path (§5.5).
2. Otherwise, find each package's **protected-player candidate**: the highest-value Player with value > 0. Ties go to the higher protection rank (Elite QB > Cornerstone > Standard), then to input order.
3. If neither package has a candidate, or the two candidates' values are **exactly** equal → even path (§5.5).
4. Otherwise → directional path (§5.3).

### 5.3 Directional (player / mixed) path

- The **Protected Acquisition Side** is the side that *receives* the higher-value candidate.
- The acquisition multiplier depends on that candidate:

| Tier | Condition | Multiplier |
|---|---|---:|
| Elite QB | QB, age ≤ 26, OVR ≥ 90, Superstar/X-Factor | 1.30 |
| Franchise Cornerstone | age ≤ 26, OVR ≥ 87, Superstar/X-Factor | 1.20 |
| Standard | any other eligible player | 1.10 |

```
Required Target = Protected package (adjusted) × multiplier
FAIR Maximum   = Required Target × 1.05
Counter package (adjusted, what the other side receives) must be within [Required Target, FAIR Maximum]
```

### 5.4 Draft-only path

- The **strong side** receives the package with the higher best-pick value (after timing).
- The premium is set by the *identity* of the strong side's best pick:

| Strong side's best pick | Premium |
|---|---:|
| 1.01 | 1.15 |
| 1.02 or 1.03 | 1.08 |
| Any other, if best-pick value > other side's best-pick value × 1.08 | 1.04 |
| Otherwise (lateral / near-lateral) | 1.00 |

```
Required Target = strong package (adjusted) × premium
FAIR Maximum   = Required Target × 1.05
The weak side's package (adjusted) must be within [Required Target, FAIR Maximum]
```

Exact first-round slots exist only in the current draft, so 1.01–1.03 protection applies only to this year's 1.01–1.03.

### 5.5 Even path

This path covers equal best picks, an exact tie between protected players, or no eligible player on either side.

```
distance d = max(0, Adjusted Gap − 0.05)
```

FAIR when the lower package is at least 95% of the higher one.

### 5.6 Distance outside the FAIR window

For the directional and draft-only paths:

- Counter short of the target: `d = (Required Target − counter) ÷ Required Target`
- Counter above the ceiling: `d = (counter − FAIR Maximum) ÷ FAIR Maximum`
- Inside the window: `d = 0`

### 5.7 Verdict bands (lower-inclusive)

| Distance d | Verdict |
|---|---|
| 0 | FAIR |
| > 0 and < 5% | QUESTIONABLE |
| 5% to < 15% | UNFAIR |
| ≥ 15% | LEAGUE-BREAKING |

On the even path this works out to FAIR ≤ 5% gap, QUESTIONABLE < 10%, UNFAIR < 20%, LEAGUE-BREAKING ≥ 20%.

### 5.8 Favored side

When a trade falls outside the window, the favored side is:

- Directional / draft-only, counter short: the **protected (acquiring) side**.
- Directional / draft-only, counter above the ceiling: the **counter side**.
- Even path: the side with the **higher Adjusted Value**.

### 5.9 Fairness Score

```
Fairness Score = 100 × e^(−(d ÷ 0.12)²)
```

The score is 100 inside the window, about 84 at d = 5%, and about 21 at d = 15%. In the display, a trade outside the window never shows 100: it is capped at 99, or at 99.9 with one decimal.

### 5.10 Suggested Correction

- Directional and draft-only paths: add the exact shortfall below the Required Target, or remove the exact excess above the FAIR Maximum, from the counter (weak) side's received package.
- Even path: raise the lower package to 95% of the higher one (`amount = higher × 0.95 − lower`).

The arithmetic runs at full precision and is shown to four decimals.

### 5.11 Worked examples

The User Team receives the WR from §2.11 (51.58):

| CPU Team receives | Adjusted | Path | Target / Max | Distance | Verdict | Score | Favors |
|---|---|---|---|---|---|---|---|
| 1.24 (current) | 66.00 | Directional, Standard | 56.74 / 59.58 | 10.8% above | UNFAIR | 44.6 | CPU Team |
| Late 2nd, Early 3rd, 4th, 5th, 6th, 7th | 47.15 (raw 55) | Directional, Standard | 56.74 / 59.58 | 16.9% short | LEAGUE-BREAKING | 13.8 | User Team |

---

## 6. Trade Intelligence (eight reads)

1. **Primary Read:** the path and protection tier that governs the trade.
2. **Best Asset:** which side receives the highest single Individual Asset Value.
3. **Raw Value:** which side leads Raw Package Value.
4. **Adjusted Value:** which side leads Adjusted Package Value.
5. **Draft Capital:** which side receives more raw draft-pick value, or none.
6. **Package Structure:** quantity-for-quality protection is shown as active when either side has 3 or more assets.
7. **Fairness Score:** the score, the favored side, and the % outside the window.
8. **Suggested Correction:** see §5.10.

---

## 7. Logged-trade record (Accept & Log)

A logged trade stores Web Release `v1.5.0`, Ruleset `v4.4`, both packages' assets and inputs, raw and adjusted values, adjusted gap, verdict, evaluation mode (`DIRECTIONAL`, `DRAFT_ONLY`, `POSITIVE_PLAYER_TIE`, `NO_ELIGIBLE_PLAYER`), protection tier, Required Target, FAIR Maximum, the Trade Intelligence reads, and the Suggested Correction. The field names are a contract with `storage.js` and the database. `accept-trade` accepts only listed Web Release / Ruleset pairs.

---

## 8. Constant summary

| Constant | Value |
|---|---|
| OVR floor / span / scale / power | 60 / 30 / 34 / 1.3 |
| Aging < 80 OVR | start 30, k 0.105 |
| Aging 80+ OVR | start 31, k 0.08 |
| Contract control rate / value at 5 years | 0.1 / 1.34 |
| Draft timing rate | ln(1 ÷ 0.85) |
| Package credits | 1, 0.9, 0.75, 0.6, 0.5, 0.5 |
| Acquisition multipliers | Standard 1.10, Cornerstone 1.20, Elite QB 1.30 |
| Cornerstone scarcity | 1.25 |
| Draft premiums | 1.01: 1.15; 1.02–1.03: 1.08; meaningful trade-up (> 8% better best pick): 1.04; lateral 1.00 |
| FAIR window / QUESTIONABLE limit / UNFAIR limit | 5% / 5% / 15% |
| Fairness Score spread | 0.12 |
| Boundary tolerance (EPS) | 1e-9 |
| Max assets per side | 6 |
