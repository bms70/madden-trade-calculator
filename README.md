# Madden League Trade Calculator

A responsive web calculator for evaluating Player and Draft Pick trades in a Madden league, with persistent accepted-Trade history and protected administrative maintenance.

**Current Web Release:** v1.4.0  
**Current Ruleset:** v4.2

---

## Current Release

The current production mapping is:

**Web Release v1.4.0 | Ruleset v4.2**

Web Releases and Rulesets are versioned independently.

Web Release v1.4.0 adds application, persistence, administrative, historical, and user-experience functionality while preserving Ruleset v4.2 as the governing trade-valuation framework.

---

## Web Application

The current web application is provided through:

`index.html`

The application includes:

- Calculator
- How to Use
- Rules
- Trade History
- Admin
- Light and Dark appearance modes

The Calculator supports:

- User Team / CPU Team trade construction
- Player and Draft Pick assets
- Up to six assets per side
- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Player/mixed acquisition protection
- Draft-only protection
- Trade verdicts
- Suggested Correction
- Seven Trade Intelligence reads
- Accept & Log Trade

Calculations use full internal precision. Display rounding does not determine the verdict.

---

## Accepted Trades

Web Release v1.4.0 adds persistent accepted-Trade history.

After a Trade has actually been accepted:

1. Build and evaluate the Trade normally.
2. Review the Verdict, Adjusted Values, Trade Analysis, and Suggested Correction.
3. Select **Accept & Log Trade**.
4. Confirm the logging action.
5. Open **Trade History** to view accepted Trades.

Accepted Trade Records preserve a frozen evaluation snapshot including:

- Web Release
- Ruleset version
- User Team assets
- CPU Team assets
- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Adjusted Gap
- Verdict
- Evaluation path
- Protection metadata where applicable
- Suggested Correction
- Seven Trade Intelligence reads

Historical Trade detail is read-only and represents the evaluation stored when the Trade was accepted.

---

## Trade History

**Trade History** provides the public historical view of active accepted Trades.

Historical records include:

- Stable Trade Number
- Acceptance timestamp
- Verdict
- User Team package
- CPU Team package
- Web Release
- Ruleset version
- Frozen Trade detail

Selecting **View Trade** opens the stored historical evaluation rather than recalculating the Trade.

Logically deleted Trade Records are excluded from normal public Trade History.

---

## Admin

Web Release v1.4.0 includes a protected administrative area for Trade History maintenance.

Admin functionality includes:

- Shared administrator-password verification
- Temporary signed administrative authorization
- Session expiration
- Lock Admin
- Active Trades
- Delete Trade
- Protected Audit Log

Administrative authorization is temporary and held in memory by the active application session.

Reloading the application returns Admin to the locked state.

---

## Trade Deletion

Administrative **Delete Trade** performs logical deletion.

Deleting a Trade:

- Removes the Trade from normal public Trade History
- Preserves the original accepted Trade Record
- Preserves the original Trade UUID
- Preserves the stable Trade Number
- Preserves the frozen evaluation
- Creates a `TRADE_DELETED` Audit Event

Deletion requires:

- Valid administrative authorization
- A second confirmation
- Required self-reported Administrator Name
- Optional Deletion Reason

Administrator Name is audit metadata supplied by the administrator. It is not verified personal identity.

Logical Trade deletion and required Audit Event creation are performed atomically through protected backend functionality.

---

## Audit Log

The protected Admin area includes a read-only **Audit Log**.

Deletion Audit Events retain:

- Audit Event UUID
- Original Trade UUID
- Original Trade Number
- `TRADE_DELETED` action
- Timestamp
- Self-reported Administrator Name
- Deletion Reason when supplied

Audit Events are not exposed through normal public Trade History.

---

## Light and Dark Mode

Web Release v1.4.0 supports:

- Light mode
- Dark mode

The appearance control is available from the application header.

Theme preference is stored locally in the browser where supported.

Changing appearance does not change:

- Calculator inputs
- Trade valuation
- Verdict
- Trade Intelligence
- Trade History records
- Admin authorization
- Audit Events

---

## Ruleset v4.2

Ruleset v4.2 remains the governing valuation framework.

The canonical specification is:

`docs/rules/CANONICAL_RULESET_v4.2.md`

Ruleset v4.2 preserves:

- Six assets per side
- Full internal precision
- Player and Draft Pick valuation
- Package-quality credits
- Player/mixed acquisition protection
- Draft-only protection
- FAIR / QUESTIONABLE / UNFAIR / LEAGUE-BREAKING verdict behavior
- Suggested Correction
- Seven Trade Intelligence reads

Web Release v1.4.0 does not introduce a new valuation Ruleset.

---

## Trade Intelligence

The seven governed Trade Intelligence reads are:

1. Primary Read
2. Best Asset
3. Raw Value
4. Adjusted Value
5. Draft Capital
6. Package Structure
7. Suggested Correction

Trade Intelligence supplements the Verdict by explaining important characteristics of the evaluated Trade.

---

## Documentation

The GitHub Wiki is the human-readable project handbook.

Wiki documentation includes topics such as:

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

Current governed Ruleset files include:

- `CANONICAL_RULESET_v4.2.md`
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.2.docx`

### `docs/releases/`

Release notes and governed release records.

Web Release v1.4.0 adds:

- `RELEASE_NOTES_v1.4.0.md`

Existing v1.3.0 release records remain historical records and are not rewritten merely because a newer Web Release exists.

### `docs/validation/`

Regression and release-validation evidence.

v1.4.0 closeout includes release-specific validation and final cross-file audit records while preserving earlier v1.3.0 validation artifacts.

### `docs/roadmap/`

Future development planning.

Current roadmap material includes:

- `Madden League Trade Calculator - Ruleset v5.0 Development Roadmap.docx`
- `Madden_League_v5_Roadmap_Graphic.png`

### `reference/`

Reference implementations used for parity and validation.

Current reference implementation:

- `Madden League Trade Calculator v4.2.xlsx`

The workbook remains a Ruleset v4.2 reference implementation.

### `supabase/`

Version-controlled persistence and protected backend infrastructure for Web Release v1.4.0.

This includes:

- Database migrations
- Accepted-Trade storage
- Public active-history access controls
- Admin authentication functions
- Signed Admin-session verification
- Protected Trade deletion
- Protected Audit Log retrieval

### `archive/`

Preserved historical release and Ruleset artifacts.

Historical material remains separate from active development.

### Repository Root

- `index.html` — current web application
- `storage.js` — browser storage/backend integration
- `supabase-config.js` — public Supabase browser configuration
- `README.md` — repository overview and navigation

---

## Documentation Authority

Different repository artifacts serve different purposes.

- **Valuation and Ruleset policy:** `docs/rules/CANONICAL_RULESET_v4.2.md`
- **Web implementation:** `index.html`
- **Persistence/backend implementation:** `storage.js` and `supabase/`
- **Validation evidence:** `docs/validation/`
- **Release records:** `docs/releases/`
- **Reference implementation:** `reference/`
- **Future planning:** `docs/roadmap/`
- **Historical artifacts:** `archive/`
- **Human-readable project documentation:** GitHub Wiki

When application implementation conflicts with the canonical Ruleset, the discrepancy is treated as an implementation/parity issue rather than an undocumented Ruleset change.

---

## Versioning

Web Releases and Rulesets are versioned independently.

Current production mapping:

**Web Release v1.4.0 | Ruleset v4.2**

A Web Release may introduce:

- Application functionality
- User-experience changes
- Persistence
- Administrative functionality
- Documentation changes
- Infrastructure changes

without requiring a new valuation Ruleset.

A Ruleset version identifies the governed trade-valuation framework.

---

## Release Validation

Web Release v1.4.0 completed the technical release-validation gate while preserving Ruleset v4.2.

Recorded validation includes:

- Automated Ruleset v4.2 scenario regression: **24 / 24 PASS**
- Excel/Web scenario parity: **17 / 17 PASS**
- Desktop Excel recalculation: **COMPLETE by release-owner sign-off**
- v1.4.0 integration validation: **PASS**
- Security/source review: **PASS**
- Desktop/mobile browser smoke: **COMPLETE by release-owner sign-off**
- Final technical gate: **PASS**

Formal release documentation and final cross-file alignment are completed through the v1.4.0 release-closeout process.

---

## Future Development

Web Release v1.4.0 Trade History provides an early foundation for richer future transaction-history functionality.

It is **not** the completed future League Transaction Ledger.

Future development may expand league integration with richer transaction context, league teams, players, Draft Picks, season/stage context, validation, duplicate controls, querying, and historical analysis.

Longer-term Ruleset development remains separately governed.

The detailed future roadmap is maintained under:

`docs/roadmap/`

---

## Governance Principle

The repository is the version-controlled source for governed project artifacts.

The Wiki is the human-readable project handbook.

Canonical Ruleset specifications, application source, backend/persistence source, validation records, release records, reference implementations, roadmaps, and historical archives remain maintained in the repository.

**Current release:** Web Release v1.4.0  
**Current valuation authority:** Ruleset v4.2