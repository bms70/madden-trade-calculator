# FINAL CROSS-FILE AUDIT CHECKLIST

**Release:** v1.2.0  
**Ruleset:** v4.1  
**Automated/static checks:** 66  
**Passed:** 66  
**Failed:** 0  
**Manual release gates pending:** 0

## Checklist

### Artifacts
- [x] **CANONICAL_RULESET_v4.1.md** - PASS. 11331 bytes
- [x] **Madden League Trade Calculator v4.1.xlsx** - PASS. 33951 bytes
- [x] **index.html** - PASS. 23957 bytes
- [x] **README.md** - PASS. 4228 bytes
- [x] **REGRESSION_REPORT_v4.1.md** - PASS. 4656 bytes
- [x] **Madden League Trade Rules and Valuation Guide - Ruleset v4.1.docx** - PASS. 40356 bytes
- [x] **Madden League Ruleset Change Log and Archive Index - v1.2.0.docx** - PASS. 38540 bytes
- [x] **Madden League Ruleset Update Record - v1.2.0 Ruleset v4.1.docx** - PASS. 38905 bytes
- [x] **RELEASE_NOTES_v1.2.0.md** - PASS. 3523 bytes
### Versioning
- [x] **Canonical: Release v1.2.0** - PASS. release marker present
- [x] **Canonical: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Web: Release v1.2.0** - PASS. release marker present
- [x] **Web: Ruleset v4.1** - PASS. ruleset marker present
- [x] **README: Release v1.2.0** - PASS. release marker present
- [x] **README: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Rules Guide: Release v1.2.0** - PASS. release marker present
- [x] **Rules Guide: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Archive: Release v1.2.0** - PASS. release marker present
- [x] **Archive: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Update Record: Release v1.2.0** - PASS. release marker present
- [x] **Update Record: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Release Notes: Release v1.2.0** - PASS. release marker present
- [x] **Release Notes: Ruleset v4.1** - PASS. ruleset marker present
- [x] **Excel: Release v1.2.0** - PASS. Release v1.2.0 | Ruleset v4.1 | Six assets per side. Web navigation: Calculator | How to Use | Rules.
- [x] **Excel: Ruleset v4.1** - PASS. Release v1.2.0 | Ruleset v4.1 | Six assets per side. Web navigation: Calculator | How to Use | Rules.
### Trade structure
- [x] **Canonical says six assets** - PASS. v4.1 structure
- [x] **Web add limit is six** - PASS. JS cap at 6
- [x] **Excel Team A max 6** - PASS. TEAM A RECEIVES (MAX 6)
- [x] **Excel Team B max 6** - PASS. TEAM B RECEIVES (MAX 6)
### Web navigation
- [x] **Calculator tab** - PASS. present
- [x] **How to Use tab** - PASS. present
- [x] **Rules tab** - PASS. present
- [x] **Standalone help retired in README** - PASS. README archive note
### Draft
- [x] **1.01=90** - PASS. canonical first-round table reference
- [x] **1.02=83** - PASS. canonical first-round table reference
- [x] **1.03=77** - PASS. canonical first-round table reference
- [x] **67 / 46 / 31 / 44** - PASS. canonical reference
- [x] **1.00x; Next year = 0.85x; Two years away = 0.70x** - PASS. canonical reference
- [x] **1.15x** - PASS. canonical reference
- [x] **1.08x** - PASS. canonical reference
- [x] **1.04x** - PASS. canonical reference
### Player
- [x] **1.30x** - PASS. canonical reference
- [x] **1.20x** - PASS. canonical reference
- [x] **1.10x** - PASS. canonical reference
- [x] **1.25x** - PASS. canonical reference
### Package
- [x] **Six-position credit schedule** - PASS. 100/90/75/60/50/50
- [x] **Sequential tied ranking** - PASS. canonical tie rule
### Verdict
- [x] **QUESTIONABLE** - PASS. active verdict
- [x] **UNFAIR** - PASS. active verdict
- [x] **LEAGUE-BREAKING** - PASS. active verdict
- [x] **12% / 22% fallback** - PASS. canonical thresholds
### Trade Intelligence
- [x] **Primary Read** - PASS. canonical + web
- [x] **Best Asset** - PASS. canonical + web
- [x] **Raw Value** - PASS. canonical + web
- [x] **Adjusted Value** - PASS. canonical + web
- [x] **Draft Capital** - PASS. canonical + web
- [x] **Package Structure** - PASS. canonical + web
- [x] **Suggested Correction** - PASS. canonical + web
### Regression
- [x] **v4.0 baseline 55 / 0** - PASS. baseline carried forward
- [x] **v4.1 static checks marked PASS** - PASS. manual gates remain pending
### Governance
- [x] **Archive maps v1.2.0 to v4.1** - PASS. mapping present
- [x] **Update record includes final web experience** - PASS. three-tab experience recorded
- [x] **Release notes included** - PASS. release artifact present
### Technical
- [x] **HTML JavaScript syntax marker** - PASS. script block present; syntax was checked during build
- [x] **Excel package integrity** - PASS. workbook opened successfully in audit
- [x] **Excel support/history sheets hidden** - PASS. Logic Tables and Version History hidden

### Release Gate
- [x] **Interactive browser smoke test** - COMPLETE by release-owner sign-off.
- [x] **Excel desktop recalculation** - COMPLETE by release-owner sign-off.

## Release decision
**Automated/static cross-file audit:** PASS.
**Release v1.2.0 final gate:** PASS. Manual release gates recorded complete by release-owner sign-off.

## Audited release set
- `CANONICAL_RULESET_v4.1.md` - 11331 bytes
- `Madden League Trade Calculator v4.1.xlsx` - 33951 bytes
- `index.html` - 23957 bytes
- `README.md` - 4228 bytes
- `REGRESSION_REPORT_v4.1.md` - 4656 bytes
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.1.docx` - 40356 bytes
- `Madden League Ruleset Change Log and Archive Index - v1.2.0.docx` - 38540 bytes
- `Madden League Ruleset Update Record - v1.2.0 Ruleset v4.1.docx` - 38905 bytes
- `RELEASE_NOTES_v1.2.0.md` - 3523 bytes
