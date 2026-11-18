# Madden League Trade Calculator

A responsive single-page calculator for grading Player and Draft Pick trades in a Madden league.

**Web Release v1.3.0** uses **Ruleset v4.2**.

## Release v1.3.0 / Ruleset v4.2

This maintenance release corrects the mixed Player/Draft Pick FAIR evaluation while preserving the established six-asset structure and underlying valuation framework.

### What's changed

- Player/mixed acquisition protection is directional rather than requiring both packages to satisfy competing acquisition-return tests.
- Each package identifies its highest eligible positive-value Player using full internal precision.
- The package receiving the higher selected Player value becomes the protected acquisition side.
- Standard, Franchise Cornerstone, and Elite QB acquisition requirements remain **1.10x / 1.20x / 1.30x**.
- Exact same-package Player-value ties use protection rank: **Elite QB > Franchise Cornerstone > Standard**, then input order.
- Exact cross-package selected Player-value ties use the **8% Adjusted Gap** path. Protection tier does not break a cross-package tie.
- If neither positive package contains an eligible positive-value Player, the **8% Adjusted Gap** path applies.
- Primary Read and Suggested Correction now use the governing directional/tie state.
- Completed web asset cards are collapsible and preserve their expanded/collapsed state while editing.
- How to Use includes value terminology, common trade types, common mistakes, editing guidance, defaults, and precision guidance.

## Preserved behavior

- Maximum trade package: **6 assets per side**.
- Asset types: **Player** or **Draft Pick**.
- Player valuation factors and neutral/default behavior remain in place.
- Package credits remain **100% / 90% / 75% / 60% / 50% / 50%**.
- Draft timing remains **1.00 / 0.85 / 0.70** for Current / Next year / Two years away.
- Draft-only acquisition protection remains **1.15x / 1.08x / 1.04x / 1.00x** as applicable, with the **8% target window**.
- Fallback verdict bands remain:
  - **QUESTIONABLE**: not FAIR; adjusted gap under 12%.
  - **UNFAIR**: adjusted gap 12% to under 22%.
  - **LEAGUE-BREAKING**: adjusted gap 22% or more.
- Calculations use full internal precision; display rounding does not determine the verdict.
- Seven Trade Intelligence reads remain available: **Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, Suggested Correction**.

## How to use it

1. Add assets under the team that **receives** them.
2. Choose **Player** or **Draft Pick**.
3. For a Player, provide OVR, age, position, and development trait before the Player contributes value.
4. For a Draft Pick, select the pick/projection and timing.
5. Review each asset's Individual Asset Value, then the Raw and Adjusted Package Values and trade verdict.
6. Review Primary Read for the governing rule and Suggested Correction for the side/value adjustment required when the trade is not FAIR.
7. Reopen a completed asset card to edit it, remove an asset to free a slot, or use **Clear trade** to reset.

### Blank-field defaults

- Blank Years in League = neutral 1.00x; blank is **not** Year 0. Enter 0 explicitly for Year 0 rookie treatment.
- Blank Years Remaining = neutral 1.00x contract control.
- Blank Current or Projected Role = no role adjustment.
- Blank Draft Timing = Current draft / 1.00x.
- Blank cap hit = $0M for valuation.
- Required Player fields are OVR, age, position, and development trait.

## Current release files

- `index.html`
- `README.md`
- `CANONICAL_RULESET_v4.2.md`
- `Madden League Trade Calculator v4.2.xlsx`
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.2.docx`
- `REGRESSION_REPORT_v4.2.md`
- `FINAL_CROSS_FILE_AUDIT_v1.3.0.md`
- `RELEASE_NOTES_v1.3.0.md`
- `Madden League Ruleset Change Log and Archive Index - v1.3.0.docx`
- `Madden League Ruleset Update Record - v1.3.0 Ruleset v4.2.docx`

## Versioning and archive

Public web releases and calculator rulesets are versioned independently. This release maps **Web Release v1.3.0** to **Ruleset v4.2**.

The prior **Web Release v1.2.0 / Ruleset v4.1** materials should remain preserved under `archive/ruleset-v4.1/` rather than being reused as current files.

## Pre-v5 status

Ruleset v4.2 is the blocking maintenance release that corrects the mixed Player/Draft Pick FAIR issue identified before Phase 1 of the v5 development roadmap. The maintenance release must be published with its parity and release gates complete before Phase 1 League Data Foundation begins.
