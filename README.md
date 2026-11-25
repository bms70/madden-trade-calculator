# Madden League Trade Calculator

A responsive web calculator for evaluating Player and Draft Pick trades in a Madden league. League mode logs each league's trades for commissioner review, and a practice mode is available for trying trades freely.

**Current Web Release:** v2.1  
**Current Ruleset:** v4.4

---

## Current Release

The current production mapping is:

**Web Release v2.1 | Ruleset v4.4**

Web Releases and Rulesets are versioned independently.

Web Release v2.1 adds **commissioner team editing**: the Commissioner tab sets each team to Human or CPU and gives it an owner label.

Web Release v2.0 added **League mode**:

- Members enter their league by name, pick both teams, and submit trades.
- Trades are logged as Unreviewed. Each league's commissioner reviews, corrects or reverses them behind the league's own password.
- **Practice mode** keeps the calculator for trying trades and no longer logs them.
- The shared Admin password is retired, and earlier history moves into the main league as **Pre-league**.

Valuation is unchanged: every verdict and value is Ruleset v4.4, as in Web Release v1.5.0.

---

## Web Application

The current web application is provided through:

- `index.html`: page structure and ordered stylesheet/script loading.
- `styles.css`: application styling, responsive layouts, Light/Dark palettes, league bar, history badges and Commissioner styling.
- `theme.js`: browser-local Light/Dark preference restoration and theme application.
- `valuation.js`: governed Ruleset v4.4 Web valuation engine.
- `league-mode.js`: the Practice / League switch, league bar, team pickers, display-only team names, and the league submission.
- `calculator-ui.js`: calculator state, rendering, Trade Intelligence presentation, the accepted-Trade snapshot, duplicate protection and Submit to league.
- `trade-history.js`: the entered league's read-only Trade History, with review-status badges and the original submission of corrected trades.
- `commissioner.js`: the Commissioner area (sign-in, review queue, Mark reviewed / Correct / Reverse, audit log) and correction mode.
- `storage.js`: browser-to-backend integration.
- `supabase-config.js`: public Supabase browser configuration.
- `supabase/`: backend functions and database migrations.

The application includes:

- Practice / League switch
- Calculator
- How to Use
- Rules
- Trade History
- Commissioner
- Light and Dark appearance modes
- Links to the wiki's **Using the Calculator** guide (page footer and How to Use tab)

The Calculator supports:

- Your team / other team trade construction (User Team / CPU Team in practice mode)
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
- Submit to league (League mode)

Calculations use full internal precision. Display rounding does not determine the verdict.

---

## Practice and League Modes

**Practice** (default) is the calculator for trying trades freely. Nothing is logged.

**League:**

1. Type the league's name and select **Enter**. The name is the access: there are no member accounts. Case and spacing don't matter, and the browser remembers the league.
2. Choose **Your team** and the **Other team**. The teams come from the league's Snallabot export, and human teams are marked.
3. Build the trade. Headings and Trade Analysis show the chosen team names.
4. Select **Submit to league**, enter your name and an optional note, and select **Submit**.

Submitted trades are logged immediately as **Unreviewed**. A trade that isn't FAIR can still be submitted, and it's flagged for the commissioner.

Team names appear **on screen only**. The stored evaluation keeps the engine's User Team / CPU Team wording, so every record is exactly what Ruleset v4.4 produced.

---

## Accepted Trades

Each league trade preserves a frozen evaluation snapshot. It includes:

- Web Release and Ruleset version
- Both teams' assets
- Individual, Raw and Adjusted Values
- Adjusted Gap
- Verdict
- Evaluation path
- Protection metadata where applicable
- Suggested Correction
- Trade Intelligence reads (seven for v4.2 trades, eight for v4.4 trades)

Each trade also records its league, both teams, and the submitter's name and note.

Every evaluation is kept as a **revision**. Revision 0 is the member's submission, and each commissioner correction adds one, so the original is never overwritten.

---

## Trade History

**Trade History** shows the entered league's active trades, newest first. Practice mode shows no history.

Each trade carries a review-status badge:

- **Unreviewed**: logged, waiting for the commissioner.
- **Reviewed**: checked by the commissioner.
- **Corrected**: the commissioner corrected the values. **Show original submission** displays revision 0 and the reason.
- **Pre-league**: logged before league mode.

Reversed trades are not listed. Selecting **View Trade** opens the stored evaluation rather than recalculating the trade.

Since v2.0, trades can only be read through a league name: the public read access to all trades was removed.

---

## Commissioner

Each league has its own commissioner password. The Commissioner tab requires League mode and that league's password. A session lasts 30 minutes, is held in memory only, and works only for that league. After 5 wrong passwords in 15 minutes, sign-in is refused for 15 minutes.

The Commissioner area includes:

- **Review queue:** Unreviewed trades, oldest first, flagged when the verdict isn't FAIR, when the trade is between two human teams, or when it looks like a duplicate (same teams and assets within 24 hours).
- **All trades:** every active trade. Reviewed trades can still be corrected or reversed.
- **Mark reviewed:** with an optional comment.
- **Correct:** opens the trade in the calculator. The commissioner edits it, v4.4 re-runs, and **Save correction** (with a required reason) adds a revision.
- **Reverse:** with a required reason. The trade leaves Trade History but nothing is erased.
- **Teams** (v2.1): set each team to Human or CPU and give it an owner label (visible only to commissioners). Changes update the team pickers right away and are audited.
- **Audit log:** the league's actions, newest first.

The commissioner's name is self-reported audit metadata, not a verified identity. Every action is authorized server-side for the token's league.

---

## Site Owner

Only the site owner creates and manages leagues. There's no owner screen on the website. The owner runs one-line SQL functions in the Supabase dashboard:

- Load teams from the latest Snallabot export.
- Set or reset a commissioner password.
- Create, rename or archive a league.
- Rotate the Snallabot import secret.
- Move pre-league history.

Guide: `docs/roadmap/v5/V5_OWNER_TOOLKIT.md`. Every owner change is written to the league's audit log.

---

## Light and Dark Mode

The application supports:

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
- Commissioner sessions
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
- Web Release v2.0
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
- `RULESET_v4.4_COMPLETE_REFERENCE.md`: every v4.4 rule, constant and formula in one place (the pre-v5.0 baseline record; it adds no new rules)
- `Madden League Trade Calculator - Ruleset v4.4 Complete Reference.docx`: Word version of the complete reference, for easier reading
- `Madden League Trade Rules and Valuation Guide - Ruleset v4.4.docx`

### `docs/releases/`

Release notes and governed release records.

- `RELEASE_NOTES_v2.1.md`
- `RELEASE_NOTES_v2.0.md`
- `RELEASE_NOTES_v1.5.0.md`
- `RELEASE_NOTES_v1.4.0.md`

Historical v1.3.0 release records are preserved under `archive/v1.3.0/`, not in their former active documentation locations. They remain historical records and are not rewritten merely because a newer Web Release exists.

### `docs/validation/`

Regression and release-validation evidence.

v1.4.0 closeout includes release-specific validation and final cross-file audit records. Earlier v1.3.0 validation artifacts are preserved under `archive/v1.3.0/`, not in this directory.

This directory also holds the post-release structural refactor audit, `REFACTOR_AUDIT_v1.4.0.md`, and the Web v2.0 validation record, `VALIDATION_v2.0.md`.

### `docs/roadmap/`

Future development planning.

Current roadmap material includes:

- `RULESET_V5.0_ROADMAP.md`: the current roadmap
- `v5/`: v5.0 planning and Web v2.0 documents. Planning: charter, phase plan, baseline manifest, data sources, field mapping, league data spec, identity and access, Snallabot connection, open questions. Web v2.0: `V5_WEB_V2.0_SPEC.md`, `V5_WEB_V2.0_FUNCTIONS.md`, `V5_OWNER_TOOLKIT.md`, `V5_WEB_V2.0_RUNBOOK.md`
- `Madden League Trade Calculator - Ruleset v5.0 Development Roadmap.docx` and `Madden_League_v5_Roadmap_Graphic.png`: earlier roadmap material, kept for reference and superseded by the markdown roadmap

### `reference/`

Reference implementations used for parity and validation.

Current reference implementation:

- `Madden League Trade Calculator v4.4.xlsx`

The workbook is the Ruleset v4.4 reference implementation. The v4.2 workbook and member guide are archived under `archive/ruleset-v4.2/`.

### `supabase/`

Version-controlled persistence and backend functions.

This includes:

- Database migrations: trade storage, leagues and the Snallabot import receiver, league mode (teams, revisions, assets, review, commissioner login) and the owner toolkit
- `accept-trade`: logs league trades (v2.0) after validation
- `commissioner-login`, `commissioner-session-check`, `review-trade`, `commissioner-audit-log`, `commissioner-teams` (v2.1): the Commissioner area, with league-bound signed sessions
- `snallabot-import`: receives Snallabot exports
- Shared validation and session modules in `functions/_shared/`, tested in Node

### `archive/`

Preserved historical release and Ruleset artifacts.

Historical material remains separate from active development.

Historical v1.3.0 release records are preserved under `archive/v1.3.0/`.

### Repository Root

- `index.html` — page structure and ordered stylesheet/script loading
- `styles.css` — application styling, responsive layouts, Light/Dark appearance palettes, league, history and Commissioner styling
- `theme.js` — browser-local Light/Dark preference restoration and theme application
- `valuation.js` — governed Ruleset v4.4 Web valuation engine
- `calculator-ui.js` — calculator state, rendering, Trade Intelligence presentation, accepted-Trade snapshot construction, duplicate-state protection, Submit to league, and calculator event wiring
- `league-mode.js` — Practice / League switch, league bar, team pickers, display-only team names and the league submission
- `trade-history.js` — the entered league's read-only Trade History, review badges and original submissions
- `commissioner.js` — Commissioner area and correction mode
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
- **League mode and submission:** `league-mode.js`
- **Commissioner interface:** `commissioner.js`
- **Site-owner league management:** `docs/roadmap/v5/V5_OWNER_TOOLKIT.md`
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

**Web Release v2.1 | Ruleset v4.4**

From v2.0, web numbers have two parts. A **major** number (v2.0, v3.0) marks a database, snapshot-contract or new-mode change, and a **minor** number (v2.1) marks features on the existing structure. Ruleset v5.0 and Web v5.0 are planned to ship together.

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

### Web Release v2.1 / Ruleset v4.4

Full record: `docs/validation/VALIDATION_v2.1.md`.

- Ruleset v4.4 regression: **64 / 64 PASS**. `valuation.js` matches its baseline hash.
- Browser scripts (`node tests/web-league-mode.test.js`): **94 / 94 PASS**
- Edge Function logic (`node --experimental-strip-types tests/web-functions.test.mjs`): **98 / 98 PASS**
- Team editing database (`tests/web-v2.1-teams.test.py`): **23 / 23 PASS**
- Import history database (`tests/import-history-db.test.py`): **43 / 43 PASS**
- Trade ledger database (`tests/trade-ledger-db.test.py`): **48 / 48 PASS**
- Live check: **PENDING release-owner sign-off**

### Web Release v2.0 / Ruleset v4.4

Full record: `docs/validation/VALIDATION_v2.0.md`.

- Ruleset v4.4 regression (`node tests/ruleset-v4.4.test.js`): **64 / 64 PASS**. `valuation.js` matches its baseline hash.
- Browser scripts (`node tests/web-v2.0-league-mode.test.js`): **85 / 85 PASS**, including all 16 parity scenarios producing the v1.5.0 snapshot apart from `web_release`.
- Edge Function logic (`tests/web-v2.0-functions.test.mjs`): **83 / 83 PASS**
- League-mode database (`tests/web-v2.0-db.test.py`): **67 / 67 PASS**
- Owner toolkit and launch sequence (`tests/web-v2.0-owner-toolkit.test.py`): **54 / 54 PASS**
- Launch and live smoke test (`docs/roadmap/v5/V5_WEB_V2.0_RUNBOOK.md`): **PENDING release-owner sign-off**

### Web Release v1.5.0 / Ruleset v4.4

- Automated Ruleset v4.4 regression (`node tests/ruleset-v4.4.test.js`): **64 / 64 PASS**
- v4.2 → v4.4 impact comparison: `docs/validation/IMPACT_COMPARISON_v4.2_to_v4.4.md`
- Excel/Web parity (`docs/validation/PARITY_REPORT_v1.5.0_RULESET_v4.4.md`): **16 / 16 PASS** (LibreOffice recalculation)
- Desktop Excel recalculation: **COMPLETE** (release-owner sign-off, 2026-11-22, after a pick-entry fix in the workbook)
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

Web Release v2.0 league history is a step toward the future League Transaction Ledger (planned for Web v4.0).

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

**Current release:** Web Release v2.1  
**Current valuation authority:** Ruleset v4.4