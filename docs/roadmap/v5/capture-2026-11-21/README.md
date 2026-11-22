# Main-league capture, 2026-11-21

One Snallabot current-week export from the main league (league `5481323`, platform label `pc`), sent to a temporary webhook.site URL that was deleted afterwards. Week 4 was exported while the league was in week 5. Findings are in [`../V5_FIELD_MAPPING.md`](../V5_FIELD_MAPPING.md).

| File | Contents |
|---|---|
| `request-paths.txt` | All 40 request paths, in arrival order, with the receiver and secret replaced by `<receiver>/<secret>` |
| `leagueteams.json` | Full `leagueTeamInfoList` (32 teams). Gamertags replaced with `<human-1>` … `<human-6>` |
| `standings.json` | Full `teamStandingInfoList` (32 teams) |
| `week-reg-4-schedules.json` | Full week 4 `gameScheduleInfoList` (16 games) |
| `team-roster-excerpt.json` | 8 of 65 players from one team roster (Seattle), one per mapping case: QB, LT, LEDG, MIKE, REDG, a rookie, a practice-squad player and an LS. All 133 fields kept |

Not captured: the free-agent roster (out of scope) and the seven weekly stats bodies other than schedules (not used by v4.4). Three team rosters (Tennessee, Houston, Minnesota) didn't arrive in this export.

These samples are test fixtures for the Web v3.0 importer. Don't add gamertags, the receiver URL or the secret to this folder.
