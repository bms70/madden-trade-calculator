# V5_OPEN_QUESTIONS

Running log of v5.0 planning questions. Questions the commissioner skipped get a stated assumption under "Assumed" until they're confirmed. Answered questions keep their answer and date.

Last updated: 2026-11-21.

## Open

| # | Question | Blocks | Doc |
|---|---|---|---|
| 19 | Offseason fade shape. Posture is at full strength after the season and fades to zero by preseason week 3. Should it fade stage by stage (re-signing → free agency → draft → preseason weeks 1–3), and along which curve: the squared in-season ramp in reverse, or a straight line? | Phase 7 posture spec | V5_PHASE_PLAN |
| 20 | Posture effect sizes. The human-team placeholder is a very small protective effect, and the CPU-team effect is larger. Final values get set in Phase 6–7 calibration. Any starting preference? | Phase 7 | V5_PHASE_PLAN |

## Assumed (confirm or change)

| # | Question | Assumption |
|---|---|---|
| 8 | Trades per season | **10–30**, until known |
| 13 | Can CPU posture lower demands? | **No, raise only**, never below v4.4 |
| — | Long snapper value in v5.0 | **0.50** (same as K/P) |
| — | Posture strength scales with the record? | **Yes.** A lopsided record counts fully, a middling one barely |
| 22 | How do pre-league trades look after the v2.0 migration? | Active trades become **Reviewed**, v1.4.0 Admin-deleted trades **Reversed**, all marked pre-league (sample schema) |
| 23 | Offseason stages for the league calendar | **Re-signing, Free agency, Draft**, then preseason weeks 1–3; check against an offseason export |
| 24 | Standings `stageIndex` values | **0 = preseason, 1 = regular season** (1 confirmed); offseason values from an offseason export |
| 29 | Snallabot connection: store raw exports only, or also normalize rosters now? | **Raw only** plus a health check per export; normalize in Web v3.0 from the stored bodies |

## Answered

| Question | Answer |
|---|---|
| Madden version / platform | Madden 27, cross-play |
| Third-party league site? | None before this work; NeonSportz ruled out |
| Has the Companion Rosters export failed for the league? | Yes |
| One league or several? | One now, possibly several later. Build for either |
| Keep the practice calculator? | Yes |
| Do trades involve CPU teams? | Usually |
| Is manual entry acceptable? | Yes, with a commissioner audit. Imports are still wanted for convenience |
| Does any relay option require recreating the Madden franchise? | No |
| Does the league use Discord? | Yes |
| Does Snallabot work for Madden 27? | Yes (solo-league test): export URLs with auto update, no CSV |
| What URL path do Snallabot exports use? | `/<secret>/<platform>/<leagueId>/<route>`. The test league showed platform `pc`. No auth header |
| Must calculator fields stay editable with imports? | Yes. Imports only pre-fill, and edits are marked for the audit |
| Does trade posture apply to human teams too? | Yes: a warning plus a very small protective effect. CPU teams get the firmer rule |
| Information first, or a v5.0 rule? | FYI only until Ruleset v5.0, which is the full implementation |
| Do trades after the in-season deadline matter? | Not really |
| **Adopt Snallabot?** | **Yes.** It sends to our Supabase receiver, with Companion as a backup |
| **Offseason posture?** | Last season's record at full strength after the season, **fading to zero by preseason week 3** |
| **Member sign-in?** | **None.** Access is by league name: type the league name and trades are stored in that league |
| League name or name plus a code? | **Plain league name**, accepting that it can be guessed; the audit gate protects history |
| **Unfair verdicts?** | **Allow submission and flag them** for the commissioner |
| **Ramp shape?** | **Squared curve** from week 4 to full effect at week 9 |
| **Long snappers?** | **Give LS a position value in Ruleset v5.0**; hidden from pickers until then |
| **Interim web numbering?** | **Major (v2.0 / v3.0 / v4.0)** = database, snapshot-contract or new-mode change. **Minor (vX.1…)** = features on the existing structure. Fixes = maintenance. The finish line is Web v5.0 + Ruleset v5.0 |
| **Admin password?** | **A commissioner password per league**, replacing the shared Admin password when league mode ships (Web v2.0) |
| **Audit timing?** | **Log now, review after.** Trades are logged immediately as Unreviewed; the commissioner marks them Reviewed, corrects them, or reverses them |
| **Who approves human-to-human trades?** | **The commissioner alone** |
| **Who can create leagues?** | **Only the site owner**, who also sets each commissioner password |
| **v5 branching model?** | **Approved** (2026-11-21): `v5/phase-*`, `release/web-v*`, `feature/*`, `fix/*`, `v5/ruleset-v5.0`; the v5 candidate is its own engine file |
| **Baseline tag?** | **Yes:** `ruleset-v4.4-baseline` on `a0703dd` |
| **Source of the week and stage?** (Q18) | **Manual field, pre-filled from standings:** `calendarYear`, `stageIndex`, current week = `weekIndex + 1` (capture, 2026-11-21) |
| **Do free agents matter?** | **No.** Free agents can't be traded; they're out of v5 scope. The receiver keeps the raw body but doesn't map it (2026-11-21) |
| **Main-league capture?** | Done 2026-11-21: platform `pc`, league `5481323`, all routes confirmed, 40 requests for a current-week export |
| **Should practice mode stop logging trades?** (Q25) | **Yes** (2026-11-21). Only league trades are logged from Web v2.0; existing history moves into the main league as pre-league |
| **Team editing on screen?** (Q26) | **Web v2.1**; SQL fixes until then (2026-11-21) |
| **Commissioner login throttling?** (Q27) | **Yes:** refused for 15 minutes after 5 wrong passwords per league (2026-11-21) |
| **Main league name and password?** (Q28) | **Name decided** (2026-11-21). It's kept out of this public repo, because knowing the name is what gives access. It's recorded in the site owner's private project notes. **The site owner sets the commissioner password** at release step 2 |
| **Do the Snallabot connection before league mode?** | **Yes** (2026-11-21): a backend-only receiver first (`V5_SNALLABOT_CONNECTION.md`), then back to Phase 2 |
| **Snallabot connection live?** | **Yes** (2026-11-22): first main-league export complete, 44 requests, 7.06 MB, all 32 rosters, 2027 week 5. R21 resolved |
| **Retention and auto update?** (Q30) | **Keep full bodies for the newest 5 snapshots** (decided 2026-11-22; a per-league setting, `import_keep_full_snapshots`, changeable without a migration). Snallabot auto update turned on 2026-11-22; its frequency is still unknown and will be read from the snapshot rows. Revisit (for example, also keep one snapshot per week in full) only if exports turn out to be very frequent |
