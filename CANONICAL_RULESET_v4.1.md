# Madden League Trade Calculator
## Canonical Ruleset Specification v4.1

**Public release:** v1.0.0  
**Ruleset:** v4.1  
**Status:** Frozen release specification

This specification is the rules authority. Excel, web, README, rules guide, tests, and archive records must conform to it.

## 1. Versioning and authority
- Public releases use semantic versioning beginning with v1.0.0.
- Ruleset versions are independent. Core-model changes require a new major/minor ruleset rather than silently changing a frozen ruleset.
- Publishing or formatting changes may use a public patch release without changing the ruleset.

## 2. Required inputs, validity, defaults, and precision
### 2.1 Trade structure
- Up to six assets per side.
- Populated assets are Player or Draft Pick.
- Blank rows contribute no value.

### 2.2 Valid Player row
A Player contributes only when OVR, age, position, and development trait are present.

| Optional field | Blank/default behavior |
|---|---|
| Cap hit | $0M for valuation unless the interface requires entry |
| Years remaining | 1.00x contract control |
| Years in league | 1.00x early-career treatment; blank is **not** Year 0 |
| Current role | No role adjustment when either role is blank |
| Projected role | No role adjustment when either role is blank |

Year 0 must be entered explicitly for the rookie premium.

### 2.3 Valid Draft Pick row
A Draft Pick contributes when a recognized current pick or future-first projection is selected.
- Blank Timing = Current draft / 1.00x.
- Invalid pick labels contribute no value.
- Future firsts use Early, Mid, Late, or Unknown.

### 2.4 Numerical precision
- Use full internal precision for all valuation, package, threshold, FAIR-window, and verdict calculations.
- Rounding is display-only.
- Display-rounded values must not feed verdict calculations.
- Boundary comparisons use unrounded fractions.

## 3. Player valuation
### 3.1 Base formula
`Base Player Value = max(0, OVR - 60)`

Multiply the base by every applicable factor below.

### 3.2 Position multipliers
| Position | Multiplier |
|---|---:|
| QB | 1.40x |
| EDGE | 1.20x |
| CB / WR | 1.15x |
| LT | 1.10x |
| DT | 1.05x |
| TE / S | 1.00x |
| LB | 0.95x |
| HB / IOL | 0.90x |
| FB / K / P | 0.50x |

### 3.3 Development and age
| Dev trait | Age 23 or younger | 24-26 | 27-29 | 30-31 | 32+ |
|---|---:|---:|---:|---:|---:|
| Normal | 1.15x | 1.10x | 1.00x | 0.80x | 0.65x |
| Star | 1.35x | 1.25x | 1.15x | 1.05x | 0.90x |
| Superstar | 1.65x | 1.50x | 1.30x | 1.15x | 1.00x |
| X-Factor | 2.00x | 1.75x | 1.50x | 1.30x | 1.15x |

### 3.4 Franchise Cornerstone
Age 26 or younger + 87+ OVR + Superstar/X-Factor.
- Individual scarcity multiplier: 1.25x.
- Acquisition requirement: 1.20x unless Elite QB applies.

### 3.5 Elite QB
QB + age 26 or younger + 90+ OVR + Superstar/X-Factor.
- Acquisition requirement: 1.30x.
- Overrides standard and Cornerstone acquisition thresholds.

### 3.6 Standard acquisition and protection precedence
- Standard required adjusted return: 1.10x.
- Precedence: `Elite QB 1.30x > Cornerstone 1.20x > Standard 1.10x`.
- Elite QBs may still receive the 1.25x Cornerstone individual scarcity multiplier because individual value and acquisition protection are separate rules.

### 3.7 Early-career multipliers
| Years in league | Multiplier |
|---|---:|
| Year 0 | 1.50x |
| Year 1 | 1.30x |
| Year 2 | 1.15x |
| Year 3+ | 1.00x |

### 3.8 Role multipliers
| Current to projected | Multiplier |
|---|---:|
| Starter to Starter | 1.00x |
| Starter to Backup | 0.85x |
| Backup to Starter | 0.95x |
| Backup to Backup | 0.75x |

### 3.9 Aging 70s
| Condition | Multiplier |
|---|---:|
| 70-79 OVR, age 31-32 | 0.90x |
| 70-79 OVR, age 33-34 | 0.75x |
| 70-79 OVR, age 35+ | 0.60x |

### 3.10 Contract control
| Years remaining | Multiplier |
|---|---:|
| 1 | 1.00x |
| 2 | 1.07x |
| 3 | 1.16x |
| 4 | 1.25x |
| 5+ | 1.34x |

Great/Good/Normal contracts get the full control premium. Expensive gets half the premium above 1.00x. Very Expensive gets none.

### 3.11 Cap tiers
| Tier | Non-QB | QB | Multiplier |
|---|---:|---:|---:|
| Great | $0-$5M | $0-$10M | 1.15x |
| Good | $5.01-$10M | $10.01-$20M | 1.08x |
| Normal | $10.01-$20M | $20.01-$35M | 1.00x |
| Expensive | $20.01-$30M | $35.01-$50M | 0.90x |
| Very Expensive | Above $30M | Above $50M | 0.80x |

### 3.12 QB-versus-QB age adjustment
| Relative age | Multiplier |
|---|---:|
| Younger 1-2 years | 1.05x |
| Younger 3-4 years | 1.10x |
| Younger 5+ years | 1.15x |
| Older 1-2 years | 0.98x |
| Older 3-4 years | 0.95x |
| Older 5+ years | 0.90x |
| Same age | 1.00x |

**Multiple-QB handling:** if both packages contain QBs, each QB is compared with the **youngest opposing QB**. Non-QBs never receive this comparison multiplier.

## 4. Draft-pick valuation
### 4.1 Current first round
| Pick | Value | Pick | Value | Pick | Value | Pick | Value |
|---|---:|---|---:|---|---:|---|---:|
| 1.01 | 90 | 1.09 | 55 | 1.17 | 38 | 1.25 | 30 |
| 1.02 | 83 | 1.10 | 53 | 1.18 | 37 | 1.26 | 29 |
| 1.03 | 77 | 1.11 | 50 | 1.19 | 36 | 1.27 | 28 |
| 1.04 | 71 | 1.12 | 48 | 1.20 | 35 | 1.28 | 27 |
| 1.05 | 67 | 1.13 | 46 | 1.21 | 34 | 1.29 | 26 |
| 1.06 | 63 | 1.14 | 44 | 1.22 | 33 | 1.30 | 25 |
| 1.07 | 60 | 1.15 | 42 | 1.23 | 32 | 1.31 | 24 |
| 1.08 | 57 | 1.16 | 40 | 1.24 | 31 | 1.32 | 23 |

### 4.2 Other draft values
| Asset | Value |
|---|---:|
| Early / Mid / Late 2nd | 19 / 16 / 13 |
| Early / Mid / Late 3rd | 9 / 7 / 5 |
| 4th / 5th / 6th / 7th | 4 / 3 / 2 / 1 |
| Future Early / Mid / Late / Unknown 1st | 67 / 46 / 31 / 44 |

### 4.3 Timing
Current = 1.00x; Next year = 0.85x; Two years away = 0.70x.

`Draft Pick Value = Base Value x Timing Multiplier`

For draft classification, **Best Pick Value** is the highest draft Individual Asset Value in the package **after timing**.

## 5. Package-quality compression
### 5.1 Terminology
- **Individual Asset Value:** asset value after asset-specific multipliers, before package compression.
- **Raw Package Value:** sum of Individual Asset Values.
- **Adjusted Package Value:** sum after package credits.

### 5.2 Credits
Package positions receive 100%, 90%, 75%, 60%, then 50% for positions 5-6.

### 5.3 Tied-value ranking
Ranks are sequential after sorting highest to lowest. Equal values do **not** share a rank. Example: 40, 40, 20 receives 100%, 90%, 75%. Input-row order breaks exact ties. Excel and web must implement equivalent sequential behavior.

## 6. Draft-only trade protection
A trade is draft-only only when all populated assets on both sides are Draft Picks.

The acquisition test is one-sided: the team receiving the stronger Best Pick must pay the required premium.

| Acquisition | Required return |
|---|---:|
| 1.01 | 1.15x |
| 1.02 or 1.03 | 1.08x |
| Other meaningful trade-up | 1.04x |
| Lateral / near-lateral | 1.00x |

A normal meaningful move occurs when the stronger Best Pick Value is more than 8% greater than the other package's Best Pick Value.

### 6.1 FAIR window
`Required Target = Stronger-Pick Adjusted Package Value x Acquisition Premium`

FAIR requires the trade-down package to be at least the Required Target and no more than 8% above it. Equal Best Pick Values are FAIR when Adjusted Package Values differ by 8% or less.

**1.01 example:** 90 x 1.15 = 103.5 minimum; 103.5 x 1.08 = 111.78 ceiling.

### 6.2 Adjacent-pick commissioner guidance
Not a hard-coded gate. Sweeteners contribute through normal package math.
- Top 10 one-slot move: at least a 5th.
- Later 1st / 2nd: at least a 6th.
- 3rd or later: at least a 7th.
- Actual value gap may require more.

## 7. Verdict determination
### 7.1 FAIR
- Player/mixed: both sides meet applicable acquisition thresholds for received premium assets.
- Draft-only: one-sided premium and 8% window are satisfied.

### 7.2 Fallback grades
`Adjusted Gap = abs(A Adjusted - B Adjusted) / max(A Adjusted, B Adjusted)`

| Gap | Verdict |
|---|---|
| Under 12% | QUESTIONABLE |
| 12% to under 22% | UNFAIR |
| 22% or more | LEAGUE-BREAKING |

`REASONABLE` is not an active v4.1 verdict.

## 8. Trade Intelligence requirements
Both implementations expose seven reads:
1. Primary Read: dominant protection or trade category.
2. Best Asset: highest Individual Asset Value on each side.
3. Raw Value: Raw Package Value comparison.
4. Adjusted Value: Adjusted Package Value comparison.
5. Draft Capital: side receiving more raw draft-pick value, or none.
6. Package Structure: whether quantity-for-quality compression is materially active.
7. Suggested Correction: side that must add adjusted value; numerical estimates may be displayed only from full-precision math.

## 9. Implementation conformance
1. Excel and web use this exact model.
2. Identical inputs produce materially identical values, thresholds, and verdicts.
3. Elite QB is 1.30x in both.
4. Blank/default behavior is identical.
5. Package ties use sequential ranks.
6. Multiple-QB behavior is identical.
7. Full internal precision is used; rounding is display-only.
8. `REASONABLE` is absent from active logic and active display/conditional formatting.
9. Web exposes all seven Trade Intelligence reads.
10. Visible Excel Rules & Definitions contains current rules only; superseded rules belong in history/archive.
11. Adjacent sweeteners remain commissioner guidance.
12. Version labels use **Release v1.2.0** and **Ruleset v4.1** where shown.

## 10. Minimum acceptance tests
### Player
Ordinary player; Cornerstone; Elite QB; QB-for-QB age differential; Year 0 rookie; long Expensive contract; aging 70-79 player.

### Draft
Adjacent top-10; adjacent late-first; 1.01; 1.02/1.03; meaningful trade-up; current vs future first; three firsts for 1.01; multiple late picks vs premium pick.

### Mixed
Player + pick vs player; premium player vs package; player + future pick vs multiple assets.

### Edge/parity
- incomplete player excluded;
- blank Years in League is not Year 0;
- blank role = no role adjustment;
- blank Timing = Current / 1.00x;
- tied assets receive sequential ranks;
- current vs future draft comparison uses timed Best Pick Value;
- multiple-QB comparison uses youngest opposing QB;
- Elite QB/Cornerstone overlap uses 1.25x individual scarcity and 1.30x acquisition protection;
- test immediately below, equal to, and above 8%, 12%, and 22%;
- display rounding cannot change the verdict.

For every scenario compare individual values, Raw Package Values, Adjusted Package Values, required premiums, FAIR boundaries, verdict, and Trade Intelligence.

## 11. Documentation and archive
- Canonical specification: what the rules are.
- Rules guide: member-facing explanation.
- README: public usage summary.
- Change log: how rules changed.
- Update record: one completed record per future major/minor change.
- Superseded artifacts are archived and never reused as current rules.

## 12. Release gate
Release v1.2.0 / Ruleset v4.1 is conformant only when:
- Excel formulas and current visible rules match this spec;
- obsolete Excel current-rule text and REASONABLE formatting are removed;
- web matches Excel including Elite QB, QB age comparison, defaults, ties, and seven Trade Intelligence reads;
- full regression/parity suite passes;
- README and rules guide match this spec;
- archive/change log are updated;
- labels are correct; and
- prior versions are archived.
