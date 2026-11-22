# Madden League Trade Calculator — Web Release v2.0

**Ruleset:** v4.4 (unchanged)
**Release theme:** League mode: per-league trade logging, commissioner review, practice mode
**Ruleset impact:** None. Every value and verdict is calculated exactly as in Web Release v1.5.0.

## Overview

Web Release v2.0 turns the calculator into a league tool.

- Members **enter their league by name**, choose both teams and **submit** agreed trades. Submitted trades are logged as **Unreviewed**.
- Each league's **commissioner** reviews, corrects or reverses trades behind the league's own password.
- **Practice mode** keeps the calculator for trying trades and no longer logs them.
- The shared Admin password is retired. Earlier trade history moves into the main league as **Pre-league**.

This is a major web release, because the database, the trade snapshot contract and the modes all change (see Versioning in the README).

## What's new

### Practice and League modes
- A **Practice / League** switch at the top of the page. Practice is the default.
- **League bar:**
  - Type the league name and select **Enter**. Case and spacing are ignored.
  - An unknown name shows "No league with that name."
  - The browser remembers the league, and **Leave league** clears it.
- **Your team / Other team** pickers, filled from the league's Snallabot export, with human teams marked.
- **Team names on screen:** the headings, score labels, verdict line and Trade Analysis show the chosen teams. Stored records keep the engine's User Team / CPU Team wording.

### Submitting trades
- **Submit to league** asks for your name (remembered) and an optional note.
- The form explains the trade is logged as Unreviewed, and warns when the verdict isn't FAIR. A trade that isn't FAIR can still be submitted and is flagged.
- The same trade between the same teams can't be submitted twice in a row.
- Practice mode has no submit button (Q25).

### Trade History
- Shows only the entered league's trades.
- **Badges:** Unreviewed, Reviewed, Corrected, Pre-league.
- Cards show the teams, the submitter and the Fairness score. The detail view shows the note and review status.
- Corrected trades offer **Show original submission**.
- Fixed: opening a trade now hides the list. In v1.5.0, the trade opened below the whole list.

### Commissioner (replaces Admin)
- **Sign-in:**
  - Uses the league's own password. The session lasts 30 minutes, is held in memory only, and works only for that league.
  - Sign-in is refused for 15 minutes after 5 wrong passwords.
- **Review queue:** oldest first, with flags for not FAIR, human to human, and possible duplicate.
- **All trades** and the **audit log**.
- **Actions:**
  - **Mark reviewed**, with an optional comment.
  - **Reverse**, which needs a reason.
  - **Correct:** loads the trade into the calculator. v4.4 re-runs as usual, and **Save correction** needs a reason. The original submission is kept.

### Site owner
- Leagues are managed with one-line SQL functions in the Supabase dashboard (`docs/roadmap/v5/V5_OWNER_TOOLKIT.md`): load teams from Snallabot, set or reset commissioner passwords (which also clears lockouts), create, rename or archive a league, rotate the import secret, and move pre-league history. There is no owner screen on the site (Q31).

## Data and backend

- **New tables:** `league_teams`, `trade_revisions` (every evaluation is frozen; revision 0 is the submission), `trade_assets`, `commissioner_login_attempts`.
- **New columns:** `trades` gains league, team, review, submitter and pre-league columns. `audit_events` gains league, actor role and details.
- **Functions:**
  - `accept-trade` logs league trades through `submit_league_trade`.
  - New: `commissioner-login`, `commissioner-session-check`, `review-trade`, `commissioner-audit-log`.
  - Retired: `admin-login`, `admin-session-check`, `delete-trade`, `admin-audit-log`, and the `ADMIN_PASSWORD` secret.
- **Access:** the public read policy on `trades` is removed. Trades can only be read through a league name (`league_trade_history`).
- **Pre-league history:** existing trades move into the main league as Pre-league. Active trades become Reviewed; trades deleted with the old Admin become Reversed, keeping their reason (Q22).

## Snapshot contract

The snapshot is the v1.5.0 snapshot with `web_release: "v2.0"`. A league submission adds `mode`, `league_name`, `submitting_team_id`, `other_team_id`, `submitter_name` and `submitter_note`, and those go into their own columns.

| Pair | Accepted |
|---|---|
| `v2.0` / `v4.4` | Yes (league fields required) |
| `v1.5.0` / `v4.4` | During the switchover only. Removed about a week after launch |
| `v1.4.0` / `v4.2` | No |

## Unchanged

- `valuation.js` (byte-identical to `ruleset-v4.4-baseline`)
- Every verdict, value, Fairness Score and Trade Intelligence read
- The Rules tab's valuation content
- The Excel reference and the member guide
- Light and Dark mode

## Validation

See `docs/validation/VALIDATION_v2.0.md`.

## Launch

Follow `docs/roadmap/v5/V5_WEB_V2.0_RUNBOOK.md`. The backend goes first, the site merges at step 5, and public reads close right after.
