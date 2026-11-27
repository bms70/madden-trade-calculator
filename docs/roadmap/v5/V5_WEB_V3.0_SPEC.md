# V5_WEB_V3.0_SPEC: draft-pick ownership and snapshot review

**Web Release v3.0 · Ruleset v4.4 (unchanged).** Decided 2026-11-27. This reverses the Q33 deferral of the pick screen. The player picker and pre-fill stay on hold.

## Decisions (2026-11-27)

| Topic | Decision |
|---|---|
| Which picks | All 7 rounds for the current draft and the next two (what v4.4 values). Every team starts owning its own |
| When picks move | When a trade is **submitted** (trades are logged right away). A **reversal** moves them back; a **correction** moves the old revision's picks back, then moves the new ones |
| Which pick | In League mode each Draft Pick gets **Whose pick**: the giving team's picks of that round and year, e.g. "2029 2nd · own" or "2029 2nd · via KC". One fit is chosen automatically |
| Visibility | The full pick table is in the **commissioner** area only. Members see just the giving team's picks in the trade form |
| Draft rollover | The commissioner selects **Draft complete**. A hint appears when the export shows a new season; `draft_rollover_due()` is the hook for an automatic rollover later |
| Earlier trades | The owner command `owner_replay_pick_trades` updates ownership from trades logged before tracking started |
| Snapshot review | The commissioner sees the newest exports with their health and marks one **current**. Nothing in valuation reads it yet |

## Member flow (League mode)

1. Enter the league and choose both teams. If the league tracks picks (`current_draft_year` set), the two teams' picks are loaded.
2. Add a Draft Pick and choose the pick label and timing as today. The **round** comes from the label (1.xx and Future 1sts are round 1) and the **year** from the timing (current draft + 0, 1 or 2).
3. **Whose pick** lists the giving team's matching picks:
   - **One fit:** it's chosen automatically, unless another asset in the trade already has it.
   - **Several fits:** the member chooses one.
   - **None:** the field says "OMH has no 2029 2nd pick".
4. **Submit to league** stays disabled until every pick is chosen, with the reason shown next to the button.
5. After a submit, the choices reload, because the picks have moved.

Practice mode and leagues without pick tracking are unchanged (`pick_id` is null).

## Snapshot contract

`web_release: "v3.0"`, Ruleset v4.4. The only change is one new field on every asset: **`pick_id`**. It's the chosen pick (uuid) for a Draft Pick in a league that tracks picks, and `null` otherwise. Every other field is byte-for-byte the v2.1 snapshot (tested against all 32 parity scenarios).

| Pair | Accepted |
|---|---|
| `v3.0` / `v4.4` | Yes |
| `v2.1` / `v4.4`, `v2.0` / `v4.4` | Yes, for pages still open. Once a league tracks picks, the database refuses their Draft Pick trades with "reload the page". **To remove** a few days after launch |

## Database (`20261127040000_web_v3_picks_and_snapshots.sql`)

- **Tables:**
  - `draft_picks`: league, draft year, round, original team, owner, ACTIVE / USED.
  - `pick_moves`: every move, with the reason (TRADE, TRADE_REVERSED, TRADE_CORRECTED, COMMISSIONER, SITE_OWNER, REPLAY), the trade and revision, who made it, and when it was undone.
  - `trade_assets.pick_id`.
  - `leagues`: `current_draft_year` (null = not tracked) and `current_snapshot_id`, with who marked it and when.
- **Trades:**
  - `submit_league_trade` validates and moves the picks in the same transaction. A refused pick leaves no trade behind.
  - Checks: a pick must be chosen, must be in this league, must not be used, must be owned by the giving team, its round and year must match the label and timing, and it can't appear twice.
  - `review_league_trade` handles CORRECT and REVERSE as above. It refuses with "has moved again since this trade (trade #N). Undo that first." when a pick has moved on.
- **Members:**
  - `league_lookup` adds `current_draft_year`.
  - `league_pick_choices(name, team A, team B, trade?)`, readable by the browser. With a trade (a correction), the picks it moved are listed with the team that gave them.
- **Commissioner** (service role, through Edge Functions, audited):
  - `commissioner_draft_picks`, `commissioner_set_pick_owner` (PICK_OWNERSHIP_CHANGED), `commissioner_draft_complete` (DRAFT_COMPLETED; guarded by the expected year).
  - `commissioner_snapshots`, `commissioner_mark_snapshot_current` (SNAPSHOT_MARKED_CURRENT; an export still arriving is refused).
- **Owner** (dashboard): `owner_setup_draft_picks(name, current_draft_year)` (PICKS_SET_UP), `owner_draft_picks`, `owner_set_pick_owner`, `owner_replay_pick_trades`.

## Edge Functions

- **New:** `commissioner-picks` (LIST, SET_OWNER, DRAFT_COMPLETE) and `commissioner-snapshots` (LIST, MARK_CURRENT). Both need a commissioner session and always use the token's league (`V5_WEB_V2.0_FUNCTIONS.md`).
- **Changed:** `accept-trade` and `review-trade` accept the v3.0 pair (`trade-validation.ts`).

## Commissioner area

- **Draft picks** (collapsible):
  - The summary shows "current draft 2028 · N picks moved".
  - A rollover hint, Draft and Round filters, and one line per pick ("DAL owned by [team]") that saves on change. Moved picks are underlined.
  - **Draft complete** asks to confirm once more.
- **Exports** (collapsible): the newest 10 exports. Each shows season and week, received time, rosters, players, free agents and health (Healthy, or the issues). The current one is marked, and the others have **Mark current**.
- **Corrections** keep each pick's choice, and the trade's own picks are offered again.

## Not in v3.0

The player picker and pre-fill, trade history showing which team a pick came from, automatic rollover, and member-visible pick tables.
