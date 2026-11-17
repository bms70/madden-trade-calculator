# Madden League Trade Calculator - Release v1.2.0

**Ruleset:** v4.1

## Highlights
- Redesigned the web calculator around a compact, responsive interface intended to reduce scrolling.
- Reduced the maximum package size from **9 assets per side to 6 assets per side**.
- Added integrated **Calculator | How to Use | Rules** navigation.
- Moved the useful operating guidance from the prior standalone help experience into the **How to Use** tab.
- Added a member-facing **Rules** tab that explains valuation algorithms and publishes approved reference values, multipliers, and thresholds without reproducing the complete calculation formulas.
- Kept all seven Trade Intelligence reads: Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, and Suggested Correction.

## Ruleset v4.1
Ruleset v4.1 is a focused usability/structure update. The intentional rules change is the trade-package maximum: **six assets per side** instead of nine.

The following v4.0-derived valuation behavior is carried forward:
- exact 1.01-1.32 draft curve;
- later-round and future-first values;
- 1.00 / 0.85 / 0.70 pick-timing treatment;
- Elite QB 1.30x, Cornerstone 1.20x, Standard 1.10x acquisition protection;
- 1.25x Cornerstone individual scarcity treatment;
- sequential package-quality ranking with 100% / 90% / 75% / 60% / 50% thereafter;
- one-sided draft acquisition premiums and the 8% draft FAIR window;
- FAIR / QUESTIONABLE / UNFAIR / LEAGUE-BREAKING verdict set with 12% and 22% fallback boundaries;
- full internal precision with display-only rounding;
- seven-read Trade Intelligence.

## Web experience
### Calculator
- Six assets maximum per receiving side.
- Compact completed asset cards with expand-to-edit behavior.
- Verdict and adjusted totals remain near the top of the page.
- Desktop keeps Team A and Team B packages side by side; mobile stacks the flow vertically.
- Trade Analysis is collapsible while Primary Read remains immediately available.

### How to Use
The integrated How to Use tab covers:
- receiving-side trade entry;
- Player versus Draft Pick entry;
- required player fields;
- optional/default field behavior;
- Year 0 rookie entry guidance;
- Individual, Raw, and Adjusted Value terminology;
- Trade Analysis;
- common trade types;
- common mistakes;
- editing, removing, and clearing assets.

### Rules
The member-facing Rules tab covers:
- player-value factors;
- premium-player protections;
- draft-pick reference values;
- draft timing;
- package quality;
- draft trade-ups;
- verdict definitions;
- calculator precision/Trade Intelligence context.

The Rules tab intentionally avoids publishing the complete combined implementation formulas.

## Documentation and archive
The v1.2.0 / v4.1 release set includes the updated web implementation, README, canonical ruleset, Excel calculator, member rules guide, regression report, change log/archive index, completed update record, and these release notes. Superseded v4.0 artifacts and the prior standalone help page should remain with the historical archive rather than being reused as current release files.

## Release gates
- Interactive browser smoke test: **COMPLETE** by release-owner sign-off.
- Excel desktop recalculation check: **COMPLETE** by release-owner sign-off.
- Final repository commit/tag and publication details should be recorded in the v4.1 update/archive records when published.

## Suggested release title
**Release v1.2.0 / Ruleset v4.1 - Compact six-slot calculator redesign**
