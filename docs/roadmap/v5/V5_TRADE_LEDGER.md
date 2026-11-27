# V5_TRADE_LEDGER

Phase 4 groundwork, **backend only**. No Web Release and no site change. Ruleset v4.4, `valuation.js`, the snapshot contract and stored trades are unchanged. Decided 2026-11-24.

- Migration: `supabase/migrations/20261124030000_trade_ledger.sql`
- Tests: `tests/trade-ledger-db.test.py` (53 / 53)
- Builds on import history ([`V5_IMPORT_HISTORY.md`](V5_IMPORT_HISTORY.md)).

## What it gives v5.0

One consistent record of league trades, ready for calibration (Phase 6):

- **Direction:** every asset moves **from** one team **to** the other. S-assets are the ones the submitting team receives ("user team receives"); O-assets are the ones the other team receives.
- **League time:** the season, stage and week of the newest export received before the trade.
- **Player links:** each traded player is linked to Madden's `rosterId`, so v5.0 can follow how he develops after the trade (import history).
- **Checks:** duplicate submissions, whether each trade actually happened in Madden, and players who changed teams with no logged trade.

## Rules (decided 2026-11-24)

- **Which trades:** every league trade except reversed ones. Unreviewed trades are included and carry their review status, so calibration can filter to Reviewed only. Pre-league trades are included when both teams are known.
- **The current revision is used,** so a commissioner correction replaces the submission.
- **Name matching** runs against the giving team's roster in the trade's export. If nothing is found there, it tries the receiving team's roster, for a trade already made in Madden.

| Status | Meaning |
|---|---|
| `EXACT` | Full name matches. Case, punctuation and Jr./Sr./II/III are ignored, and position breaks a tie |
| `CLOSE` | One player fits: last name only, first initial + last name, a typo of up to 2 letters, or (no name typed) the same position + OVR (+ age) |
| `MANUAL` | Linked by the site owner |
| `AMBIGUOUS` | Several players fit, so it's left unlinked |
| `UNMATCHED` | Nobody fits |
| `NO_DATA` | The trade is older than every export |

Draft picks are listed but not linked (pick ownership is deferred, Q33).

## Checks

- **`possible_duplicate_of`:** an earlier trade with the same two teams and the same assets moving the same way, within 7 days. It's flagged on the later trade.
- **`seen_in_game`:** `YES` once an export shows the player on the receiving team. `NO` when a later export exists but he isn't there. `PENDING` until a later export arrives. Blank for picks and unlinked players.
- **Roster moves:** players whose team changed between two consecutive exports.
  - `LOGGED`: a linked league trade moved him between those two teams, submitted from 30 days before the earlier export to 7 days after the later one.
  - `NOT LOGGED`: no trade explains the move. That can mean a trade made in Madden but never logged, a release followed by a signing, or a logged trade whose player isn't linked yet.
  - Moves to or from free agency aren't shown, because free agents aren't in history.
  - `from_control` / `to_control` show whether each team is `USER` or `CPU`, using its current setting. **`check_this`** is true for a NOT LOGGED move involving a human team: probably a trade that should have gone through the calculator. Those sort first in each export. A NOT LOGGED move between two CPU teams is usually Madden's own CPU trade and needs nothing (added 2026-11-27, `20261127010000_roster_moves_control.sql`).

## Owner commands (Supabase dashboard → SQL editor)

| Task | Run |
|---|---|
| The league's ledger, newest trade first | `select * from owner_trade_ledger('<LEAGUE NAME>');` |
| Players who changed teams between exports | `select * from owner_roster_moves('<LEAGUE NAME>');` |
| Link a player by hand | `select * from owner_link_trade_player('<LEAGUE NAME>', <trade #>, '<asset>', <roster ID>);` |
| Return a player to automatic matching | `select * from owner_link_trade_player('<LEAGUE NAME>', <trade #>, '<asset>', null);` |

- **Asset references:** `<asset>` is the ledger's `asset_ref`. `S1` is the first asset the submitting team receives; `O2` is the second asset the other team receives.
- **Finding a roster ID:** run `select roster_id, first_name, last_name, position, ovr, team_id from player_history_latest where last_name ilike '%smith%';`.
- **Links refresh automatically:** each command rebuilds the automatic links first, so no separate refresh step is needed.
- **A correction resets owner links:** a commissioner correction creates a new revision, which starts that trade's matching over, including owner links.
- **No audit entries:** none of these commands change trades or teams, so they aren't written to the audit log.

## Objects

| Object | Kind | Notes |
|---|---|---|
| `trade_ledger` | View | One row per asset of each included trade's current revision, with all the columns above |
| `trade_ledger_links` | Table | Player links, one per trade asset and revision. `set_by` is `auto` or `site owner` |
| `roster_moves` | View | Team changes between consecutive exports, with `status` and `logged_trade_number` |
| `ledger_refresh(league_id)` | Function | Rebuilds the automatic links (service role) |

There's no browser access. The service role can read; the owner commands run only from the dashboard.

## Team ID changes

Teams are compared as league teams, not raw Madden IDs, so a new set of team IDs (R23) doesn't show as roster moves and doesn't break player links. See `V5_IMPORT_HISTORY.md`, Team IDs.

## Launch checklist

1. Merge the PR.
2. PowerShell, in the repo folder: `git pull`, then `npx.cmd supabase db push --remote`. Confirm that only `20261124030000_trade_ledger.sql` is listed.
3. Explorer: `select * from owner_trade_ledger('<LEAGUE NAME>');`. Check the statuses and send Claude a screenshot.
4. Explorer: `select * from owner_roster_moves('<LEAGUE NAME>');`. Every `NOT LOGGED` row is worth a look: it may be a trade nobody submitted.

## Later (not now)

- A commissioner Ledger panel (a Web Release).
- Linking draft picks once pick ownership exists (post-v5.0).
- Moves to and from free agency.
