# V5_OWNER_TOOLKIT

How the site owner manages leagues in Web v2.0. There is no owner screen on the website, by decision (Q31 in `V5_OPEN_QUESTIONS.md`: the SQL commands are fine for now). Everything runs as one-line SQL in the Supabase dashboard.

The functions come from `supabase/migrations/20261122170000_owner_toolkit.sql`. Only the dashboard can run them: the website and the Edge Functions are refused.

## Where to run these

1. Open https://supabase.com/dashboard/project/zcuycdgvpfotjnlltdyt.
2. Select **Explorer** in the left sidebar (the query editor, formerly SQL Editor). Start a **new query**.
3. Paste one line, replace the placeholders, and select **Run**. The result appears below as a table.
4. **Discard the query afterwards** if it contains a password, an import secret, or the league name (`…` menu next to the query → Delete).

These are **not** PowerShell commands.

`<LEAGUE NAME>` means the league's name as members type it. Case and spacing don't matter. Never put the real name, a password or a secret into the repo, the wiki, a commit or a PR.

## Quick reference

| Task | Run |
|---|---|
| See every league and its status | `select * from owner_leagues();` |
| List a league's teams | `select * from owner_teams('<LEAGUE NAME>');` |
| Load or refresh teams from Snallabot | `select * from owner_load_teams('<LEAGUE NAME>');` |
| Fix one team (human / CPU, owner label) | `select * from owner_set_team('<LEAGUE NAME>', 'DAL', 'USER', 'Owner name');` |
| Set or reset the commissioner password | `select * from owner_set_commissioner_password('<LEAGUE NAME>', '<PASSWORD>');` |
| Create a new league | `select * from owner_create_league('<NEW LEAGUE NAME>');` |
| Rename a league | `select * from owner_rename_league('<LEAGUE NAME>', '<NEW NAME>');` |
| Archive / reactivate a league | `select * from owner_set_league_status('<LEAGUE NAME>', 'ARCHIVED');` (or `'ACTIVE'`) |
| New Snallabot import secret | `select * from owner_rotate_import_secret('<LEAGUE NAME>');` |
| Move trades without a league into a league | `select * from owner_move_pre_league_history('<LEAGUE NAME>');` |

Every change is written to the league's audit log as **site owner**, so the commissioner sees it.

## Details

### `owner_leagues()`

One row per league, archived ones included. Columns:

- `password_set`: whether the league has a commissioner password.
- `teams` and `human_teams`.
- `active_trades`, `unreviewed` and `pre_league`.
- `snallabot_connected`.
- `latest_export`: when the latest Snallabot export arrived.

### `owner_load_teams(name)`

Reads the team list from the **newest Snallabot export** and adds or updates the league's teams. It matches on Madden's team ID, so it's safe to run again any time, for example after a relocation or when a new person takes over a team. Teams are never deleted, so trades stay linked.

- A team with a Snallabot `userName` becomes **USER** (human). Otherwise it's **CPU**.
- The `userName` is kept in `owner_label`. The website never shows it.
- The result lists every team with `added`, `updated` or `unchanged`.
- "No Snallabot team list found" means no export has arrived yet. Run an export from Snallabot first.

### `owner_set_team(name, abbreviation, controlled_by, owner_label)`

Fixes one team by hand.

- `controlled_by` is `USER` (or `HUMAN`) or `CPU`.
- Pass `null` for anything you want to keep as it is. For example, `select * from owner_set_team('<LEAGUE NAME>', 'OMH', null, 'New owner');` changes only the label.
- The next `owner_load_teams` overwrites manual fixes with what Snallabot says.

### `owner_set_commissioner_password(name, password)`

Sets the password the first time, or resets it later. It must be 8–200 characters. It is stored only as a bcrypt hash.

A reset also clears any login lockout (5 wrong tries in 15 minutes). After running it, **discard the query** because it contains the password, and tell the commissioner privately.

### `owner_create_league(name)`

Creates a league and returns its **import secret**. The secret is shown only once, so copy it immediately.

Then:

1. In Snallabot, set the export URL to `https://zcuycdgvpfotjnlltdyt.supabase.co/functions/v1/snallabot-import/<import secret>` and run an export.
2. `owner_load_teams`.
3. `owner_set_commissioner_password`.
4. Give members the league name.

The main league already exists (made with `connect-snallabot.sql`), so this is only for additional leagues.

### `owner_rename_league(old, new)` and `owner_set_league_status(name, status)`

- **Renaming** changes what members type. The old name stops working immediately, and browsers that remembered it will ask again.
- **ARCHIVED** hides the league from members (lookup, history, submit, commissioner sign-in) without deleting anything. **ACTIVE** brings it back.

### `owner_rotate_import_secret(name)`

Use this if the Snallabot URL leaks or is lost. It returns a new secret, and the old URL stops working at once. Paste the new URL into Snallabot.

### `owner_move_pre_league_history(name)`

Used at launch. It moves every trade that has no league (the v1.x history, plus any v1.5.0 trade logged during the switchover) into the league as **Pre-league**.

- Each moved trade gets a frozen revision 0, and its assets are copied.
- Active trades are marked **Reviewed**. Trades deleted with the v1.x Admin are marked **Reversed**, keeping their deletion reason (Q22).
- Deleted trades move too, so their old deletion record shows in the league's audit log.
- It's safe to re-run: it only touches trades without a league.
- Result columns: `moved`, `moved_active`, `moved_deleted`, `league_active_trades`, and `trades_without_league` (which should be 0).
