# Madden League Trade Calculator — Web Release v2.1

**Ruleset:** v4.4 (unchanged)
**Release theme:** Commissioner team editing
**Ruleset impact:** None. Every value and verdict is calculated exactly as in v2.0.

## What's new

### Teams in the Commissioner tab (Q26)
- A new **Teams** section lists the league's teams. Each team has:
  - **Control:** Human or CPU
  - **Owner label:** up to 60 characters, visible only in the Commissioner area
  - **Save**
- **Saving:**
  - It needs the commissioner's name and is written to the audit log as **Team updated**, with the before and after control. Saving with no change says so and logs nothing.
  - The **Your team / Other team** pickers update right away, and the human-to-human flag in the review queue follows the new setting.
- Owner labels stay out of the public team list.
- **Note for the site owner:** `owner_load_teams` re-reads teams from Snallabot and overwrites these settings. Use it only when Snallabot's team list should win (`V5_OWNER_TOOLKIT.md`).

### Audit log
- Clearer labels for site-owner and team events: Team updated, Commissioner password set, League renamed, League status changed, Import secret changed.
- Team events show what changed, for example "NYG: CPU → Human, owner label changed".

## Backend

- **Migration `20261124010000_commissioner_team_editing.sql`:** `commissioner_league_teams` and `commissioner_update_team`, service role only.
- **New Edge Function `commissioner-teams`:** LIST and UPDATE. It needs a commissioner session, and always uses the token's league.
- **`accept-trade`:**
  - Accepts **v2.1 / v4.4** and **v2.0 / v4.4** (pages still open from v2.0).
  - **v1.5.0 / v4.4 is no longer accepted.** This is the v2.0 launch runbook's step 8, folded into this release. The plain-insert path for trades without a league is removed.
- **`review-trade`:** corrections accept v2.0 and v2.1 snapshots.

## Snapshot contract

Same shape as v2.0, with `web_release: "v2.1"`.

| Pair | Accepted |
|---|---|
| `v2.1` / `v4.4` | Yes |
| `v2.0` / `v4.4` | Yes (same shape; pages still open from v2.0) |
| `v1.5.0` / `v4.4`, `v1.4.0` / `v4.2` | No |

## Unchanged

- `valuation.js`, which is byte-identical to `ruleset-v4.4-baseline`.
- Every verdict and value, practice and league submission, Trade History, and review, correction and reversal.

## Launch (about 10 minutes)

1. **PowerShell** on `release/web-v2.1`: run `npx.cmd supabase db push --remote`. Confirm only if `20261124010000_commissioner_team_editing.sql` is the only migration listed.
2. **PowerShell:** deploy `accept-trade`, `review-trade` and `commissioner-teams`, each with `npx.cmd supabase functions deploy <name> --no-verify-jwt`.
3. **GitHub:** merge the release PR.
4. **Live check:**
   - The header says v2.1.
   - Submit a test trade; it should be logged.
   - Commissioner → Teams: change a team and save. The pickers should update, and the audit log should show "Team updated". Change it back.
   - Reverse the test trade.

## Validation

See `docs/validation/VALIDATION_v2.1.md`.
