# V5_FIELD_MAPPING

Ruleset v5.0 roadmap, Phase 1. Drafted 2026-11-21 from real Madden 27 exports that the commissioner captured through Snallabot from a solo league, using webhook.site:

- `leagueTeamInfoList` (all 32 teams)
- `rosterInfoList` (one team: LAR, `teamId` 776994843, 63 players including 11 on the practice squad; 133 fields per player)
- `teamStandingInfoList` (seen in a screenshot only; partial)

Every response carries `"success": true` and an empty `message`. The format matches the Companion App protocol.

**Confirmed on the main league (capture, 2026-11-21).** One current-week export (week 4, while the league was in week 5) through a fresh webhook.site URL: 40 requests, with bodies for league teams, standings, the week 4 schedule and one full team roster. Anonymized samples (gamertags and the secret removed) are in [`capture-2026-11-21/`](capture-2026-11-21/).

## Request shape (seen on webhook.site)

- Method `POST`, `content-type: application/json`, `user-agent: node`. Requests come from Snallabot's servers with **no authentication header**, so the receiver URL must contain an unguessable secret.
- Path: `https://<receiver>/<secret>/<platform>/<leagueId>/<route>`
  - **Platform segment = `pc`** for both the solo league and the main (cross-play) league. Treat it as an opaque label, not a statement about the console. Key everything on the **league ID**.
  - **League ID** is numeric (main league: `5481323`).
- **Routes (all confirmed on the main league):**

| Route | Count per export | Body | Size |
|---|---|---|---|
| `team/{teamId}/roster` | one per team | `rosterInfoList` | about 185 kB |
| `freeagents/roster` | 1 | `rosterInfoList` (free agents) | not captured |
| `week/reg/{week}/passing`, `rushing`, `receiving`, `defense`, `kicking`, `punting`, `teamstats`, `schedules` | 8 for the exported week | stats lists; `gameScheduleInfoList` for schedules | schedules about 3 kB |
| `standings` | 1 | `teamStandingInfoList` | about 28 kB |
| `leagueteams` | 1 | `leagueTeamInfoList` | about 8 kB |

- **Order:** team rosters (with the free-agent roster in among them), then the eight weekly routes, then `standings`, then `leagueteams` last. A current-week export was **40 requests, about 6 MB**.
- **The week in a weekly path is the exported week, not the league's current week.** The capture exported week 4 while the league was in week 5. Use standings for the current week (below).
- **Missing rosters:** the capture got 29 of 32 team rosters. Tennessee, Houston and Minnesota, the three highest team IDs, sent none. The receiver must not assume a complete set: validation flags any team without a roster, and the commissioner can re-export. The next export shows whether it repeats.

## Teams (`leagueTeamInfoList`)

| Field | Example | Use |
|---|---|---|
| `teamId` | 776994843 | Team key **within a league only**: the main league and the solo league both use 776994843 for LAR. Store per league (`league_id`, `external_team_id`) |
| `abbrName` | LAR, AZ, OMH | Abbreviation. **Not the standard NFL list:** Arizona is `AZ`, and the main league has a relocated team (Omaha Bulls, `OMH`). Seed league teams from this payload, not from a fixed list |
| `cityName` / `nickName` / `displayName` | Los Angeles / Rams / Rams | Display |
| `divName` | NFC West | Display, grouping |
| `userName` | "" or a gamertag | **Empty = CPU team; filled = human team** (main league: 6 human teams) |
| `ovrRating`, `offScheme`, `defScheme`, `injuryCount`, `logoId`, colors | | Descriptive only |

## Standings (`teamStandingInfoList`)

One row per team (32). Confirmed fields:

| Field | Example | Use |
|---|---|---|
| `calendarYear` | 2027 | **Season** for the snapshot (A10) |
| `seasonIndex` | 1 | Franchise season count from 0 (1 = second season). Informational |
| `stageIndex` | 1 | **Stage:** 1 = regular season (confirmed). 0 = preseason assumed; offseason values to confirm on an offseason export |
| `weekIndex` | 4 | **Current week, counted from 0:** current week = `weekIndex + 1`. In the capture, 24 teams had 4 games and 8 had 5, so week 5 was in progress |
| `totalWins` / `totalLosses` / `totalTies` | 3 / 2 / 0 | Record for trade posture (Phase 5) |
| `winPct`, `rank`, `seed`, `playoffStatus` | | Context |
| `capRoom` / `capSpent` / `capAvailable` | 310240000 | **Raw dollars** (cap room is the league cap, $310.24M, same for every team) |
| `winLossStreak` | 255 | **Single-byte signed value:** 1–127 = win streak, 255 = 1-game losing streak, 252 = 4-game losing streak, 0 = none |
| Home / away / division / conference splits, yardage and points ranks | | Context only |

**The league calendar can be pre-filled from standings:** season from `calendarYear`, stage from `stageIndex`, current week from `weekIndex + 1`. It stays a manual field the commissioner can correct (A3, Q18).

## Schedules (`week/reg/{week}/schedules`)

`gameScheduleInfoList`, one row per game (16 in week 4, no byes): `homeTeamId`, `awayTeamId`, `homeScore`, `awayScore`, `seasonIndex`, `stageIndex`, `weekIndex`, `status`, `scheduleId`. Week 4 carries `weekIndex 3`, confirming weeks count from 0. `status` was 2 or 3 for finished games (meaning not confirmed). Not used by v4.4; possible Phase 5 context.

## Free agents (`freeagents/roster`)

**Out of scope (decided 2026-11-21).** Free agents can't be traded, so v5 doesn't map them. The receiver still accepts the request and keeps the raw body, so nothing fails and the data is there if a later feature wants it.

## Players (`rosterInfoList`) → v4.4 inputs

| v4.4 input | Field | Transform | Notes |
|---|---|---|---|
| Position | `position` | Map (table below) | Madden uses side-specific labels |
| OVR | `playerBestOvr` | As is | Equal to `playerSchemeOvr` for all 63 players. `teamSchemeOvr` (fit in the team's scheme) differs and is **not** used |
| Age | `age` | As is | `birthYear/Month/Day` also present |
| Dev trait | `devTrait` | 0 Normal · 1 Star · 2 Superstar · 3 X-Factor | Sample counts: 45 / 12 / 2 / 4 |
| Cap hit | `capHit` | **÷ 100 = $M** (units of $10,000) | 2000 = $20.00M; a minimum deal of 80 = $0.80M. **Confirmed:** the calculator's input is "Cap hit $M". Main-league sample max 2389 = $23.89M |
| Years remaining | `contractYearsLeft` | 0 → blank (neutral) | 0 appears only on practice-squad players (all 12 on the main-league sample, who also have a cap hit of 0). v4.4 accepts only ≥ 1 or blank |
| Years in league | `yearsPro` | As is (rookie = 0) | Use this, not `rookieYear` (see quirks) |
| Role | — | Not exported | Typed, or suggested from depth (Phase 3) |
| Team | `teamId` | As is | |
| Player key | `rosterId` | As is | Stable player ID (`player_id`) |
| Name | `firstName`, `lastName` | | |
| Status flags | `isFreeAgent`, `isOnPracticeSquad`, `isOnIR`, `isActive` | | Informational; can filter the selector |

### Position map

| Madden `position` | v4.4 position |
|---|---|
| QB | QB |
| HB | HB |
| FB | FB |
| WR | WR |
| TE | TE |
| LT, RT | OT |
| LG, RG, C | IOL |
| LEDG, REDG | EDGE |
| DT | DT |
| MIKE, WILL, SAM | LB |
| CB | CB |
| FS, SS | S |
| K | K |
| P | P |
| **LS** | **No v4.4 position.** Decided: LS gets a position value in Ruleset v5.0 (0.50 assumed). Until then LS is hidden from pickers but can still be entered by hand |

## Data quirks found

- **Draft info is garbled.** `draftRound` runs up to 64, with `draftPick` 0/13/22. Don't use these fields.
- **`rookieYear` is unreliable.** One player has `yearsPro` 10 but `rookieYear` 2026. `yearsPro` looks right.
- **Mixed money units.** `capHit` and `capReleasePenalty` look like units of $10,000. `contractSalary`, `contractBonus`, `capReleaseNetSavings` and the standings cap fields are raw dollars (contract fields are totals).
- `playerBestOvr` and `playerSchemeOvr` matched on both sampled teams (63 + 65 players). Watch whether they ever differ.
- **`durabilityGrade` is 0 for every player** on the main-league sample. A Phase 7 durability factor would need `injuryRating` (75–96 on the sample) instead.
- **Standings streaks are single-byte values** (see Standings).
- **`teamId` can change.** On 2026-11-24 the week 8 export gave all 32 teams new IDs (same league ID). Never treat a raw `teamId` as permanent: map it to the league team (`league_team_of`, R23).

## Not used by v4.4 (kept in the raw snapshot)

These fields aren't read by any v4.4 rule but are kept in the raw snapshot as possible Phase 5 context: about 100 ratings, traits, grades, contract detail, bio fields, `legacyScore`, `experiencePoints`, `skillPoints`, `signatureSlotList` (abilities), and presentation/portrait IDs.

## Settled by the main-league capture (2026-11-21)

- **Platform label:** `pc`, the same as the solo league.
- **Route paths:** all confirmed (table above).
- **Free-agent payload:** not needed; out of scope.
- **Week and stage:** the current week and stage come from standings (`weekIndex + 1`, `stageIndex`); weekly paths carry the exported week.
- **Cap-hit units:** ÷ 100 gives the calculator's $M. **Roles:** the calculator uses Starter / Backup; the export has no role, so it stays typed (depth-based suggestion in Phase 3).

## Still open

- Whether Tennessee, Houston and Minnesota rosters go missing on every export, or only on this one.
- The `stageIndex` values for preseason and the offseason stages (needs an export taken then).
- What `status` 2 vs 3 means on schedules (not needed for v4.4).
