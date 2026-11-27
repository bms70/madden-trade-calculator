# Madden League Trade Calculator — Web Release v3.0

**Ruleset:** v4.4 (unchanged)
**Release theme:** Draft-pick ownership and snapshot review
**Ruleset impact:** None. Every value and verdict is calculated exactly as in v2.1.

## What's new

### Draft picks that follow trades (League mode)
- Each league can track **who owns every pick**: all 7 rounds for the current draft and the next two. Every team starts owning its own.
- When you add a Draft Pick in League mode, choose **Whose pick** as well: the picks the giving team owns for that round and year, e.g. **2029 2nd · own** or **2029 2nd · via KC**. If only one fits, it's chosen for you.
- **Submit to league** waits until every pick is chosen, and the reason is shown next to the button.
- When a trade is submitted, its picks **move to the new teams automatically**. If the commissioner reverses it, they move back; a correction moves the old picks back and applies the new ones.
- Practice mode is unchanged.

### Commissioner: Draft picks
- See who owns each pick, by draft year and round. Picks that have moved are underlined.
- Move a pick by hand, for a trade made outside the calculator. Each move is audited as **Pick moved**.
- **Draft complete:** after the draft, the used picks are retired, next year becomes the current draft, and a new year is added. A hint appears when the newest export shows a new season.
- A reversal or correction is refused when one of its picks has been traded on since; undo the later trade first.

### Commissioner: Exports
- The newest Snallabot exports with season, week, rosters, players, free agents and health (Healthy, or what's wrong).
- **Mark current** records which export the league is on (audited).

## Backend

- **Migration `20261127040000_web_v3_picks_and_snapshots.sql`:**
  - Adds `draft_picks`, `pick_moves`, `trade_assets.pick_id`, and the league's current draft year and current export.
  - Pick checks and moves are added to `submit_league_trade` and `review_league_trade`.
  - Adds `league_pick_choices` (browser) and the commissioner and owner functions.
  - Adds audit actions `PICKS_SET_UP` and `DRAFT_COMPLETED`.
- **New Edge Functions:** `commissioner-picks` and `commissioner-snapshots`.
- **`accept-trade` / `review-trade`:**
  - Accept **v3.0 / v4.4**.
  - v2.1 and v2.0 are still accepted for pages left open. Once picks are tracked, their pick trades are refused with "reload the page". These pairs are removed a few days after launch.

## Snapshot contract

`web_release: "v3.0"`. Every asset adds **`pick_id`**: the chosen pick in League mode when the league tracks picks, and `null` otherwise. Everything else is unchanged.

## Launch

See `docs/roadmap/v5/V5_WEB_V3.0_RUNBOOK.md`. Deploy the database and functions **before** merging; turn on pick tracking **after** the site is live.
