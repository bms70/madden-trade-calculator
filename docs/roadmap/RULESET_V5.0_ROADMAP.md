# Ruleset v5.0 / Web v5.0 Development Roadmap

This is a working roadmap, not a frozen ruleset specification. Last updated: 2026-11-21. It supersedes `Madden League Trade Calculator - Ruleset v5.0 Development Roadmap.docx` and the roadmap graphic in this folder, which are kept for reference. **Phase-by-phase scope, releases and decisions are in [`v5/V5_PHASE_PLAN.md`](v5/V5_PHASE_PLAN.md).**

**Principle:** Ruleset v4.4 stays the production baseline. League integration gets built first. A change becomes Ruleset v5.0 only once league-data-driven valuation changes are backed by evidence, regression-tested, and validated in shadow mode.

## Phase 0 and 1 documents

| Document | Purpose |
|---|---|
| [`v5/V5_PROJECT_CHARTER.md`](v5/V5_PROJECT_CHARTER.md) | Scope, goals, non-goals, governance, branching (Phase 0) |
| [`v5/V5_ASSUMPTIONS_AND_RISKS.md`](v5/V5_ASSUMPTIONS_AND_RISKS.md) | Every assumption and risk, with owner and resolving phase (Phase 0) |
| [`v5/V5_BASELINE_MANIFEST_v4.4.md`](v5/V5_BASELINE_MANIFEST_v4.4.md) | Frozen v4.4 / v1.5.0 baseline: files, hashes, test results (Phase 0) |
| [`v5/V5_PHASE_PLAN.md`](v5/V5_PHASE_PLAN.md) | Phases, releases, decisions, risks |
| [`v5/V5_DATA_SOURCE_FEASIBILITY.md`](v5/V5_DATA_SOURCE_FEASIBILITY.md) | Companion App status, relay comparison, Snallabot adoption |
| [`v5/V5_FIELD_MAPPING.md`](v5/V5_FIELD_MAPPING.md) | Madden 27 export fields mapped to v4.4 inputs |
| [`v5/V5_LEAGUE_DATA_SPEC.md`](v5/V5_LEAGUE_DATA_SPEC.md) | League data entities |
| [`v5/V5_SAMPLE_SCHEMA.sql`](v5/V5_SAMPLE_SCHEMA.sql) | Sample normalized schema (design draft), with tests in `V5_SAMPLE_SCHEMA_TESTS.sql` |
| [`v5/V5_IDENTITY_AND_ACCESS.md`](v5/V5_IDENTITY_AND_ACCESS.md) | League-name access, commissioner role, trade flow |
| [`v5/V5_OPEN_QUESTIONS.md`](v5/V5_OPEN_QUESTIONS.md) | Open questions, assumptions, answers |

## Versioning (decided 2026-11-21)

- **Ruleset v5.0 and Web v5.0 ship together** in Phase 9.
- **Web Releases use two-part numbers** (v5.0, not v5.0.0). The live release keeps its name, Web v1.5.0.
- **Interim releases:**
  - **Major** (v2.0, v3.0, v4.0): changes the database or the snapshot contract, or adds a new mode.
  - **Minor** (vX.1…): adds features on the existing structure.
  - Fixes are recorded as maintenance.
  - The plan: Web v2.0 = league mode, v3.0 = imports, v4.0 = transaction ledger, v5.0 = Ruleset v5.0. The Ruleset stays v4.4 until v5.0.

## Changes from the v4.1-era roadmap

| Old roadmap | Now |
|---|---|
| v4.1 is the production baseline | **v4.4** is the baseline (Web v1.5.0). v4.1 and v4.2 are archived. |
| Blocker: the mixed player/pick FAIR defect must be fixed before Phase 1 | **Resolved.** Fixed in v4.2 and carried into v4.4. |
| Seven Trade Intelligence reads | Eight (v4.4 added the Fairness Score). |
| Gates and calibration measure against v4.1 | They measure against **v4.4**. |
| No identity or ownership decisions | **Decided:** members access a league by its name, with no sign-in. Each league has a commissioner password. |
| Versioning covers the Ruleset only | Ruleset v5.0 is paired with **Web v5.0**. |

Considered and not adopted (2026-11-21): starting the transaction ledger in Phase 1 (it stays in Phase 4), and a minimum-sample-size requirement on Gate B.

## Phases

**Phase 0 — Freeze the v4.4 baseline.** v5 work happens on its own branches. The v4.4 release package is the comparison baseline. Deliverables: V5_PROJECT_CHARTER.md, V5_ASSUMPTIONS_AND_RISKS.md, and a v4.4 baseline manifest.

**Phase 1 — League data foundation and identity.**
- Data source (decided): Snallabot sends to our Supabase receiver, with Companion as a backup. Manual entry plus a commissioner audit is the primary path, and every field stays editable.
- Identity (decided): members enter a league by its plain name, with no sign-in. Only the commissioner imports data.
- Done: a sample normalized schema (`v5/V5_SAMPLE_SCHEMA.sql`) and the main-league capture (`v5/capture-2026-11-21/`). Gate A confirmed.

**Phase 2 — League layer and source-independent import layer** (Web v2.0 league mode, then Web v3.0 imports). Exit: one real league snapshot loads without changing v4.4 valuation.

**Phase 3 — League-aware calculator UX.** Team, player and owned-pick selectors that pre-fill the calculator. Every field stays editable. Role and future-first-tier suggestions.

**Phase 4 — Transaction ledger** (Web v4.0). Approved league trades stored with frozen v4.4 values, plus duplicate detection.

**Phase 5 — League context.** A trade-posture FYI, a warning for human owners, scheme fit, cap room, positional need and injuries. All of it is shown separately from official value.

**Phase 6 — Historical calibration lab.** Replay history under frozen v4.4 to find repeatable gaps, posture included.

**Phase 7 — v5.0 model proposal.** Candidates are trade posture, a value for the long-snapper position, durability, position-specific aging, development trajectory and cap efficiency. Each is classified Keep, Retune, Add or Reject, with evidence. Premium-asset protections are never loosened.

**Phase 8 — Shadow mode.** v4.4 stays official while the v5 candidate runs alongside it. The commissioner reviews the differences in Admin.

**Phase 9 — Ruleset v5.0 and Web v5.0 release.** Full release process. `accept-trade` is updated for the v5.0/v5.0 pair before merge, and v4.4 is archived.

## Decision gates

- **A — Data viability.** *Passed: manual entry plus audit, with Snallabot imports. Confirmed by the main-league capture on 2026-11-21 (`v5/V5_FIELD_MAPPING.md`).*
- **B — Historical evidence:** the data shows repeatable patterns that v4.4 misses.
- **C — Model value:** the candidate is a defensible improvement over v4.4.
- **D — Shadow validation:** stable results, regression passed, league approval.

## Non-negotiables

- v4.4 stays official until v5.0 passes the full release process.
- League data stays descriptive until an approved rule uses it.
- Historical trades are evidence, not truth.
- Every valuation change has an exact definition, rationale, affected artifacts, acceptance cases, and an archive record.
- Full internal precision and reproducible parity testing remain requirements.
- Every valuation input stays enterable by hand.
