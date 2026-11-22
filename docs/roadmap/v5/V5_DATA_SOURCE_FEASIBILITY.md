# V5_DATA_SOURCE_FEASIBILITY

Ruleset v5.0 roadmap, Phase 1, first task. First drafted 2026-11-21 from public sources, then revised the same day with the commissioner's answers, a comparison of relay sites, and a solo-league Snallabot test. **Outcome: Snallabot adopted as the import source (2026-11-21).** Open questions are tracked in `V5_OPEN_QUESTIONS.md`. Field-level detail is in `V5_FIELD_MAPPING.md`.

## League facts (commissioner, 2026-11-21)

- **Madden NFL 27, cross-play league.**
- The league **uses Discord.**
- The league used **no third-party league site** before this work. **NeonSportz is ruled out.**
- The commissioner has the Companion App, and **its Rosters export has failed for this league**, matching public reports.
- **Manual entry with a commissioner audit is the primary path.** The finesse risk is quantity-for-quality, and v4.4 already blocks it.
- **Imports are wanted** because they make running the league much easier.

## Short answer

The Companion export works for League Info and weekly stats, but Rosters has been failing since mid-September 2026. Free agents, pick ownership and trades aren't exported at all. Manual entry at trade time, audited by the commissioner, works today, so Gate A passes. For imports, the league uses **Snallabot**. It's free, the league already has Discord, and the solo test confirmed it can send Madden 27 data to a receiver we control. The same receiver can take Companion App exports as a backup. No option requires recreating the Madden franchise.

## How the Companion export works

- **Push, not pull.** The commissioner opens the league in the Companion App, taps Export, enters a website URL, ticks categories (League Info, Rosters, weekly stats) and starts it. The app POSTs JSON to that URL. EA doesn't document any of this.
- **Route shape** (from an open-source receiver; **confirmed on the main league, 2026-11-21**, platform label `pc`):
  - `/{platform}/{leagueId}/leagueteams` → `leagueTeamInfoList`
  - `/{platform}/{leagueId}/standings` → `teamStandingInfoList`
  - `/{platform}/{leagueId}/team/{teamId}/roster` → `rosterInfoList` (one POST per team)
  - `/{platform}/{leagueId}/freeagents/roster` → `rosterInfoList`
  - `/{platform}/{leagueId}/week/{reg|pre}/{week}/{type}` → schedules, team stats, passing, rushing, receiving, kicking, punting, defense
- Players have a stable `rosterId` and teams a `teamId`. Every route includes `leagueId`, which suits a site hosting several leagues.
- A Supabase Edge Function can receive these POSTs. It needs an unguessable URL path, because senders don't authenticate their requests.

## Madden NFL 27 Companion status (as of Nov 2026)

| Category | Status |
|---|---|
| App availability | Live on iOS. Android rolled out in stages after the Aug 13, 2026 launch. |
| League Info (teams, standings) | Working |
| Weekly stats / schedules | Working |
| **Rosters** | **Failing since Sept 16, 2026**, including for this league. No EA response. |
| Free agents | Doesn't export |
| Draft-pick ownership | Not found in any documented export category |
| Trades / transactions | Not exported |

## Relay sites compared (2026-11-21)

All three pull data from EA using the commissioner's EA sign-in, mimicking the Companion App. That connection is **unofficial**: EA's approved community-site sign-in covers only three EA SPORTS FC sites, and EA can and does block these connections. NeonSportz's own docs describe a case where EA shut it out of Madden entirely.

| | Snallabot | MyMadden | DaddyLeagues |
|---|---|---|---|
| Cost | **Free**, open source | Paid league site; price not published | Subscription; price not published |
| How it gets data | Direct EA connection | "Sync" with a stored EA access token; also accepts Companion exports | "Real-time EA sync" (method not documented) |
| Madden 27 | **Confirmed** (solo-league test) | Not confirmed | Not confirmed |
| Rosters while Companion is broken | **Yes** | Probably, unconfirmed | Probably, unconfirmed |
| Free agents | Yes (out of v5 scope) | Unknown | Unknown |
| **Can it send data to us?** | **Yes: export URLs in the dashboard**, same format as the Companion App | Not documented | Not documented |
| Requirements | A Discord server (the league has one) | Web account | Web account |
| Recreate franchise? | No | No | No setup docs found |

## Solo-league Snallabot test (commissioner, 2026-11-21)

- Export URLs can be added in the dashboard, and **auto update** is offered. No CSV export.
- Historical league data and rosters appear to be available.
- Real payloads were captured with webhook.site and mapped in `V5_FIELD_MAPPING.md`.

## Main-league capture (commissioner, 2026-11-21)

- One current-week export (week 4) to a fresh webhook.site URL: 40 requests, about 6 MB, every expected route present.
- Platform label `pc`, league ID `5481323`. Standings carry the current week and stage.
- 29 of 32 team rosters arrived (Tennessee, Houston and Minnesota missing; risk R21).
- Anonymized samples: `capture-2026-11-21/`. Gate A confirmed.

What this means for the design:

- **Auto update means repeated deliveries.** Each delivery is a burst of many requests. The receiver groups each burst into one import snapshot and skips duplicates. Nothing becomes "current" until the commissioner reviews it.
- **Historical data helps later phases.** Comparing rosters snapshot to snapshot can reconstruct past player movement for the Phase 4 ledger and Phase 6 calibration. These diffs are evidence, not proof: a diff alone can't tell a trade from a release followed by a re-signing.

## Source plan (decided)

| Role | Source |
|---|---|
| **Primary** | Manual entry at trade time plus commissioner audit |
| Team list | Seed the 32 NFL teams, or take them from an import |
| **Import** | Snallabot export URL (manual or auto update) → our Supabase receiver |
| Import (backup) | Companion App export → same receiver |
| Import (manual) | CSV upload, if ever needed |

## Gate A (data viability): **pass**

Required fields come from manual entry, and the commissioner audit is the quality control. Imports add convenience and make audits faster.

## Sources

- EA Forums, Madden NFL 27 Franchise: "Madden Companion App: Rosters export fails every time ('server is too loaded')"; Madden 27 Technical Issues: "Roster Export Still Broken – No Response from EA"
- EA Forums, Madden NFL 26: "Add a way to export data like we had in the Companion App"; Madden NFL 25: "EA API Data Fixes"
- NeonSportz docs: Companion App Imports; EA Direct Connect; Teams & Players
- EA Help: Community API Update (approved EA SPORTS FC community sites)
- snallabot.me; github.com/snallabot/snallabot-docker; github.com/wguglielmo-28/hfl-nn (Snallabot custom export URL for Madden 27)
- mymadden.com (home, Getting Started, How the Sync Feature Works)
- daddyleagues.com
- timesaver.gg: Madden NFL 27 Companion App Not Working (Sept 22, 2026)
- github.com/birdwell/Madden-Companion-Exporter (`app.js` routes); nallapareddy.com "EA does not care about this"
