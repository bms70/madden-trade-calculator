# Madden League Trade Calculator

A responsive web calculator for evaluating Player and Draft Pick trades in a Madden league.

**Current Web Release:** v1.3.0  
**Current Ruleset:** v4.2

---

## Calculator

The current web application is provided through:

`index.html`

The calculator supports:

- Player and Draft Pick trade assets
- Up to six assets per side
- Raw and Adjusted Package Values
- Player/mixed acquisition protection
- Draft-only protection
- Trade verdicts
- Suggested Correction
- Seven Trade Intelligence reads

Calculations use full internal precision. Display rounding does not determine the verdict.

---

## Documentation

The GitHub Wiki is the human-readable project handbook.

Wiki documentation includes:

- Using the Calculator
- Ruleset Overview
- Releases
- Development
- Web Release v1.4.0
- Architecture
- Ruleset v5.0 Roadmap
- Glossary
- Documentation Authority

The Wiki explains the project but does not replace governed repository artifacts.

---

## Repository Structure

### `docs/rules/`

Canonical and member-facing Ruleset documentation.

Current files include:

- `CANONICAL_RULESET_v4.2.md`
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.2.docx`

### `docs/releases/`

Current release notes and release records.

Current files include:

- `RELEASE_NOTES_v1.3.0.md`
- `Madden League Ruleset Change Log and Archive Index - v1.3.0.docx`
- `Madden League Ruleset Update Record - v1.3.0 Ruleset v4.2.docx`

### `docs/validation/`

Regression and release-validation records.

Current files include:

- `REGRESSION_REPORT_v4.2.md`
- `FINAL_CROSS_FILE_AUDIT_v1.3.0.md`

### `docs/roadmap/`

Future development planning.

Current files include:

- `Madden League Trade Calculator - Ruleset v5.0 Development Roadmap.docx`
- `Madden_League_v5_Roadmap_Graphic.png`

### `reference/`

Reference implementations used for parity and validation.

Current file:

- `Madden League Trade Calculator v4.2.xlsx`

### `archive/`

Preserved historical release and Ruleset artifacts.

Historical material should remain separate from active development.

### Repository Root

- `index.html` — current web application
- `README.md` — repository overview and navigation

---

## Documentation Authority

Different repository artifacts serve different purposes.

- **Valuation and Ruleset policy:** `docs/rules/CANONICAL_RULESET_v4.2.md`
- **Web implementation:** `index.html`
- **Validation evidence:** `docs/validation/`
- **Release records:** `docs/releases/`
- **Reference implementation:** `reference/`
- **Future planning:** `docs/roadmap/`
- **Historical artifacts:** `archive/`
- **Human-readable project documentation:** GitHub Wiki

When the application implementation conflicts with the canonical Ruleset, the discrepancy should be treated as an implementation-parity issue rather than an undocumented Ruleset change.

---

## Versioning

Web Releases and Rulesets are versioned independently.

The current production mapping is:

**Web Release v1.3.0 | Ruleset v4.2**

A Web Release may introduce application, user-experience, documentation, or infrastructure changes without requiring a new valuation Ruleset.

A Ruleset version identifies the governed trade-valuation framework.

---

## Current Development

The next planned application release is:

**Web Release v1.4.0 | Ruleset v4.2**

The planned release focuses on Trade History, accepted-trade logging, administrative controls, persistence, and user-experience improvements while preserving Ruleset v4.2.

Detailed requirements and development information are maintained in the GitHub Wiki and corresponding GitHub Issues.

---

## Future Development

Long-term development toward a future Ruleset v5.0 includes league integration, richer transaction history, league context, historical analysis, candidate-model research, and validation before any future Ruleset is promoted.

The detailed roadmap is maintained under:

`docs/roadmap/`

---

## Governance Principle

The repository is the version-controlled source for governed project artifacts.

The Wiki is the human-readable project handbook.

Canonical Ruleset specifications, application source, validation records, release records, reference implementations, roadmaps, and historical archives remain maintained in the repository.