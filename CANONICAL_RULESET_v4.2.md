# Madden League Trade Calculator — Canonical Ruleset Specification v4.2

**Public release:** v1.3.0  
**Ruleset:** v4.2  
**Status:** Maintenance release specification

## Scope
Ruleset v4.2 is the pre-v5 maintenance ruleset. It preserves the six-asset structure, full internal precision, established Player and Draft Pick valuation framework, package credits, draft-only protection, fallback verdict bands, and seven Trade Intelligence reads from the frozen v4.1 baseline while correcting mixed player/pick FAIR semantics.

## Player/mixed protection
A Player is eligible for protection only when OVR, age, position, and development trait are complete and Individual Asset Value is greater than zero. Each package selects its highest eligible positive-value Player using full internal precision.

For an exact same-package Player-value tie, protection rank breaks the tie in this order: Elite QB, Franchise Cornerstone, Standard. If value and rank also tie, input order breaks the tie. Protection tier does not break an exact cross-package Player-value tie.

- Standard acquisition: 1.10x required return.
- Franchise Cornerstone: age 26 or younger, 87+ OVR, Superstar/X-Factor; individual scarcity 1.25x; acquisition return 1.20x.
- Elite QB: QB, age 26 or younger, 90+ OVR, Superstar/X-Factor; acquisition return 1.30x.

If one package has the higher selected eligible Player value, that receiving side is the Protected Acquisition Side. Required Target = Protected Package × acquisition multiplier. FAIR Maximum = Required Target × 1.08. Counter-Package must be between Required Target and FAIR Maximum, inclusive.

If the selected eligible positive-value Players are exactly equal across packages, use the 8% Adjusted Gap path. If neither positive package contains an eligible positive-value Player, use the same 8% path. If either Adjusted Package Value is zero, the trade is incomplete.

## Package quality and precision
Assets rank from highest to lowest Individual Asset Value. Six positions receive 100%, 90%, 75%, 60%, 50%, and 50% credit. Exact ties rank sequentially by input order. Internal calculations and comparisons use full precision; rounding is display-only.

## Draft-only protection
- Acquire 1.01: 1.15x required return, target through +8%.
- Acquire 1.02 or 1.03: 1.08x, target through +8%.
- Other meaningful trade-up: 1.04x, target through +8%.
- Lateral/near-lateral: 1.00x, 8% treatment.

## Verdicts
FAIR applies when the applicable player/mixed or draft-only test is satisfied. If not FAIR: Adjusted Gap under 12% = QUESTIONABLE; 12% to under 22% = UNFAIR; 22% or more = LEAGUE-BREAKING.

## Suggested Correction
Directional mixed trades add the exact shortfall below Required Target or remove/return the exact excess above FAIR Maximum. The 8% path requires the lower package to reach 92% of the higher package. Correction math uses full precision.

## Trade Intelligence
The seven reads are Primary Read, Best Asset, Raw Value, Adjusted Value, Draft Capital, Package Structure, and Suggested Correction.

## Web UI requirements
Web Release v1.3.0 provides Calculator, How to Use, and Rules views; up to six assets per side; responsive desktop/mobile layout; compact collapsible completed asset cards that preserve expanded/collapsed state while editing; result terminology, examples/common trade types, common mistakes, and defaults in How to Use; and member-facing Rules content without publishing combined implementation formulas.

## Release gate
Excel and web must agree on v4.2 mixed-trade semantics, regression/parity must pass, desktop Excel recalculation and browser smoke require release-owner sign-off, governed documents must align, and the final cross-file audit must pass before publication.
