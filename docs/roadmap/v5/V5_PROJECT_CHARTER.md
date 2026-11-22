# V5_PROJECT_CHARTER

Ruleset v5.0 roadmap, Phase 0. Drafted 2026-11-21. This charter sets the scope and rules for all v5 work. Phase details are in `V5_PHASE_PLAN.md`; decisions and their dates are in `V5_OPEN_QUESTIONS.md`; the frozen comparison baseline is `V5_BASELINE_MANIFEST_v4.4.md`; assumptions and risks are in `V5_ASSUMPTIONS_AND_RISKS.md`.

## Purpose

The calculator exists so league members learn to build fair trades. Trading is **intentionally difficult**: premium assets (elite or young QBs, young stars, rookies, high current firsts) are protected against quantity-for-quality bundling. v5 adds a league layer, league data imports and a trade ledger, then uses that evidence to propose Ruleset v5.0. It does not make trades easier.

## Scope

In scope:

- **League mode** (Web v2.0): leagues, 32 teams per league, league-exclusive trades logged immediately as Unreviewed, a commissioner area per league behind its own commissioner password.
- **Imports** (Web v3.0): a Supabase receiver for Snallabot exports (Companion App as backup), import snapshots, validation, and a commissioner pick-ownership screen.
- **League-aware calculator** (Web v3.1+): team, player and owned-pick pickers that pre-fill fields, with every field still editable.
- **Transaction ledger** (Web v4.0) of approved league trades with frozen v4.4 values.
- **League context and calibration** (Web v4.1+): trade-posture FYI, scheme fit, cap room, need and injuries, shown apart from the official verdict; commissioner-only replay tools; shadow mode for the v5 candidate.
- **Ruleset v5.0 + Web v5.0** (Phase 9): the approved factors become official.

## Goals

1. Keep v4.4 official, unchanged and reproducible until v5.0 passes the full release process.
2. Make league trades easy to log and easy for the commissioner to review, correct or reverse.
3. Let imports remove typing without ever becoming the only way in: every input stays enterable by hand.
4. Collect enough evidence (ledger, imports, replay) to judge each v5 candidate as Keep / Retune / Add / Reject.
5. Ship Ruleset v5.0 with an exact spec, regression and parity, member docs and an archive record, like every earlier ruleset.

## Non-goals

- Making trades easier or loosening premium-asset protection.
- Changing `valuation.js` before Phase 9. Interim releases (v2.0 to v4.x) keep Ruleset v4.4.
- Member accounts or sign-in. Access stays by plain league name.
- Changing the practice calculator. It stays open, league-free and unable to log trades.
- Publishing combined formulas in member-facing docs or the wiki.
- Depending on imports. If Snallabot or the Companion App breaks, manual entry still covers everything.
- Reviving "Lean" verdict wording.
- Letting members create leagues. Only the site owner does.

## Decisions this charter rests on

All decided by the commissioner on 2026-11-21 unless marked assumed. The full log, with the open and assumed items, is `V5_OPEN_QUESTIONS.md`.

| Area | Decision |
|---|---|
| Baseline | Ruleset v4.4 / Web v1.5.0 at `main` commit `a0703dd` (tag `ruleset-v4.4-baseline`), frozen in `V5_BASELINE_MANIFEST_v4.4.md` |
| Versioning | Ruleset v5.0 and Web v5.0 ship together. Two-part web numbers. Major = database, snapshot-contract or new-mode change; minor = features on the existing structure; fixes = maintenance |
| League | Madden 27, cross-play, Discord. One league now, built for several |
| Access | Plain league name for members, no sign-in. One commissioner password per league (replaces the shared Admin password in Web v2.0). Only the site owner creates leagues |
| Trade flow | Log now, review after. Unfair verdicts can be submitted and are flagged. The commissioner reviews human-to-human trades alone |
| Data | Manual entry is the primary path. Snallabot is the import source, Companion is the backup. Imports only pre-fill; edits to imported values are flagged |
| Posture | FYI only until v5.0. In season: none weeks 1–3, squared ramp from week 4 to full at week 9. Offseason: last season's record at full strength, fading to zero by preseason week 3. Human teams: warning plus a very small protective effect |
| Long snappers | Get a position value in v5.0 (0.50 assumed); hidden from pickers until then |

## Phase and release map

| Phase | Work | Release | Exit |
|---|---|---|---|
| 0 | Freeze the v4.4 baseline: this charter, assumptions and risks, baseline manifest, branching, baseline tag | none | v5 work can proceed without touching the live calculator |
| 1 | League data foundation and identity: sample schema, capture spike | none (docs) | Gate A confirmed by a main-league capture |
| 2 | League layer, then import layer | **Web v2.0**, **Web v3.0** | A real league trade is logged, reviewed, corrected and reversed; one real snapshot loads without changing v4.4 |
| 3 | League-aware calculator | Web v3.1+ | A normal trade can be built mostly from real league assets |
| 4 | Transaction ledger | **Web v4.0** | Completed trades can be queried consistently |
| 5 | League context, posture FYI | Web v4.1+ | Members can tell official value from context |
| 6 | Historical calibration lab | Web v4.x | Repeatable evidence (Gate B) |
| 7 | v5.0 model proposal | docs | League approval packet (Gate C) |
| 8 | Shadow mode | Web v4.x | Gate D: stable results, regression passed, league approval |
| 9 | Ruleset v5.0 + Web v5.0 | **Web v5.0** | Full release; v4.4 archived |

## Governance

### Roles

| Role | Responsibility |
|---|---|
| **Site owner** | Owns the repo, Supabase project and live site. Merges PRs, deploys Edge Functions, creates leagues and sets commissioner passwords, accepts risks |
| **Commissioner** | Decides league rules and answers v5 questions, runs the capture spike, reviews league trades and import snapshots, approves the v5 proposal with the league |
| **Claude** | Drafts docs, code and tests on branches, runs regression and parity, opens PRs and gives ready-to-paste merge text. Never merges |

### Authority order

When documents disagree, the higher one wins:

1. `docs/rules/CANONICAL_RULESET_v4.4.md` and `valuation.js` (until v5.0 ships).
2. `V5_BASELINE_MANIFEST_v4.4.md` for what the baseline files are.
3. This charter, then `V5_PHASE_PLAN.md`, then the other `docs/roadmap/v5/` docs.
4. Records (complete reference, member guide, wiki, Claude project copies).

### Change control

- **Baseline files** are the ones listed under "Governed baseline" in the manifest.
  - The valuation files (`valuation.js`, the canonical spec and complete reference, the reference workbook, the regression and parity files, the member guide) change only with a Ruleset revision: exact definition, rationale, regression, Excel/Web parity, docs and an archive record. v5 work doesn't do this before Phase 9; candidate logic lives in a separate engine file (see Branching).
  - `calculator-ui.js` and `accept-trade` will change in major releases for the snapshot contract. Each such release PR adds new hashes as a manifest addendum and confirms the valuation files and regression results are unchanged.
- **Every PR that touches a baseline file** says so in its description and re-runs `node tests/ruleset-v4.4.test.js`. A PR that changes `valuation.js` without a Ruleset revision is not merged.
- **Snapshot contract:** `buildTradeSnapshot()` field names and `accept-trade`'s accepted Web Release / Ruleset pairs change only in a major release, with a coordinated migration, and the function is deployed **before** the merge.
- **Docs follow behavior:** README, wiki and the in-app How to Use / Rules tabs change together with the behavior they describe.
- **Encoding:** UTF-8 without BOM; scan for mojibake before every commit.
- **Questions:** unanswered questions go in `V5_OPEN_QUESTIONS.md` (repo and project copy). Skipped ones get a stated assumption under "Assumed".
- **Gates A–D** in `../RULESET_V5.0_ROADMAP.md` must be passed in order. Gate results are recorded in the phase's docs.

### Releases

Each release (v2.0 onward) has release notes in `docs/releases/`, a validation record in `docs/validation/` (regression result, plus parity when valuation or the workbook is touched), a GitHub tag and Release, and wiki updates. A major release also records the migration and the `accept-trade` deploy.

## Branching (approved 2026-11-21)

`main` auto-deploys to GitHub Pages and is protected by the "Protect main" ruleset (PR required, no force push or deletion). The model below keeps that and avoids a long-running branch that drifts from `main`.

| Branch | Purpose | Base | Merges into |
|---|---|---|---|
| `v5/phase-<n>-<topic>` | Docs and planning for a phase, e.g. `v5/phase-0-baseline`, `v5/phase-1-schema` | `main` | `main` by PR (docs-only PRs can merge any time) |
| `release/web-v<x.y>` | Integration branch for one release that needs several PRs, e.g. `release/web-v2.0` | `main` | `main` by one release PR, after `accept-trade` and migrations are deployed |
| `feature/web-v<x.y>-<topic>` | One piece of a release, e.g. `feature/web-v2.0-league-switch` | its `release/` branch | the `release/` branch by PR |
| `fix/<topic>` | Maintenance on the live release (recorded as maintenance on v1.5.0 or the current release) | `main` | `main` by PR; then merged forward into any open `release/` branch |
| `v5/ruleset-v5.0` | Phase 9 only: the new canonical spec, workbook and the switch of the official engine | `main` (after the last Web v4.x) | `main` by the Ruleset v5.0 release PR |

Rules:

1. Nothing goes straight to `main`.
2. `release/` branches are kept current by merging `main` into them (no rebasing shared branches), and are deleted after their release PR merges.
3. The v5 candidate model is built as a **separate engine file** (for example `valuation-v5-candidate.js`) that ships in shadow mode in Web v4.x. `valuation.js` stays at its manifest hash until the `v5/ruleset-v5.0` PR.
4. Each release merge is tagged (`v2.0`, `v3.0`, …). The baseline is tagged `ruleset-v4.4-baseline` on `a0703dd` so it can be checked out by name.
5. Before a release PR merges, the baseline files are re-hashed against the manifest; any difference must be explained in the PR.
