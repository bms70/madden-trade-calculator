# V5_OPEN_QUESTIONS

Running log of v5.0 planning questions. Questions the commissioner skipped get a stated assumption under "Assumed" until they're confirmed. Answered questions keep their answer and date.

Last updated: 2026-11-21.

## Open

| # | Question | Blocks | Doc |
|---|---|---|---|
| 19 | Offseason fade shape. Posture is at full strength after the season and fades to zero by preseason week 3. Should it fade stage by stage (re-signing → free agency → draft → preseason weeks 1–3), and along which curve: the squared in-season ramp in reverse, or a straight line? | Phase 7 posture spec | V5_PHASE_PLAN |
| 20 | Posture effect sizes. The human-team placeholder is a very small protective effect, and the CPU-team effect is larger. Final values get set in Phase 6–7 calibration. Any starting preference? | Phase 7 | V5_PHASE_PLAN |
| 21 | Approve the v5 branching model in `V5_PROJECT_CHARTER.md` (`v5/phase-*`, `release/web-v*`, `feature/*`, `fix/*`, `v5/ruleset-v5.0`; candidate engine in its own file), and should a `ruleset-v4.4-baseline` tag be created on `a0703dd`? | Phase 2 build start | V5_PROJECT_CHARTER |

## Assumed (confirm or change)

| # | Question | Assumption |
|---|---|---|
| 8 | Trades per season | **10–30**, until known |
| 13 | Can CPU posture lower demands? | **No, raise only**, never below v4.4 |
| 18 | Source of the offseason stage | A **manual field, pre-filled from the import** when the export carries it |
| — | Long snapper value in v5.0 | **0.50** (same as K/P) |
| — | Posture strength scales with the record? | **Yes.** A lopsided record counts fully, a middling one barely |

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
