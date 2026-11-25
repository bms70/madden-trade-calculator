# V5_IMPORT_HISTORY

Backend only. **No Web Release**, no site change, Ruleset v4.4 and `valuation.js` unchanged. Nothing on the website reads these tables.

**Why:** the player picker and pre-fill (Web v3.0, Phase 3) wait, but Ruleset v5.0 needs history now: posture, aging, development, durability and cap efficiency all need many weeks of data, and raw exports are only kept for a limited number of exports. So every export is copied into small typed history tables as it arrives. Decided 2026-11-24.

- Migration: `supabase/migrations/20261124020000_import_history.sql`
- Tests: `tests/import-history-db.test.py` (44 / 44)
- No Edge Function change: the receiver's database function does the work, so launch is one `db push`.

## How it works

- **On arrival.** When a `team/<id>/roster` or `standings` payload is stored, `record_snallabot_payload` builds its history rows in the same call.
- **Never blocks an export.** If building history fails, the payload is still stored and marked `FAILED` with the reason (`import_payloads.history_status`, `history_error`). Snallabot still gets `200`.
- **Every export kept.** A manual export and an auto update in the same week are both kept. The `*_latest` views use the newest export for each league week.
- **Duplicates.** A body that's identical to one already in the same export isn't stored again, so it adds no history rows.
- **Survives retention.** Trimming raw bodies leaves history untouched. History can only be **built** from a payload that still has its body.
- **Game stats** (passing, rushing and the rest) are not included (decided 2026-11-24). They stay in the raw exports while those are kept.

## Tables

### `player_history`: one row per player per roster payload

Key: (`payload_id`, `roster_id`). `roster_id` is Madden's `rosterId`, which is stable across weeks and trades. Every player on the roster is kept, including practice squad and IR players, with flags.

| Group | Columns (Madden field) |
|---|---|
| Identity and team | `team_id`, `first_name`, `last_name`, `position` (Madden label), `jersey_num` |
| v4.4 inputs | `ovr` (playerBestOvr), `age`, `dev_trait` (0 Normal, 1 Star, 2 Superstar, 3 X-Factor), `years_pro`, `cap_hit` (units of $10,000), `contract_years_left` |
| Status | `is_on_practice_squad`, `is_on_ir`, `is_active`, `is_free_agent` |
| Development | `scheme_ovr` (playerSchemeOvr), `experience_points`, `skill_points`, `legacy_score` |
| Durability | `injury_rating`, `injury_type`, `injury_length` (weeks; 0 = healthy). `durabilityGrade` is always 0, so it's skipped |
| Aging | `speed`, `acceleration`, `agility`, `strength`, `awareness`, `stamina`, `toughness`, `height` (in), `weight` (lb), `birth_year` / `birth_month` / `birth_day` |
| Contract | `contract_length`, `contract_salary`, `contract_bonus` (dollars, totals), `cap_release_penalty` (units of $10,000), `cap_release_net_savings` (dollars), `re_sign_status` |
| Bookkeeping | `league_id`, `snapshot_id`, `received_at` |

Values that aren't whole numbers or true/false are stored as blank, not guessed. `draftRound`, `draftPick` and `rookieYear` are left out because they're unreliable (see `V5_FIELD_MAPPING.md`).

### `team_history`: one row per team per standings payload

`team_name`, `division_name`, `conference_name`, `season` (calendarYear), `season_index`, `stage_index` (1 = regular season), `week` (weekIndex + 1), `wins` / `losses` / `ties`, `win_pct`, `rank`, `prev_rank`, `seed`, `playoff_status`, `streak_raw` (as sent) and `streak` (decoded: +N wins, −N losses), `team_ovr`, `pts_for`, `pts_against`, `net_pts`, `turnover_diff`, `cap_room` / `cap_spent` / `cap_available` (dollars).

## Views

| View | What it adds |
|---|---|
| `player_history_view` | The export's `season`, `stage_index` and `week`, plus the v4.4 reading: `v44_position` (LT/RT→OT, LG/RG/C→IOL, LEDG/REDG→EDGE, MIKE/WILL/SAM→LB, FS/SS→S; LS blank until v5.0), `cap_hit_m` ($M), `v44_years_left` (0 → blank) |
| `player_history_latest` | One row per player per league week: the newest export |
| `team_history_latest` | One row per team per league week: the newest export |

## Owner commands (Supabase dashboard → SQL editor)

| Task | Run |
|---|---|
| What history holds, one row per export | `select * from owner_import_history('<LEAGUE NAME>');` |
| Build history for stored exports (backfill / repair; safe to re-run) | `select * from owner_build_import_history('<LEAGUE NAME>');` |

- `owner_import_history` columns: `received`, `season`, `stage_index`, `week`, `roster_payloads`, `players`, `teams`, `failed`, `not_built`. A healthy current export shows 32 roster payloads, about 2,000 players, 32 teams, and `failed` and `not_built` both 0.
- `owner_build_import_history` columns: `payloads_built`, `payloads_failed`, `players`, `teams` (league totals), `skipped_trimmed` (payloads whose body was already trimmed, so they can't be built).
- Neither command changes league data, so neither is written to the audit log.

## Access

History tables and views: no browser access (RLS on, nothing granted to `anon` / `authenticated`). The service role can read them. The owner commands run only from the dashboard.

## Team IDs (added 2026-11-24)

Madden can give every team a new `teamId`. The week 8 export did, for all 32 teams (R23). So:

- `league_team_external_ids` records every Madden ID each league team has had. Each `leagueteams` payload is matched to the existing teams as it arrives: by a known ID, then abbreviation, then city + nickname.
- The newest team list moves `league_teams.external_team_id` to the current ID, so `owner_load_teams` updates teams instead of adding them.
- `player_history_view` and `team_history_latest` add `league_team_id` and `team_abbr`, which stay the same across ID changes. Use those, not `team_id`, to follow a team over time.
- `league_team_of(league_id, madden_team_id)` gives the league team for any ID a team has had.
- Migration: `20261125010000_team_id_changes.sql`. It records all stored team lists when applied. Tests: `tests/team-id-changes-db.test.py`.

## Launch checklist

1. Merge the PR.
2. PowerShell, in the repo folder: `git pull`, then `npx.cmd supabase db push --remote`. Confirm that only `20261124020000_import_history.sql` is listed.
3. Explorer: `select * from owner_build_import_history('<LEAGUE NAME>');`. This backfills the stored exports. `payloads_failed` should be 0.
4. Explorer: `select * from owner_import_history('<LEAGUE NAME>');`. Each recent export should show its rosters, players and 32 teams.
5. After the next real export, run step 4 again. The new export should already be filled in, with no backfill needed.
6. Once history has run cleanly for a couple of exports, retention can go back to 5:
   `update public.leagues set import_keep_full_snapshots = 5 where name_key = lower('<LEAGUE NAME>');`
