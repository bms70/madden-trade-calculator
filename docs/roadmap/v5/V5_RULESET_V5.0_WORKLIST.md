# V5_RULESET_V5.0_WORKLIST

The v5.0 work list: what goes into Ruleset v5.0 and Web v5.0, and the order. Decided 2026-11-27. v4.4 stays official until v5.0 passes Gates B–D.

## Decisions (2026-11-27)

| Decision | Answer |
|---|---|
| Scope | **6 changes** in Ruleset v5.0. Development trajectory was dropped (2026-11-27): v4.4 already rewards youth through dev trait × age, the early-career bonus and cornerstone scarcity |
| How values are set | **Judgment first, checked by shadow mode** (the sample is about 10–30 trades a season). Phase 6 confirms or adjusts where its evidence allows |
| When v5.0 takes over | **As soon as it passes the gates**, mid-season if need be |

## Ruleset v5.0 changes

Starting values are proposed in Phase 7 and tuned in shadow mode. Guardrails: every input can be entered by hand, nothing loosens premium-asset protection, and combined formulas stay out of member-facing docs.

| # | Change | Approach | New input per player | Evidence (Phase 6) |
|---|---|---|---|---|
| 1 | **Trade posture** | CPU teams raise-only (a winning CPU team asks more for its starters); a small protective effect for human teams. Timing as in the v4.0 FYI: none in weeks 1–3, full by week 9, offseason fade by stage. Strength scales with the record | None (team record, from the export, editable) | Postures stored with every trade since v4.0 |
| 2 | **Long snapper** | Add LS at 0.50 (same as K and P) | None | — |
| 3 | **Per-pick 2nd and 3rd values** | A value for each pick 2.01–3.32, smooth like the 1st round, replacing Early / Mid / Late for current-draft picks | None (pick number, since v3.1) | Draft results by pick (offseason) |
| 4 | **Durability** | A small modifier from the injury rating (higher = more durable), never below a floor | Injury rating | Injury history in exports |
| 5 | **Position-specific aging** | Decline starts at a different age by position group instead of one curve for all. Starting ages: **HB 28 · WR / CB / S / LB / EDGE 30 · OL / TE / DT 31 · QB 31 · K / P / LS 33** (QB and K/P/LS set 2026-11-27; the rest are starting values for Phase 7). Decay rates set in Phase 7 | None (position only) | League-wide OVR by age and position (offseason) |
| 6 | **Cap efficiency** | A smooth curve of value against cap hit, relative to what a player of that OVR normally costs, replacing the five cap tiers (no cliffs; a bargain is rewarded, an overpay penalized) | None (cap hit already entered) | — |

## Work, in order

| Step | Phase | Release | Work | Status |
|---|---|---|---|---|
| 1 | 6, part 1 | — | Replay every logged trade under v4.4; look for gaps by position, premium status, pick timing, quantity-for-quality, corrections and posture. SQL: `sql/v5-phase6-trade-export.sql` | **Now** |
| 2 | 7 | docs | Proposal: exact rule and starting value for each change, worked examples, impact vs v4.4, regression spec | Next |
| 3 | 8 | **Web v4.1** | Shadow mode: the v5 candidate (its own engine file) runs next to v4.4 on every trade; members still see v4.4; the commissioner sees where v5 differs and why. New input field: injury rating, optional until v5.0 | After step 2 |
| 4 | 6, part 2 | — | League-wide calibration from player history (aging by position, durability, picks) | After the first offseason export |
| 5 | 8 | — | Tune from shadow results; league approval (Gate D) | — |
| 6 | 9 | **Web v5.0 + Ruleset v5.0** | v5 official; "gives" layout (Q32); `CANONICAL_RULESET_v5.0.md`, regression, How to Use, wiki, Excel workbook; `accept-trade` takes only v5.0 / v5.0; v4.4 archived | — |

## Open

- **Player picker (Q35):** bring it back with shadow mode (Web v4.1) so choosing a player fills in the injury rating from the export, or keep it on hold and type it in. With development trajectory dropped and aging by position only, injury rating is the only new field.
- Set in the Phase 7 proposal: posture effect sizes, durability multipliers and floor, aging decay rates by group, the cap-efficiency curve, and the 2nd/3rd per-pick values.
