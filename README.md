# Madden League Trade Calculator

A responsive web calculator for evaluating Player and Draft Pick trades in a Madden league, with persistent accepted-Trade history and protected administrative maintenance.

**Current Web Release:** v1.5.0  
**Current Ruleset:** v4.4

---

## Current Release

The current production mapping is:

**Web Release v1.5.0 | Ruleset v4.4**

Web Releases and Rulesets are versioned independently.

Web Release v1.5.0 introduces Ruleset v4.4: revalued Draft Picks, continuous value curves (OVR, aging, contract control, draft timing), a tighter FAIR window, severity measured from the FAIR window, and a Fairness Score that names the favored side. The v1.4.0 application features are unchanged.

---

## Web Application

The current web application is provided through:

- `index.html` - Page structure and ordered stylesheet/script loading.
- `styles.css` - Application styling, responsive layouts, Light/Dark appearance palettes, Trade History styling, and Admin styling.
- `theme.js` - Browser-local Light/Dark preference restoration and theme application.
- `valuation.js` - Governed Ruleset v4.4 Web valuation engine.
- `calculator-ui.js` - Calculator state, calculator rendering, Trade Intelligence presentation, accepted-Trade snapshot construction, duplicate-state protection, and calculator event wiring.
- `trade-history.js` - Public read-only Trade History retrieval/presentation and frozen historical detail rendering.
- `admin.js` - Browser administrative-session UI, Active Trades presentation, deletion confirmation, and protected Audit Log presentation.
- `storage.js` - Browser-to-backend integration.
- `supabase-config.js` - Public Supabase browser configuration.
- `supabase/` - Protected backend functions and database migrations.

The application includes:

- Calculator
- How to Use
- Rules
- Trade History
- Admin
- Light and Dark appearance modes
- Links to the wiki's **Using the Calculator** guide (page footer and How to Use tab)

The Calculator supports:

- User Team / CPU Team trade construction
- Player and Draft Pick assets
- Up to six assets per side
- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Player/mixed acquisition protection
- Draft-only protection
- Trade verdicts with a Fairness Score and favored side
- Suggested Correction
- Eight Trade Intelligence reads
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
- Trade Intelligence reads (seven for v4.2 trades, eight for v4.4 trades)

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

## Ruleset v4.4

Ruleset v4.4 is the governing valuation framework.

The canonical specification is:

`docs/rules/CANONICAL_RULESET_v4.4.md`

Ruleset v4.4 changes:

- First round: 1.01 = 100 down to 1.16 = 80 (the top seven picks hold value), then 1.17 = 80 down to 1.32 = 50.
- Rounds 2–7 raised: 2nds 30/26/22, 3rds 16/13/10, 4th–7th 7/5/3/2.
- Future 1sts re-anchored: Early 97.2, Mid 85.7, Late 66, Unknown 83.9 (before timing).
- Exact slots 1.01–1.32 are Current draft only; Future 1sts are Next year or Two years away, so each pick is discounted once.
- Draft-only 1.01 and 1.02–1.03 protection is selected by which pick it is, not by its value.
- Positions: LT becomes OT (both tackles); CB and WR rise to 1.20, matching EDGE.
- OVR star curve: each OVR point above 60 is worth more than the last (OVR 90 = 34). Players are scaled so first-round picks carry about 1.74× their v4.2 weight against players.
- Aging is exponential decay for every OVR and dev trait: under 80 OVR from age 30, 80+ OVR from age 31.
- Contract control is a discounted integral: 2–5 years close to v4.2, and 6–7 year deals keep earning.
- Draft timing is a continuous discount (Two years away becomes 0.7225x).
- FAIR window tightened from 8% to 5%. Severity is distance outside the window: QUESTIONABLE under 5%, UNFAIR under 15%, LEAGUE-BREAKING 15%+.
- New Fairness Score (0–100) and favored side, shown with the verdict and as an eighth Trade Intelligence read.

Ruleset v4.4 carries forward from v4.2:

- Six assets per side
- Full internal precision
- Player/mixed protection tiers and multipliers
- Dev/age, cap, early-career, role, and QB-age context multipliers
- Package-quality credits
- Suggested Correction rules (with the 5% window)

Ruleset v4.2 is archived under `archive/ruleset-v4.2/`.

---

## Trade Intelligence

The eight governed Trade Intelligence reads are:

1. Primary Read
2. Best Asset
3. Raw Value
4. Adjusted Value
5. Draft Capital
6. Package Structure
7. Fairness Score (added in Ruleset v4.4)
8. Suggested Correction

Trade Intelligence supplements the Verdict by explaining important characteristics of the evaluated Trade.

---

## Documentation

The GitHub Wiki is the human-readable project handbook.

Wiki documentation includes topics such as:

- Using the Calculator
- Ruleset Overview
- Releases
- Development
- Web Release v1.5.0
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

- `CANONICAL_RULESET_v4.4.md`
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.4.docx`

### `docs/releases/`

Release notes and governed release records.

- `RELEASE_NOTES_v1.5.0.md`
- `RELEASE_NOTES_v1.4.0.md`

Historical v1.3.0 release records are preserved under `archive/v1.3.0/`, not in their former active documentation locations. They remain historical records and are not rewritten merely because a newer Web Release exists.

### `docs/validation/`

Regression and release-validation evidence.

v1.4.0 closeout includes release-specific validation and final cross-file audit records. Earlier v1.3.0 validation artifacts are preserved under `archive/v1.3.0/`, not in this directory.

This directory also holds the post-release structural refactor audit, `REFACTOR_AUDIT_v1.4.0.md`.

### `docs/roadmap/`

Future development planning.

Current roadmap material includes:

- `RULESET_V5.0_ROADMAP.md`: the current roadmap
- `v5/`: v5.0 Phase 1 planning documents (`V5_PHASE_PLAN.md`, `V5_DATA_SOURCE_FEASIBILITY.md`, `V5_FIELD_MAPPING.md`, `V5_LEAGUE_DATA_SPEC.md`, `V5_IDENTITY_AND_ACCESS.md`, `V5_OPEN_QUESTIONS.md`)
- `Madden League Trade Calculator - Ruleset v5.0 Development Roadmap.docx` and `Madden_League_v5_Roadmap_Graphic.png`: earlier roadmap material, kept for reference and superseded by the markdown roadmap

### `reference/`

Reference implementations used for parity and validation.

Current reference implementation:

- `Madden League Trade Calculator v4.4.xlsx`

The workbook is the Ruleset v4.4 reference implementation. The v4.2 workbook and member guide are archived under `archive/ruleset-v4.2/`.

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

Historical v1.3.0 release records are preserved under `archive/v1.3.0/`.

### Repository Root

- `index.html` — page structure and ordered stylesheet/script loading
- `styles.css` — application styling, responsive layouts, Light/Dark appearance palettes, Trade History styling, and Admin styling
- `theme.js` — browser-local Light/Dark preference restoration and theme application
- `valuation.js` — governed Ruleset v4.4 Web valuation engine
- `calculator-ui.js` — calculator state, rendering, Trade Intelligence presentation, accepted-Trade snapshot construction, duplicate-state protection, and calculator event wiring
- `trade-history.js` — public read-only Trade History retrieval/presentation and frozen historical detail rendering
- `admin.js` — browser administrative-session UI, Active Trades presentation, deletion confirmation, and protected Audit Log presentation
- `storage.js` — browser-to-backend integration
- `supabase-config.js` — public Supabase browser configuration
- `README.md` — repository overview and navigation

---

## Documentation Authority

Different repository artifacts serve different purposes.

- **Valuation and Ruleset policy:** `docs/rules/CANONICAL_RULESET_v4.4.md`
- **Web structure/application composition:** `index.html`
- **Web presentation:** `styles.css`
- **Governed Web valuation implementation:** `valuation.js`
- **Calculator and accepted-Trade snapshot implementation:** `calculator-ui.js`
- **Trade History implementation:** `trade-history.js`
- **Administrative browser interface:** `admin.js`
- **Theme implementation:** `theme.js`
- **Persistence/browser integration:** `storage.js` and `supabase-config.js`
- **Protected backend implementation:** `supabase/`
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

**Web Release v1.5.0 | Ruleset v4.4**

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

### Web Release v1.5.0 / Ruleset v4.4

- Automated Ruleset v4.4 regression (`node tests/ruleset-v4.4.test.js`): **64 / 64 PASS**
- v4.2 → v4.4 impact comparison: `docs/validation/IMPACT_COMPARISON_v4.2_to_v4.4.md`
- Excel/Web parity (`docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md`): **16 / 16 PASS** (LibreOffice recalculation)
- Desktop Excel recalculation: **PENDING release-owner sign-off**
- Member guide (.docx) and Wiki: **UPDATED**
- `accept-trade` deployment: **COMPLETE**
- Desktop/mobile browser smoke: **COMPLETE by release-owner sign-off**

### Web Release v1.4.0 / Ruleset v4.2

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

## Post-release Maintenance

Web Release v1.4.0 is frozen. Later fixes are recorded here as v1.4.0 maintenance rather than as a new Web Release number; none of them changes Ruleset v4.2.

A later post-release maintenance refactor modularized the browser application source to improve maintainability and auditability.

The structural refactor does not intentionally change:

- Ruleset v4.2 valuation behavior
- accepted-Trade snapshot fields
- persistence schemas
- browser/backend contracts
- administrative authorization
- logical deletion or Audit behavior
- Trade History behavior
- Light/Dark Mode behavior

**Ruleset impact:** None

The structural-refactor validation record is maintained at:

`docs/validation/REFACTOR_AUDIT_v1.4.0.md`

The refactored source has been validated, merged to `main`, and deployed.

### Accept & Log confirmation

A later maintenance change added the confirmation step that the v1.4.0 member workflow describes. **Accept & Log Trade** now opens an inline confirmation (**Cancel** / **Accept & Log**), and nothing is saved until the trade is confirmed. Changing the trade while the confirmation is open closes it.

This changes `index.html`, `calculator-ui.js`, and `styles.css` only. It does not change the accepted-Trade snapshot fields, persistence, backend functions, or Ruleset v4.2 valuation.

**Ruleset impact:** None

### Years left minimum

The **Years left** input accepts only whole numbers of 1 or more. Typing or pasting 0, a negative number, or a decimal is rejected with a status message; blank remains allowed and keeps its neutral default. **Years in league** still accepts 0 for rookies. Valuation already treated a 0 or blank Years left as 1 year, so no result changes.

**Ruleset impact:** None

### Documentation encoding cleanup

`docs/releases/RELEASE_NOTES_v1.4.0.md` and `docs/validation/FINAL_CROSS_FILE_AUDIT_v1.4.0.md` were re-saved as UTF-8 without a byte-order mark, and mis-encoded characters (`â€”`, `Â·`) were restored to `—` and `·`. No content was changed.

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

**Current release:** Web Release v1.5.0  
**Current valuation authority:** Ruleset v4.4