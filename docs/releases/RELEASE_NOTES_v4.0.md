# Madden League Trade Calculator — Web Release v4.0

**Ruleset:** v4.4 (unchanged)
**Release theme:** League activity and trade posture FYI
**Ruleset impact:** None. Every value and verdict is calculated exactly as in v3.1.

## What's new

### League context (FYI)
In League mode, a box below the trade shows each team's situation:
- **Labels:** Win-now (.600+), Bubble, or Rebuilding (.400 or worse), with how strong it is.
- **Timing:** it counts for nothing in weeks 1–3 and grows to full strength by week 9.
- **Records:** they come from the league's current export. Correct the record or the week if the export is behind.
- **Warnings:** a human team selling players for picks while winning, or buying veterans while rebuilding, gets a warning, and the commissioner's queue flags it.
- **Information only:** it never changes a value or the verdict. It's saved with the trade and shown in Trade History.

### Commissioner: League activity
- **Needs a look:** players who changed teams between exports with no submitted trade, involving a human team. Mark each one handled, with a note.
- **Trades to check:** traded players that couldn't be matched to a Madden player (choose the right one), or that never showed up on the new team.
- Logged trades, CPU trades, signings, releases and practice-squad moves are listed under **Other moves**.

## Backend

- **Migration `20261127050000_web_v4_activity_and_posture.sql`:** the posture on trades, handled marks, and the activity and posture functions.
- **New Edge Function:** `commissioner-activity`.
- **`accept-trade`:** stores the posture. At launch it also accepted v3.1 for pages left open; a same-day maintenance update removed it, so a page left open from before the update says "Unsupported Web Release version" and the member reloads.

## Snapshot contract

`web_release: "v4.0"`. The frozen trade is unchanged; the League submission adds `posture`.

## Launch

See `docs/roadmap/v5/V5_WEB_V4.0_RUNBOOK.md`.

## Maintenance (2026-11-27)

- **Picks a team doesn't own:** when the giving team owns no pick in the chosen round and year, the "Whose pick" box now says **"None: KC doesn't own a 2029 2nd pick"**, and the message below the trade says the same, with a pointer to the commissioner's Draft picks panel. Before, the message said "Choose whose pick", which read as if a pick still had to be chosen. Display only; `web_release` stays v4.0 and cache tags move to `?v=4.0.1`.
