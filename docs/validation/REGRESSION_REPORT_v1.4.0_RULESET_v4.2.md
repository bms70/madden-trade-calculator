# Madden League Trade Calculator — v1.4.0 Validation Record

**Web Release:** v1.4.0  
**Governing Ruleset:** v4.2  
**Technical validation result:** PASS

## Purpose

This record captures the technical release validation performed for Web Release v1.4.0 while preserving Ruleset v4.2 as the governing valuation framework.

The validation distinguishes automated Ruleset regression, Excel/Web parity, desktop Excel recalculation, integrated application testing, source/security review, and manual browser/responsive sign-off.

Feature-level checks from the v1.4.0 implementation issues are treated as supporting evidence. This record captures the combined release-candidate gate.

## Ruleset boundary

Web Release v1.4.0 adds application, persistence, administrative, historical, and appearance functionality without introducing a new valuation Ruleset.

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

## Automated Ruleset regression

Automated scenario regression was executed against the v1.4.0 Web valuation engine.

**Result: 24 / 24 PASS**

Validated scenarios included:

1. Incomplete / zero-package handling
2. Standard acquisition target behavior
3. Mirrored Standard direction
4. Franchise Cornerstone acquisition protection
5. Elite QB acquisition protection
6. Directional correction below Required Target
7. Directional correction above FAIR Maximum
8. Same-package exact-value protection-rank tiebreaking
9. Exact cross-package Player-value tie
10. Strict cross-package Player-value inequality
11. No-eligible-positive-Player path
12. 8% path Suggested Correction
13. Under-12% QUESTIONABLE behavior
14. Exact 12% UNFAIR boundary
15. Under-22% UNFAIR behavior
16. Exact 22% LEAGUE-BREAKING boundary
17. Draft-only 1.01 protection
18. Draft-only 1.02 / 1.03 protection
19. Other meaningful Draft trade-up protection
20. Equal-best-pick Draft 8% treatment
21. Six-slot package-quality credits
22. Equal-value asset ordering
23. Draft Timing multipliers
24. Full-precision boundary behavior before display rounding

No unresolved Ruleset v4.2 regression failure remained.

## Player / mixed protection

Validated:

- Standard Player acquisition protection
- Franchise Cornerstone protection
- Elite QB protection
- Highest eligible positive-value Player behavior
- Mirrored direction
- Same-package exact-value protection-rank tiebreaking
- Exact cross-package Player-value ties
- Strict cross-package Player-value inequality
- No-eligible-positive-Player path
- Required Target behavior
- FAIR Maximum behavior
- Directional Suggested Correction

The v4.2 protection framework remains Standard 1.10x, Cornerstone 1.20x, and Elite QB 1.30x required return.

## Draft-only protection

Validated:

- Acquire 1.01 protection
- Acquire 1.02 / 1.03 protection
- Other meaningful trade-up protection
- Lateral / near-lateral treatment
- Current-draft timing
- Next-year timing
- Two-years-away timing
- Future first-round Draft Pick values
- Equal-best-pick 8% treatment

The governed Draft-only structure remains 1.15x / 1.08x / 1.04x / 1.00x as applicable, with the existing 8% treatment.

## Package quality

Validated:

- Six assets per side
- Package-quality ordering
- 100% / 90% / 75% / 60% / 50% / 50% package credits
- Exact-value sequential ordering
- Quantity-for-quality/package-compression behavior

## Verdict boundaries

Validated:

- FAIR
- QUESTIONABLE
- UNFAIR
- LEAGUE-BREAKING
- ADD ASSETS / incomplete
- 8% FAIR behavior where applicable
- Under-12% QUESTIONABLE behavior
- Exact 12% UNFAIR boundary
- Under-22% UNFAIR behavior
- Exact 22% LEAGUE-BREAKING boundary
- Zero-package / incomplete behavior

## Precision

Validated:

- Internal calculations use full precision.
- Display rounding remains presentation-only.
- Display rounding does not determine the Verdict.
- Strict Player-value equality remains intact where required.
- Full-precision values can evaluate differently even when display rounding appears equivalent.
- Existing arithmetic-boundary behavior remains consistent with the governed v4.2 implementation.

## Suggested Correction

Validated:

- Protected-target shortfall direction
- Protected-target shortfall amount
- FAIR Maximum excess direction
- FAIR Maximum excess amount
- 8% path correction behavior
- FAIR Trade no-correction behavior

Suggested Correction continues to use full-precision math.

## Trade Intelligence

All seven governed Trade Intelligence reads remain present:

1. Primary Read
2. Best Asset
3. Raw Value
4. Adjusted Value
5. Draft Capital
6. Package Structure
7. Suggested Correction

Validated:

- Seven-read structure remains intact.
- Reads remain aligned with the current evaluation.
- Reads remain aligned with Verdict and applicable protection behavior.
- Suggested Correction remains aligned with the correction path.
- Persistence, Trade History, Admin functionality, and theme state do not intentionally change Trade Intelligence for identical Calculator inputs.

## Excel / Web parity

Scenario-level parity was performed between the v1.4.0 Web valuation implementation and an independent reference model derived from the Ruleset v4.2 Excel reference workbook formulas and logic tables.

**Result: 17 / 17 PASS**

Parity scenarios included:

1. Incomplete one-sided Trade
2. Equal Draft Pick lateral Trade
3. 1.01 protected acquisition with adequate return
4. 1.01 protected acquisition with insufficient return
5. 1.03 protected Draft package
6. Future Draft Pick timing
7. Standard Player acquisition
8. Franchise Cornerstone acquisition
9. Elite QB acquisition
10. Mirrored Elite QB direction
11. Exact protected-Player tie
12. No-eligible-Player path with positive Draft value
13. Six-asset package compression
14. QB age comparison
15. Contract / role / rookie modifiers
16. Aging-70s treatment
17. Same-package protection-rank precedence

Compared across scenarios:

- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Adjusted Gap
- Evaluation mode
- Protection tier
- Protected direction
- Verdict
- Suggested Correction direction
- Suggested Correction amount

User Team / CPU Team Web terminology was normalized against Team A / Team B workbook terminology for semantic comparison only.

No unresolved scenario parity discrepancy remained.

## Reference-table parity

Web and workbook reference constants were compared.

Validated:

- Draft Pick values aligned.
- Position multipliers aligned.
- Draft Timing multipliers aligned.
- Six-slot package credits aligned.

## Desktop Excel recalculation

Desktop Excel recalculation is recorded separately from automated inspection and formula-parity work.

**Status: COMPLETE by release-owner sign-off**

Automated inspection is not represented as desktop Excel recalculation.

## Reference workbook correction

Release-candidate auditing identified stale visible governance metadata in the Rules & Definitions sheet of the Ruleset v4.2 reference workbook.

The stale references were:

- `CANONICAL_RULESET_v4.0.md`
- `Release v1.2.0 | Ruleset v4.1`

They were corrected to:

- `CANONICAL_RULESET_v4.2.md`
- `Release v1.3.0 | Ruleset v4.2`

The correction changed governance/release metadata only and did not alter valuation formulas.

The corrected workbook was installed as the repository reference workbook, recalculated in desktop Excel, committed to the v1.4.0 release branch, and pushed.

## v1.4.0 application integration

The combined v1.4.0 release candidate passed integration validation covering:

- Calculator
- User Team / CPU Team terminology
- Accept & Log Trade
- Duplicate-state logging protection
- Persistent accepted-Trade storage
- Public Trade History
- Frozen historical Trade detail
- Admin authentication
- Signed Admin authorization
- Active Trades
- Logical Trade deletion
- Atomic `TRADE_DELETED` Audit Events
- Protected Audit Log
- Light/Dark Mode
- Theme preference persistence
- Theme state preservation
- Public/Admin access separation

**Integration result: PASS**

## Accepted-Trade logging

Validated through feature and integration testing:

- Complete accepted Trades can be logged.
- Logged Trades receive stable identity.
- Web Release metadata is retained.
- Ruleset version is retained.
- User Team and CPU Team asset snapshots are retained.
- Individual Asset Values are retained.
- Raw and Adjusted Package Values are retained.
- Verdict is retained.
- Evaluation/protection metadata is retained.
- Suggested Correction is retained.
- Seven Trade Intelligence reads are retained.
- Duplicate-state protection operates through the normal logging workflow.
- Failure states do not falsely report successful logging.

## Persistence and Trade History

Validated:

- Accepted Trade persists across refresh and later browser interaction/session testing.
- Public retrieval returns expected active Trade Records.
- Logically deleted Trades are excluded from public Trade History.
- Active accepted Trades remain available.
- Historical summaries retain stable Trade identity and acceptance timestamp.
- Frozen historical detail remains read-only.
- Historical detail is loaded from stored snapshots rather than silently recalculated.
- Public Trade History exposes no Delete control.
- Public Trade History exposes no Audit Event data.

## Historical snapshot integrity

At least one surviving accepted Trade was retained for release validation.

Validated stored historical fields include:

- Trade UUID
- Stable Trade Number
- Acceptance timestamp
- Web Release
- Ruleset version
- User Team assets
- CPU Team assets
- Original stored inputs
- Individual Asset Values
- Raw Package Values
- Adjusted Package Values
- Adjusted Gap
- Verdict
- Evaluation path
- Applicable protection metadata
- Suggested Correction
- Seven Trade Intelligence reads

Viewing a frozen historical Trade does not intentionally modify the active Calculator or the stored historical record.

## Admin authentication and authorization

Validated:

- Admin starts locked.
- Public functionality remains available while Admin is locked.
- Incorrect administrator password is rejected.
- Failure messaging remains generic.
- Correct password unlocks Admin.
- Successful authentication establishes temporary signed administrative authorization.
- Administrative authorization contains expiration.
- Lock Admin returns the interface to the locked state.
- Refresh returns Admin to the locked state.
- Administrator password is absent from browser-delivered release-candidate source.
- Admin-session signing secret is absent from browser-delivered release-candidate source.
- Shared-password authorization is not represented as verified personal identity.

Server-side authorization-boundary testing included:

- Missing token
- Fabricated token
- Tampered token
- Genuine signed token

Invalid authorization was rejected independently of visible browser state.

## Protected deletion and atomic audit

Validated:

- Delete Trade is exposed only through unlocked Admin.
- Active Trades load correctly.
- Deleted Trades are excluded from Active Trades.
- Delete Trade opens a second confirmation.
- Blank Administrator Name is rejected.
- Whitespace-only Administrator Name is rejected.
- Administrator Name is retained as self-reported audit metadata.
- Deletion Reason remains optional.
- Cancel creates no database changes.
- Lock Admin clears pending deletion state.
- Successful deletion is logical rather than physical.
- Deleted Trade disappears from Admin Active Trades.
- Deleted Trade disappears from public Trade History.
- Deleted Trade remains absent after refresh.
- Original accepted Trade Record remains preserved.
- Exactly one required `TRADE_DELETED` Audit Event is created for a successful deletion.
- Audit Event retains original Trade identity, stable Trade Number, timestamp, Administrator Name, and supplied reason.
- Original frozen evaluation remains preserved after deletion.

Issue-level atomicity testing also demonstrated that an initial database error did not produce a completed partial deletion state.

## Audit Log

Validated:

- Audit Log requires valid Admin authorization.
- Unauthorized Audit Log retrieval is rejected.
- Audit Events display newest first.
- Audit Events remain read-only through the application.
- Original Trade Number remains associated with the Event.
- Administrator Name is displayed as self-reported metadata.
- Deletion Reason remains visible when supplied.
- Public Trade History does not expose Audit Events.
- Lock Admin removes Audit Log information from the active interface.

## Light / Dark Mode

Light and Dark appearance modes passed integration testing across:

- Calculator
- How to Use
- Rules
- Trade Analysis
- Trade History
- Frozen Trade detail
- Locked Admin
- Unlocked Admin
- Active Trades
- Delete confirmation
- Audit Log

Validated:

- Theme switching requires no page reload.
- Theme preference survives refresh.
- Stored preference restores where browser-local storage is available.
- Calculator state is preserved during theme switching.
- Historical view state is preserved during theme switching.
- Admin authorization state is preserved during theme switching.
- Pending deletion-confirmation state is preserved during theme switching.
- Theme changes do not alter valuation results.
- Theme changes do not alter persisted Trade Records or Audit Events.

## Browser and responsive validation

Interactive release-candidate browser smoke and responsive testing were completed at desktop and narrow/mobile widths.

Coverage included:

- Initial load
- Navigation
- Calculator interaction
- Trade Analysis
- Accept & Log Trade
- Trade History
- Frozen Trade detail
- Admin lock/unlock
- Active Trades
- Delete confirmation
- Audit Log
- Theme switching
- Refresh behavior
- Narrow/mobile layout
- Console review

**Status: COMPLETE by release-owner sign-off**

No unresolved release-blocking browser/runtime defect remained at sign-off.

## Security / source review

Browser-delivered release-candidate source was reviewed for accidental secret exposure.

No browser-delivered value was found for:

- Privileged Supabase/service-role credential
- `sb_secret_*` credential
- Private key
- Administrator password
- Admin-session signing secret

The public Supabase browser configuration continues to use the intended publishable browser credential rather than a privileged service credential.

## Technical findings

### Finding 1 — reference workbook metadata

The visible Rules & Definitions metadata in the Ruleset v4.2 Excel reference workbook contained stale canonical/release references.

**Resolution:** corrected to the current v4.2 canonical specification and v1.3.0 / v4.2 reference-workbook release mapping. No valuation formula changed.

### Finding 2 — Issue #8 database ambiguity

Protected deletion testing during v1.4.0 implementation identified PostgreSQL error `42702` for an ambiguous `deleted_at` reference inside the atomic deletion function.

**Resolution:** corrected through a version-controlled migration that explicitly qualifies the Trade-table column. Subsequent protected deletion and Audit Event testing passed.

### Finding 3 — Issue #12 theme-handler placement

Initial Light/Dark implementation testing identified the theme-control event handler inside `lockAdmin()`, preventing immediate page-load registration.

**Resolution:** moved the handler into the normal page-initialization path. Theme validation subsequently passed.

No unresolved technical release blocker remains from these findings.

## Release gate summary

- Automated Ruleset v4.2 scenario regression: **24 / 24 PASS**
- Excel/Web scenario parity: **17 / 17 PASS**
- Reference-table parity: **PASS**
- Desktop Excel recalculation: **COMPLETE by release-owner sign-off**
- v1.4.0 integration validation: **PASS**
- Persistence / historical integrity: **PASS**
- Admin authentication / authorization: **PASS**
- Protected deletion / Audit Log: **PASS**
- Light/Dark Mode integration: **PASS**
- Security/source review: **PASS**
- Desktop/mobile browser smoke: **COMPLETE by release-owner sign-off**

## Final technical decision

**FINAL TECHNICAL GATE: PASS**

Web Release v1.4.0 preserves Ruleset v4.2 valuation behavior and passes the required technical regression, parity, integration, persistence, administrative-security, source-security, browser, and responsive validation.

No unresolved technical release blocker remains from the validation gate.

Formal governed-document alignment, final cross-file audit, repository-cleanliness review, PR/merge, tag, and publication remain release-closeout activities until completed.
