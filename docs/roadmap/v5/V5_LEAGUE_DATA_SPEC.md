# V5_LEAGUE_DATA_SPEC

Ruleset v5.0 roadmap, Phase 1. Drafted 2026-11-21. Manual entry plus a commissioner audit is the primary path, imports are optional, every calculator field stays editable, and leagues are accessed by name with no member sign-in. This spec stays at entity level. Field-level detail is in `V5_FIELD_MAPPING.md`, access and the trade flow are in `V5_IDENTITY_AND_ACCESS.md`, and the build order is in `V5_PHASE_PLAN.md`.

## Principles

- **Built for several leagues:** every league-owned row has a `league_id`.
- **Manual first:** a league trade works with typed assets alone.
- **Imports pre-fill; they never lock.** Choosing an imported player fills in the calculator's fields, and every field stays editable. If the importer breaks, falls behind, or brings in a bad value, the calculator keeps working as it does today. Any edit made after a pre-fill is recorded for the audit, not blocked.
- **Source-independent imports:** a Snallabot relay, a Companion push or a CSV all normalize into the same tables.
- **Valuation unchanged until v5.0:** everything feeds the existing v4.4 inputs, with the same validation as typed values.

## Required for league trades (Web v2.0)

| Entity | Key fields | Source |
|---|---|---|
| League | `league_id`, name (unique, used for access), Madden version, platform label, external EA league ID (optional), commissioner password hash, status | Site owner creates it |
| Team | `league_id`, `team_id`, name, abbreviation, controlled_by (user / CPU) | Seeded with 32 NFL teams, or from an import (`userName` empty = CPU) |
| Trade | `league_id`, `trade_id`, status (pending / approved / rejected), submitter name, "my team", other team, original snapshot, corrected snapshot (if the commissioner edited it), auditor, reason, timestamps | Trade flow |
| Trade asset | `trade_id`, side, asset type (player / pick), the submitted v4.4 inputs, optional link to an imported `player_id` / `pick_id` and `snapshot_id`, imported values at the time of pre-fill, list of fields edited after pre-fill | Trade flow |

## Imports and league context (Web v3.0+)

| Entity | Key fields | Source |
|---|---|---|
| Import snapshot | `snapshot_id`, `league_id`, source, platform label, external league ID, season (`calendarYear`), week or offseason stage if available, received_at, status (received / validated / current / rejected), diagnostics | Importer (one snapshot per export burst) |
| Raw payload | `snapshot_id`, route, body | Importer (kept for reprocessing and debugging) |
| Player | `league_id`, `snapshot_id`, `player_id` (Madden `rosterId`), name, position, OVR, age, dev trait, cap hit, years remaining, years in league, `team_id` or free agent, practice-squad / IR flags | Import or CSV |
| Team standing | `league_id`, `snapshot_id`, `team_id`, wins / losses / ties, cap figures | Import (feeds trade posture) |
| League calendar | `league_id`, season, current week or offseason stage | Manual field, pre-filled from the import when available |
| Draft pick | `league_id`, `pick_id`, season, round, original team, current owner, pick number or timing | Commissioner-maintained |

## Asset fields → v4.4 inputs

These are exactly the fields and validation v4.4 already uses: position, OVR, age, dev trait, cap hit, years remaining (≥ 1 or blank), years in league (0 allowed) and role for players, plus the existing pick fields. Pre-filled values pass through the same validation as typed ones. Role is never imported, so it's always typed (with an optional depth-based suggestion in Phase 3).

## Audit support

- Each logged trade keeps the member's submitted entry, plus any commissioner correction with both v4.4 results.
- For pre-filled assets, the audit view shows imported and submitted values side by side and highlights the fields edited after the pre-fill.
- The audit view flags trades with an unfair verdict and, from Phase 5, posture warnings.

## Still to confirm

- The platform label and route paths for the main league.
- Whether any payload carries a week or offseason stage.
