# V5_ASSUMPTIONS_AND_RISKS

Ruleset v5.0 roadmap, Phase 0. Drafted 2026-11-21. Every open assumption and known risk for v5 work, with an owner and the phase where it gets resolved. Owners are the roles in `V5_PROJECT_CHARTER.md` (Site owner, Commissioner, Claude). Question numbers (Q#) refer to `V5_OPEN_QUESTIONS.md`.

Status values: **Open** (not settled), **Assumed** (working assumption, needs confirmation), **Accepted** (risk knowingly taken), **Mitigated** (control in place, still watched), **Resolved** (settled; kept for the record).

Updated 2026-11-21 with the main-league capture (A3, A8–A11, R8 resolved; A18, A19, R21, R22 added).

## Assumptions

| ID | Assumption | Source | Owner | Resolved in | Status |
|---|---|---|---|---|---|
| A1 | The league makes **10–30 trades per season** | Q8 | Commissioner | Phase 6 (measured from the ledger) | Assumed |
| A2 | CPU posture can only **raise** what a CPU team demands, never below v4.4 | Q13 | Commissioner | Phase 7 | Assumed |
| A3 | Week and offseason stage are **manual fields, pre-filled from the import** | Q18 | Commissioner | **Confirmed by the capture:** standings carry `calendarYear`, `stageIndex` and `weekIndex` (current week = `weekIndex + 1`). Field design in Phase 5 | Resolved |
| A4 | Long snappers get **0.50**, the same as K/P | Phase plan | Commissioner | Phase 7 | Assumed |
| A5 | Posture strength **scales with how lopsided the record is** | Phase plan | Commissioner | Phase 7 | Assumed |
| A6 | Offseason fade shape (stage by stage? squared in reverse or straight line?) | Q19 | Commissioner | Phase 7 | Open |
| A7 | Posture effect sizes (small for human teams, larger for CPU) | Q20 | Commissioner | Phase 6–7 calibration | Open |
| A8 | Snallabot paths keep the shape `/<secret>/<platform>/<leagueId>/<route>`, with no auth header, for the main league | Feasibility | Commissioner | **Confirmed by the capture** (league `5481323`) | Resolved |
| A9 | The main league's platform label, route paths and free-agent payload match the solo-league test | Field mapping | Commissioner | **Confirmed:** label `pc`, all routes as expected. Free agents ruled out of scope | Resolved |
| A10 | Standings `calendarYear` is a usable season for import snapshots | Field mapping | Claude | **Confirmed:** 2027 on every team | Resolved |
| A11 | The calculator's cap-hit units and role options can be mapped from the export without changing v4.4 inputs | Field mapping | Claude | **Confirmed:** cap hit ÷ 100 = the calculator's $M; roles (Starter / Backup) aren't exported and stay typed | Resolved |
| A12 | Draft-pick ownership is not exported, so the commissioner maintains it on a pick screen | Feasibility | Commissioner | Phase 2 (Web v3.0) | Assumed |
| A13 | Existing trade history moves into the current league in one migration, marked pre-league | Identity and access | Site owner | Phase 2 (Web v2.0) | Assumed |
| A14 | The current Supabase project has room for league tables, raw import payloads and the ledger at league scale | — | Site owner | Phase 2 (before Web v3.0) | Assumed |
| A15 | The deployed `accept-trade` matches the repo copy hashed in the baseline manifest (accepts v1.4.0/v4.2 and v1.5.0/v4.4) | Baseline manifest | Site owner | Phase 2 (re-deploy from repo before Web v2.0) | Assumed |
| A16 | The v5 candidate can run as a separate engine in shadow mode, so `valuation.js` never changes before Phase 9 | Charter (branching, approved 2026-11-21) | Site owner | Phase 8 build | Assumed |
| A17 | One league now; every league-owned record carries `league_id` so more can be added without a redesign | Identity and access | Site owner | Phase 2 | Assumed |
| A18 | Standings `stageIndex` 0 = preseason; offseason stages have their own values | Capture | Commissioner | An export taken in preseason or the offseason (before Phase 5) | Assumed |
| A19 | Team IDs are unique only within a league, and team names and abbreviations come from the league's payload (relocated teams, `AZ`) | Capture | Claude | Confirmed by the capture; applied in the Web v2.0 migration | Resolved |

## Risks

| ID | Risk | Effect | Mitigation | Owner | Resolved in | Status |
|---|---|---|---|---|---|---|
| R1 | v5 work reaches the live site by accident (`main` auto-deploys) | Members see unfinished features or changed verdicts | "Protect main" ruleset, branch + PR only, branching model in the charter | Site owner | Phase 0 | Mitigated |
| R2 | An interim release changes v4.4 valuation without a Ruleset revision | Verdicts change silently; v5 comparisons lose their baseline | Governed files hashed in the manifest; regression on every PR touching them; re-hash before each release merge | Claude | Ongoing to Phase 9 | Mitigated |
| R3 | A version bump merges before `accept-trade` accepts the new pair | Accepted trades fail to save | Deploy the function before merging every major release; listed in the release checklist | Site owner | Each major release (v2.0, v3.0, v4.0, v5.0) | Mitigated |
| R4 | The Web v2.0 snapshot-contract migration damages or orphans existing trade history | History lost or misattributed | Backup before migration, one-time migration marking trades pre-league, keep both old and new snapshot shapes readable | Site owner | Phase 2 | Open |
| R5 | Plain league names can be guessed | Anyone can view a league's trades and log junk into it (shown as Unreviewed) | Commissioner reverses junk; a short league code can be added if spam appears | Commissioner | Phase 2 (accepted design; revisit if abused) | Accepted |
| R6 | No member identities | Anyone can pick any team; the submitter name is self-reported | Commissioner review is the only check; human-to-human trades reviewed by the commissioner alone | Commissioner | Phase 2 | Accepted |
| R7 | Snallabot's EA link is unofficial and could break or change | Imports stop or change shape | Manual entry stays primary; every field editable; Companion backup; raw payloads kept for re-mapping | Commissioner | Phase 1 capture, then ongoing | Accepted |
| R8 | The main-league capture contradicts the solo-league field mapping | Import design changes | Capture run 2026-11-21: the mapping held; differences (relocated team, `AZ`, reused team IDs) folded into the docs | Commissioner | Phase 1 | Resolved |
| R9 | The Companion App Rosters export stays broken | Backup source unusable for rosters | Snallabot is primary; manual entry covers gaps | Commissioner | Phase 2 | Accepted |
| R10 | Small calibration sample (A1) | Calibration evidence is weak; risk of fitting noise | Lean on judgment plus shadow results; document sample-size limits in the Phase 6 report | Commissioner | Phase 6 | Accepted |
| R11 | A v5 candidate (posture, durability, aging, development, cap efficiency) weakens premium-asset protection | Quantity-for-quality finesse returns | Phase 7 guardrail: nothing loosens protection; premium-asset edge cases (elite/young QB, Year 0 rookie, expensive and short contracts, current and future firsts, bundling) in every candidate's regression | Claude | Phases 7–8 | Open |
| R12 | Imported values are edited to game the verdict | Unfair trades look fair | Edits to imported values are flagged and shown side by side in the audit view | Commissioner | Phase 3 | Mitigated (by design) |
| R13 | Desktop Excel recalculation of the v4.4 reference workbook is not signed off (parity was verified in LibreOffice only) | Workbook/Web parity under Excel unproven | Release owner opens and recalculates in desktop Excel and records the result in the parity report | Site owner | Before Phase 6 (the workbook is the parity reference for replay) | Open |
| R14 | The repo is public, so the complete reference and `valuation.js` expose the combined formulas | Members can reverse-engineer the model | Accepted: formulas stay out of the wiki and member docs; the model's protections hold even when known | Site owner | — | Accepted |
| R15 | Text files saved with a BOM or mojibake (U+00E2 U+20AC, U+00C2, U+00C3, U+FFFD) | Broken characters in docs or the site | UTF-8 without BOM; scan before every commit | Claude | Ongoing | Mitigated |
| R16 | A commit from the OneDrive local clone picks up a stale pre-edit copy | Wrong file content committed | Wait a few seconds after edits, re-stage and compare before committing | Claude | Ongoing | Mitigated |
| R17 | The wiki falls behind the repo (Claude can't push the wiki) | Members read outdated rules | Claude writes pages into the local wiki clone; site owner pushes with each release | Site owner | Each release | Mitigated |
| R18 | Interim web numbers (v2.0–v4.x) are confused with Ruleset numbers | Members think valuation changed | Every release note and the in-app label show both Web Release and Ruleset (v4.4) | Claude | Each release | Mitigated |
| R19 | Supabase capacity or plan limits are reached once raw import payloads are stored (A14) | Imports fail or the project needs a plan change | Measure payload sizes on the capture; keep raw payloads per snapshot with a retention rule | Site owner | Phase 2 | Open |
| R20 | `release/` branches drift from `main` during long releases | Painful merges, missed fixes | Merge `main` into open `release/` branches after every `fix/` merge | Claude | Ongoing | Mitigated |
| R21 | Exports arrive without some team rosters (capture: Tennessee, Houston and Minnesota missing) | A snapshot looks complete but isn't; pickers miss players | Validation flags teams without a roster; the commissioner re-exports or enters by hand; never mark a snapshot current silently | Commissioner | Next export (does it repeat?), Web v3.0 validation | Open |
| R22 | `durabilityGrade` is 0 for every player | A Phase 7 durability factor has no usable grade | Use `injuryRating` instead, or drop the factor | Claude | Phase 7 | Open |
