# V5_WEB_V4.0_SPEC: League activity and trade posture FYI

**Web Release v4.0 · Ruleset v4.4 (unchanged).** Decided 2026-11-27. This combines the Phase 4 finish (the commissioner's League activity panel) with the Phase 5 start (the trade posture FYI). Storing the posture shown with each submission is what makes this a major release.

## Trade posture FYI (members, League mode)

A **League context (FYI)** box below the trade shows both teams.

| Part | Rule (2026-11-27) |
|---|---|
| Record | From the league's **current export** (the commissioner's choice, else the newest). The member can edit W-L-T for either team, and the week |
| Label | Win % (ties count half a win): **Win-now** at .600+, **Rebuilding** at .400 or below, else **Bubble**. 0-0 is Bubble |
| Record strength | Grows with the distance from .500; full at .250 away (e.g. 6-2 or 2-6) |
| Timing weight | Regular season: 0 in weeks 1–3, then a squared ramp to full at week 9. Preseason: fades from full to 0 by week 3. Other stages: full |
| Shown strength | record × weight: *too early*, *slight* (under .15), *moderate* (under .5), *strong* |
| Warnings (human teams, label not Bubble, strength ≥ .15) | **Selling while winning:** a Win-now team gives more player value than it receives, and receives picks. **Buying while rebuilding:** a Rebuilding team receives veterans (29+) as at least half of what it gets, and gives picks or players 25 and under |

- **Information only:** it never changes a value or the verdict.
- **Saved:** each League submission sends what was shown as `posture` (version, as-of season/stage/week, both teams' records, labels, strength, weight, whether edited, and the warning codes). It's stored in `trades.posture` and shown in Trade History. Corrections keep the posture from submission.
- **Review queue:** a trade with a warning is flagged **Posture warning (team)**.

These thresholds are FYI choices, not Ruleset values. Ruleset v5.0 sets the real effect sizes in Phase 6 calibration, using the stored postures as evidence.

## League activity (commissioner)

A collapsible **League activity** panel, for example *"2 to check"*:

- **Needs a look:**
  - Unlogged moves between consecutive exports that involve a human team (`check_this`), from the newest 4 exports.
  - Each has an optional note and **Mark handled** (audited `ROSTER_MOVE_HANDLED`).
- **Trades to check:**
  - Traded players that couldn't be linked to a Madden player, and linked players not seen on the new team in a later export.
  - **Choose player** lists both teams' rosters at the trade's export; **Link** saves it (audited `TRADE_PLAYER_LINKED`).
- **Handled:** marked moves with who marked them and the note, with **Undo**.
- **Other moves** (collapsed): logged trades, CPU trades, signings, releases, practice-squad moves.

## Backend

- **Migration `20261127050000_web_v4_activity_and_posture.sql`:**
  - `trades.posture`, `roster_move_reviews`.
  - `submit_league_trade(..., p_posture)`. The posture must be an object of at most 4000 characters.
  - `league_trade_history` adds `posture`; `league_posture_inputs` is readable by the browser.
  - `commissioner_roster_moves`, `commissioner_mark_move_handled`, `commissioner_ledger_issues`, `commissioner_player_candidates`, `commissioner_link_trade_player`.
  - Two new audit actions.
- **Edge Functions:**
  - `accept-trade` validates `posture` and passes it on.
  - New `commissioner-activity` (LIST, MARK_HANDLED, CANDIDATES, LINK_PLAYER).
- **Snapshot contract:** `web_release` v4.0. The frozen trade is unchanged; the submission adds `posture`. v3.1 stays accepted for open pages until the cleanup.
