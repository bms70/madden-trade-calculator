# Madden League Trade Calculator — Web Release v1.4.0

**Ruleset:** v4.2  
**Release theme:** Trade History, Administration & UX  
**Ruleset impact:** None

## Overview

Web Release v1.4.0 expands the Madden League Trade Calculator from a calculation-focused web experience into a persistent trade-history and administrative application while preserving Ruleset v4.2 as the governing valuation framework.

This release adds accepted-Trade logging, persistent public Trade History, frozen historical evaluation snapshots, protected administrative maintenance, audited logical deletion, and user-selectable Light/Dark appearance modes.

No valuation formula, Player value, Draft Pick value, protection rule, verdict threshold, Suggested Correction rule, or Trade Intelligence behavior is intentionally changed by Web Release v1.4.0.

## Highlights

- Updated member-facing terminology to **User Team** and **CPU Team**.
- Added **Accept & Log Trade** for Trades that have actually been accepted.
- Added persistent **Trade History** backed by stored accepted-Trade records.
- Added read-only frozen historical Trade detail.
- Added stable Trade identification and duplicate-state logging protection.
- Added a password-protected **Admin** area.
- Added temporary signed administrative authorization with expiration and **Lock Admin**.
- Added protected Active Trades management.
- Added logical **Delete Trade** behavior that preserves the original accepted Trade Record.
- Added required self-reported **Administrator Name** and optional **Deletion Reason** for deletions.
- Added atomic `TRADE_DELETED` Audit Event creation.
- Added a protected, read-only **Audit Log**.
- Added user-selectable **Light** and **Dark** appearance modes with local preference persistence.
- Preserved Ruleset v4.2 valuation behavior.

## Public Experience

### Calculator

The Calculator continues to support:

- Player and Draft Pick assets
- Up to six assets per side
- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Player/mixed acquisition protection
- Draft-only protection
- FAIR / QUESTIONABLE / UNFAIR / LEAGUE-BREAKING evaluation
- Suggested Correction
- Seven Trade Intelligence reads

Calculations continue to use full internal precision. Display rounding remains presentation-only.

### User Team / CPU Team terminology

The web application uses **User Team** and **CPU Team** terminology for trade construction and presentation.

The terminology change does not alter which package is being evaluated or the underlying Ruleset logic.

### Accept & Log Trade

After a Trade has actually been accepted, a member can use **Accept & Log Trade** to create a persistent historical record.

The logged snapshot preserves the accepted evaluation, including:

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

Duplicate-state protection prevents repeated logging of the same unchanged Calculator state through the normal logging workflow.

## Trade History

Web Release v1.4.0 adds public **Trade History**.

Trade History displays active accepted Trades and provides stable historical identification and read-only frozen detail.

Historical summaries include:

- Trade Number
- Acceptance timestamp
- Verdict
- User Team package context
- CPU Team package context
- Web Release
- Ruleset version

Selecting **View Trade** opens the frozen accepted evaluation rather than recalculating the historical Trade from current Calculator state.

Logically deleted Trades are excluded from normal public Trade History.

## Persistence

Accepted Trade Records are stored persistently through the v1.4.0 backend/storage architecture.

Public history retrieval is limited to active Trade Records.

Historical records retain the evaluation captured at acceptance so later application activity does not silently rewrite the original evaluation.

## Administrative Access

Web Release v1.4.0 adds a protected **Admin** area.

Administrative access uses a shared administrator credential verified through protected backend functionality.

Successful verification establishes temporary signed administrative authorization with expiration.

Administrative authorization is held in application memory for the active session. Reloading the application returns Admin to the locked state.

**Lock Admin** clears the active local administrative session and restores the locked interface.

Shared-password authorization grants administrative access but does not verify the personal identity of the individual using the credential.

## Active Trades and Protected Deletion

Unlocked Admin provides an Active Trades view for administrative historical maintenance.

### Delete Trade

**Delete Trade** performs logical deletion rather than physical destruction.

A successful administrative deletion:

- Removes the Trade from normal public Trade History
- Preserves the original accepted Trade Record
- Preserves the original Trade UUID
- Preserves the stable Trade Number
- Preserves the frozen accepted evaluation
- Creates exactly one required `TRADE_DELETED` Audit Event

Deletion requires:

- Valid signed administrative authorization
- A second explicit confirmation
- Required **Administrator Name**
- Optional **Deletion Reason**

Administrator Name is self-reported audit metadata and is not verified personal identity.

Logical deletion and required Audit Event creation are performed as one protected atomic operation.

## Audit Log

Unlocked Admin provides a protected, read-only **Audit Log**.

Deletion Audit Events retain:

- Audit Event UUID
- Original Trade UUID
- Original Trade Number
- `TRADE_DELETED` action
- Deletion timestamp
- Self-reported Administrator Name
- Deletion Reason when supplied

Audit Events are not exposed through normal public Trade History.

## Light and Dark Mode

Web Release v1.4.0 adds user-selectable:

- Light mode
- Dark mode

The appearance control is available in the application header.

The selected appearance preference is stored locally in the browser where supported and restored on later page loads.

Theme switching does not modify:

- Calculator inputs
- Valuation results
- Verdict
- Trade Intelligence
- Accepted Trade Records
- Trade History data
- Admin authorization
- Audit Events

## Ruleset v4.2

Ruleset v4.2 remains the governing valuation specification.

The canonical Ruleset remains:

`docs/rules/CANONICAL_RULESET_v4.2.md`

Web Release v1.4.0 does not create a new valuation Ruleset.

Ruleset v4.2 continues to govern:

- Full internal precision
- Six-asset package-quality treatment
- Player and Draft Pick valuation
- Standard Player acquisition protection
- Franchise Cornerstone protection
- Elite QB protection
- Draft-only protection
- Verdict boundaries
- Suggested Correction
- Seven Trade Intelligence reads

## Validation

Web Release v1.4.0 completed the technical release-validation gate while preserving Ruleset v4.2.

Recorded validation results:

- Automated Ruleset v4.2 scenario regression: **24 / 24 PASS**
- Excel/Web scenario parity: **17 / 17 PASS**
- Desktop Excel recalculation: **COMPLETE by release-owner sign-off**
- v1.4.0 integration validation: **PASS**
- Security/source review: **PASS**
- Desktop/mobile browser smoke: **COMPLETE by release-owner sign-off**
- Final technical gate: **PASS**

### Validation correction

Release-candidate validation identified stale visible metadata in the Ruleset v4.2 Excel reference workbook.

The workbook references were corrected to:

- `CANONICAL_RULESET_v4.2.md`
- `Release v1.3.0 | Ruleset v4.2`

The correction aligned release/governance metadata and did not change valuation formulas.

## Member Workflow

For an accepted Trade:

1. Build the Trade under **User Team Receives** and **CPU Team Receives**.
2. Complete the Trade inputs normally.
3. Review Adjusted Values, Verdict, Trade Analysis, and Suggested Correction.
4. Use **Accept & Log Trade** only after the Trade has actually been accepted.
5. Confirm the logging action.
6. Open **Trade History** to review accepted Trades.
7. Select **View Trade** to inspect the frozen historical evaluation.

## Administrator Workflow

For administrative Trade History maintenance:

1. Open **Admin**.
2. Enter the shared administrator password.
3. Review Active Trades after successful authorization.
4. Select **Delete Trade** for an incorrect historical record.
5. Review the second confirmation.
6. Enter required **Administrator Name**.
7. Optionally enter **Deletion Reason**.
8. Select **Confirm Delete**.
9. Review the resulting `TRADE_DELETED` entry in **Audit Log**.
10. Select **Lock Admin** when administrative work is complete.

## Future Transaction History

Web Release v1.4.0 Trade History is an early foundation for richer future league-transaction functionality.

v1.4.0 is **not** the completed future League Transaction Ledger.

Future work may expand transaction history with richer league-team, player, Draft Pick, season/stage, validation, duplicate-control, querying, and historical-analysis capabilities.

## Release Gate

Technical validation for Web Release v1.4.0 is complete and PASS.

Final governed-document alignment, final cross-file audit, repository-cleanliness review, PR/merge, tag, and publication remain release-closeout activities until those steps are completed.
