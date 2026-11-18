# Excel-versus-Web Regression Report — Ruleset v4.2

**Public release:** v1.3.0  
**Ruleset:** v4.2

## Regression scope
Coverage includes Standard, Cornerstone, Elite QB, mirrored direction, exact same-package ties, exact cross-package Player-value ties, no-eligible-positive-Player cases, zero-package/incomplete handling, draft-only carry-forward, 8% boundaries, 12%/22% fallback boundaries, full precision, correction direction/amount, six-slot behavior, and seven Trade Intelligence reads.

## Corrective UI/parity pass
- Cross-package Player tie comparison uses strict equality in web and Excel semantics.
- Arithmetic boundary checks retain full-precision calculations; web uses only a tiny arithmetic tolerance at numeric window comparisons.
- Completed web asset cards collapse and preserve their open/closed state while editing.
- How to Use contains result terminology, common trade types, common mistakes, defaults, and editing guidance.
- Desktop/mobile layout and Calculator / How to Use / Rules navigation remain in the release UI.

## Gate status
Automated formula/engine checks: PASS. Excel/web mixed-trade parity checks: PASS. Desktop Excel recalculation: COMPLETE by release-owner sign-off. Interactive browser smoke: COMPLETE by release-owner sign-off. Final cross-file audit: PASS.
