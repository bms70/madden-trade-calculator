# V5_PHASE_PLAN

Planning for Ruleset v5.0 / Web v5.0, drafted 2026-11-21 from the commissioner's decisions (see `V5_OPEN_QUESTIONS.md`). The roadmap phases in `../RULESET_V5.0_ROADMAP.md` are unchanged. This doc gives each phase its scope, release and exit check.

## Decisions this plan rests on

| Area | Decision | Status |
|---|---|---|
| Import source | **Snallabot** sends to our Supabase receiver. Companion App exports are accepted as a backup | Decided |
| Primary data path | Manual entry plus commissioner audit. Imports only pre-fill | Decided |
| Editable fields | Every calculator field stays editable. Edits to imported values are marked for the audit | Decided |
| League access | **League name only, no passwords for members.** Type the league name and trades go to that league. A plain name, no code | Decided |
| Commissioner access | A **commissioner password per league** protects Admin (review queue, imports, picks, corrections). It replaces today's single shared Admin password | Decided |
| League creation | Only the site owner creates leagues and sets their commissioner password | Decided |
| Practice calculator | Stays, unchanged | Decided |
| Trade flow | The member enters the league name, picks their team and the other team, enters assets and submits. **The trade is logged immediately as Unreviewed**; the commissioner reviews it afterwards and marks it Reviewed, corrects it, or reverses it | Decided |
| Human-to-human trades | The commissioner reviews alone, since there are no member identities to verify the other owner | Decided |
| Unfair verdicts | Can still be submitted; flagged in the review queue | Decided |
| Trade posture | FYI only until Ruleset v5.0. Full rule in v5.0 | Decided |
| Posture, in season | No effect weeks 1–3, then a **squared curve** from week 4 to full effect at week 9 (the trade deadline) | Decided |
| Posture, offseason | Last season's record counts at full strength after the season, **fading to zero by preseason week 3** | Decided |
| Posture strength | Scales with how lopsided the record is | Assumed |
| Posture, CPU teams | Can only **raise** what the CPU team demands, never below v4.4 | Assumed |
| Posture, human teams | A warning plus a very small protective effect | Decided |
| Week / offseason stage | Manual fields, pre-filled from standings (season, stage, current week = `weekIndex + 1`) | Decided (capture confirmed) |
| Free agents | Out of scope: not traded, not mapped. The receiver keeps the raw body | Decided |
| Long snappers | Get a position value in v5.0 (0.50 assumed, same as K/P) | Decided / value assumed |
| Trade volume | Assumed **10–30 trades per season** until known | Assumed |

## Release numbering

The finish line is **Web v5.0 + Ruleset v5.0**. Releases before that follow these rules:

- **Major (v2.0, v3.0, v4.0):** changes the database shape or the accepted-trade snapshot contract, or adds a new way of using the site. Always needs `accept-trade` updated and deployed before merge.
- **Minor (v2.1, v2.2, …):** features and UI on the existing structure, with no contract change.
- **Fixes:** recorded as maintenance on the current release, as with v1.4.0.
- **The Ruleset stays v4.4** through every interim release. Only v5.0 changes valuation.

## Phases

### Phase 0 — Freeze the v4.4 baseline · no release
- Work on `v5` branches. Nothing reaches `main` without a PR.
- Write V5_PROJECT_CHARTER.md, V5_ASSUMPTIONS_AND_RISKS.md and the v4.4 baseline manifest (canonical spec, reference workbook, regression and parity files, with hashes).
- **Exit:** v5 work can proceed without touching the live calculator.

### Phase 1 — League data foundation and identity · no release (docs)
- Finalize this folder: data-source feasibility, field mapping, league data spec, identity and access, plus a sample normalized schema (SQL).
- **Capture spike:** point the main league's Snallabot at a temporary receiver and run one full export. Confirm the platform label, all route paths, the free-agent payload, and whether the week or offseason stage is sent.
- **Exit (Gate A):** passed. The main-league capture (2026-11-21) confirmed the field mapping; free agents were ruled out of scope.

### Phase 2 — League layer and import layer · **Web v2.0**, then **v3.0**

**Web v2.0 — League mode (no imports yet)** · design spec: [`V5_WEB_V2.0_SPEC.md`](V5_WEB_V2.0_SPEC.md)
- Database: `leagues`, `teams` (32 per league, seeded from the league's `leagueteams` payload), league trades with a review status (unreviewed / reviewed / reversed), and audit records.
- Site: a **League / Practice switch**. League mode asks for the league name, then the member's team and the other team.
- Members submit trades, which are **logged immediately as Unreviewed** and shown that way in league history.
- Admin becomes a **commissioner area for each league** behind the commissioner password: a review queue of Unreviewed trades with verdict flags; mark Reviewed, correct values (which re-runs v4.4 and keeps both snapshots), or reverse with a reason (logical removal plus an audit record, like today's Delete Trade).
- Snapshot contract: adds `league_id`, team IDs, review status, reviewer, and the original and corrected snapshots. This needs a coordinated migration. Existing trade history moves into the current league, marked pre-league.
- **Exit:** a real trade can be submitted, logged, reviewed, corrected and reversed in league mode, and practice mode is unchanged.

**Web v3.0 — Imports**
- A Supabase receiver at a secret URL per league, for Snallabot (with Companion as a backup).
- Each export burst becomes one **import snapshot**. Raw payloads are kept. Teams and players are normalized using the field mapping.
- Validation diagnostics. The commissioner reviews each snapshot and marks it **current**; auto update can deliver data, but nothing becomes current without review.
- A **draft-pick ownership screen** for the commissioner, since picks aren't exported.
- **Exit (roadmap Phase 2):** one real league snapshot loads without changing v4.4 valuation.

### Phase 3 — League-aware calculator · **Web v3.1+**
- A team selector from imported teams. The **player picker pre-fills all fields**, and every field stays editable.
- An owned-pick selector, fed by the commissioner's pick screen.
- An audit view showing imported and submitted values side by side, with edited fields highlighted.
- Smarter pre-fill (suggestions only, editable): **role from the depth chart** and **future first-round tier from standings**.
- Long snappers are hidden from the pickers until v5.0 gives them a value; they can still be entered by hand.
- **Exit:** a normal trade can be built mostly by picking real league assets.

### Phase 4 — Transaction ledger · **Web v4.0**
- A normalized store of approved league trades (teams, players, picks, season, week or stage) with frozen v4.4 values.
- Duplicate detection, plus roster-diff detection of player moves between snapshots (treated as evidence only).
- This changes the snapshot contract, so it's a major release.
- **Exit:** completed trades can be queried consistently.

### Phase 5 — League context · **Web v4.1+**
- A **League context** panel next to the verdict, kept separate from the official reads:
  - A **trade posture FYI** for both teams (Win-now / Bubble / Rebuilding, with strength and weight), plus a warning for a human owner whose trade cuts against their team's situation.
  - Scheme fit, cap room, positional need, and injuries or durability.
- Posture inputs (week, stage, record) are manual fields pre-filled from imports.
- **Exit:** members can tell official v4.4 valuation apart from descriptive context.

### Phase 6 — Historical calibration lab · **Web v4.x** (commissioner-only tools)
- Replay logged and imported history under frozen v4.4. Look for gaps by asset class, position, premium status, draft timing, quantity-for-quality and **posture**.
- At an assumed 10–30 trades per season, expect to lean on judgment plus shadow results, and document the sample-size limits.
- **Exit:** repeatable evidence for what to keep, retune, add or reject.

### Phase 7 — v5.0 model proposal · docs
Each candidate factor is classified Keep / Retune / Add / Reject, with evidence:

| Candidate | Notes |
|---|---|
| **Trade posture** | CPU: raise-only. Human: small protective effect. Squared in-season ramp over weeks 4–9; offseason fade to preseason week 3; strength scaled by record. Effect sizes set here |
| **Long snapper position** | Add LS (0.50 assumed) |
| Durability | From injury rating / durability grade |
| Position-specific aging | Using physical ratings |
| Development trajectory | Young players: dev trait plus experience points |
| Cap efficiency | Value relative to cap hit as a curve instead of tiers |

Guardrails: every input must be enterable by hand; nothing loosens premium-asset protection; combined formulas stay out of member-facing docs.
- **Exit:** a league approval packet with an exact rule spec, impact vs v4.4, and a regression spec.

### Phase 8 — Shadow mode · **Web v4.x**
- v4.4 stays official while the v5 candidate runs alongside it. Differences are logged and shown to the commissioner in Admin.
- Expanded regression, including posture edge cases.
- **Exit (Gate D):** stable results, documented disagreements, league approval.

### Phase 9 — **Ruleset v5.0 + Web v5.0**
- CANONICAL_RULESET_v5.0.md, the web and reference-workbook implementations, member guide, regression report, cross-file audit, and release and archive records.
- `accept-trade` is updated for the v5.0/v5.0 pair before merge, and v4.4 is archived.

## Release map

| Release | Phase | Headline |
|---|---|---|
| (none) | 0–1 | Baseline freeze, specs, capture spike |
| **Web v2.0** | 2 | League mode, review queue, per-league commissioner password |
| **Web v3.0** | 2 | Snallabot imports, snapshots, pick-ownership screen |
| Web v3.1+ | 3 | Player-picker pre-fill, audit diffs, role and future-first suggestions |
| **Web v4.0** | 4 | Transaction ledger |
| Web v4.1+ | 5–8 | League context and posture FYI, calibration tools, shadow mode |
| **Web v5.0 + Ruleset v5.0** | 9 | Posture and other approved factors become official |

## Known risks

- **Plain league names can be guessed.** Anyone who guesses one can view that league's trades and log trades into it. Those trades show as Unreviewed until the commissioner reverses them.
- **There are no member identities.** Anyone can pick any team, so the commissioner's review is the only check on who submitted what.
- **Snallabot's EA link is unofficial** and could break. Manual entry and editable fields cover this.
- **The calibration sample is small** (an assumed 10–30 trades per season).
