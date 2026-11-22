# V5_FIELD_MAPPING

Ruleset v5.0 roadmap, Phase 1. Drafted 2026-11-21 from real Madden 27 exports that the commissioner captured through Snallabot from a solo league, using webhook.site:

- `leagueTeamInfoList` (all 32 teams)
- `rosterInfoList` (one team: LAR, `teamId` 776994843, 63 players including 11 on the practice squad; 133 fields per player)
- `teamStandingInfoList` (seen in a screenshot only; partial)

Every response carries `"success": true` and an empty `message`. The format matches the Companion App protocol.

## Request shape (seen on webhook.site)

- Method `POST`, `content-type: application/json`, `user-agent: node`. Requests come from Snallabot's servers with **no authentication header**, so the receiver URL must contain an unguessable secret.
- Example path: `https://<receiver>/<secret>/pc/<leagueId>/standings`
  - **Platform segment = `pc`** for the test league. Treat it as an opaque label, not a statement about the console. How Snallabot labels a cross-play league may depend on the EA account and console it was linked with, so the main league could show something different. Key everything on the **league ID**.
  - **League ID** is numeric.
  - The other routes are expected to follow the Companion pattern (`/leagueteams`, `/team/{teamId}/roster`, `/freeagents/roster`, `/week/{reg|pre}/{week}/{type}`). Only `/standings` has been seen directly.
- One export arrives as **a burst of many requests**: 30-plus roster posts of about 150–180 kB each within roughly a minute, followed by smaller league posts (8–28 kB). The receiver should group each burst into one import snapshot.

## Teams (`leagueTeamInfoList`)

| Field | Example | Use |
|---|---|---|
| `teamId` | 776994843 | Stable team key (`team_id`) |
| `abbrName` | LAR | Abbreviation |
| `cityName` / `nickName` / `displayName` | Los Angeles / Rams / Rams | Display |
| `divName` | NFC West | Display, grouping |
| `userName` | "" or a gamertag | **Empty = CPU team; filled = human team** |
| `ovrRating`, `offScheme`, `defScheme`, `injuryCount`, `logoId`, colors | | Descriptive only |

## Standings (`teamStandingInfoList`, partial)

Fields seen so far include `calendarYear` (2026), conference and division IDs and names, win/loss/tie splits, `capRoom`, `capSpent` and `capAvailable` (raw dollars), and offense/defense yardage ranks. **`calendarYear` is a candidate source for a snapshot's season.** A full capture should confirm whether the payload also carries a week or stage. Standings also feed the trade-posture design (see `V5_PHASE_PLAN.md`).

## Players (`rosterInfoList`) → v4.4 inputs

| v4.4 input | Field | Transform | Notes |
|---|---|---|---|
| Position | `position` | Map (table below) | Madden uses side-specific labels |
| OVR | `playerBestOvr` | As is | Equal to `playerSchemeOvr` for all 63 players. `teamSchemeOvr` (fit in the team's scheme) differs and is **not** used |
| Age | `age` | As is | `birthYear/Month/Day` also present |
| Dev trait | `devTrait` | 0 Normal · 1 Star · 2 Superstar · 3 X-Factor | Sample counts: 45 / 12 / 2 / 4 |
| Cap hit | `capHit` | **÷ 100 = $M** (units of $10,000) | 2000 = $20.00M; a minimum deal of 80 = $0.80M. Check against the calculator's cap-hit units before Phase 2 |
| Years remaining | `contractYearsLeft` | 0 → blank (neutral) | 0 appears only on practice-squad players with no contract. v4.4 accepts only ≥ 1 or blank |
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
- `playerBestOvr` and `playerSchemeOvr` matched on this team. Watch whether they ever differ.

## Not used by v4.4 (kept in the raw snapshot)

These fields aren't read by any v4.4 rule but are kept in the raw snapshot as possible Phase 5 context: about 100 ratings, traits, grades, contract detail, bio fields, `legacyScore`, `experiencePoints`, `skillPoints`, `signatureSlotList` (abilities), and presentation/portrait IDs.

## Still unknown (settle on the main-league capture)

- The platform label for the main league.
- The exact paths of the roster, team and weekly routes.
- The free-agent payload.
- Whether any payload carries a week or offseason stage.
- The calculator's cap-hit units and role options (check `valuation.js` / `calculator-ui.js` before Phase 2).
