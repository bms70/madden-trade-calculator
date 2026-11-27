# Madden League Trade Calculator — Web Release v3.1

**Ruleset:** v4.4 (unchanged)
**Release theme:** Simpler draft-pick entry
**Ruleset impact:** None. Every value and verdict is calculated exactly as in v3.0.

## What's new

### Draft picks are entered the way Madden shows them
A Draft Pick now asks, in order:
1. **Timing:** Current draft, Next year or Two years away.
2. **Round:** 1–7.
3. **Current draft:** the **Pick number** (1–32), the actual pick.
   - 1st round: valued at that exact slot, as before.
   - 2nd and 3rd round: count as Early (picks 1–10), Mid (11–21) or Late (22–32).
   - Rounds 4–7: one value per round.
4. **Next year or Two years away:** where the pick is **Projected**: Early, Mid or Late (the 1st round also has Unknown). Rounds 4–7 need only the round.

This replaces the long Pick list (1.01–1.32, Early/Mid/Late 2nd, Future 1sts ...) and its separate Timing rules.

- A current pick is shown as **Pick 2.14**, both in the calculator and in Trade History.
- **Whose pick** (League mode) works as in v3.0.

## Backend

- **`accept-trade` / `review-trade`:** accept **v3.1 / v4.4**, along with v3.0, v2.1 and v2.0 for pages left open.
- **No database change.** The pick number is kept in the stored trade snapshot.

## Snapshot contract

`web_release: "v3.1"`. Every asset adds **`pick_number`**: the actual pick (1–32) for a current-draft pick, and `null` otherwise. The pick label stays the Ruleset v4.4 value key ("1.14", "Mid 2nd", "Future Early 1st", "5th").

## Launch

1. PowerShell, on the PR branch: `npx.cmd supabase functions deploy accept-trade --no-verify-jwt` and `npx.cmd supabase functions deploy review-trade --no-verify-jwt`.
2. Merge the PR, then hard-refresh. The header should say **Web Release v3.1**.
3. Live check: add a Draft Pick and step through Timing → Round → Pick number / Projected.
