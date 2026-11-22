# V5_WEB_V2.0_RUNBOOK

Launch steps for Web v2.0 (League mode), in order. This turns spec §8 into steps the site owner can click through. The owner functions used here are explained in [V5_OWNER_TOOLKIT.md](V5_OWNER_TOOLKIT.md).

**Before you start:**
- `release/web-v2.0` is complete: build step 7's release PR is open, **not merged**.
- Allow about 45 minutes, at a quiet time for the league.
- Claude can open PRs during the launch. You merge them.

**Where things run:**
- **PowerShell**, in the repo folder: `C:\Users\brand\OneDrive\Madden League\Github\madden-trade-calculator`.
- **Explorer** is the Supabase dashboard query editor (formerly SQL Editor).
- **GitHub Desktop.**

`<LEAGUE NAME>` is the main league's name. Keep it out of the repo.

**Rule:** everything up to step 5 can be undone without touching existing trades. If anything looks wrong, stop and tell Claude.

---

## Step 0: Backup (about 5 minutes)

1. Supabase dashboard → **Table Editor** → table **trades** → **Export** (top right) → **Export as CSV**. Save it to a private `backups/` folder outside the repo.
2. Do the same for **audit_events**.
3. In **Explorer**, run the following and write down the two numbers (all trades, deleted trades):

   ```sql
   select count(*) as all_trades, count(deleted_at) as deleted from public.trades;
   ```

## Step 1: Database (about 5 minutes)

1. **GitHub Desktop:** Current Branch → `release/web-v2.0` → **Fetch origin** → **Pull origin**.
2. **PowerShell:**

   ```powershell
   npx.cmd supabase db push --remote
   ```

3. It lists the migrations to apply. **Confirm only if exactly these two are listed:**
   - `20261122160000_league_mode.sql`
   - `20261122170000_owner_toolkit.sql`

   Type `Y`. If anything else is listed, answer `n` and tell Claude.

The live v1.5.0 site keeps working: this only adds things.

## Step 2: League setup (about 5 minutes)

In **Explorer**, run each line separately.

1. Load the 32 teams from the latest Snallabot export:

   ```sql
   select * from owner_load_teams('<LEAGUE NAME>');
   ```

   Expect 32 rows, all `added`. Check that OMH and AZ are there, and that the right teams show `USER` (human).
2. Set the commissioner password (8+ characters):

   ```sql
   select * from owner_set_commissioner_password('<LEAGUE NAME>', '<PASSWORD>');
   ```

   Expect "Password set." **Then discard this query**, because it contains the password.
3. Check:

   ```sql
   select * from owner_leagues();
   ```

   Expect `password_set` true, `teams` 32, and `human_teams` matching the league.

## Step 3: Functions (about 5 minutes)

**PowerShell**, still on `release/web-v2.0`. Run one line at a time and wait for "Deployed" each time. A "Docker is not running" warning is harmless.

```powershell
npx.cmd supabase functions deploy accept-trade --no-verify-jwt
npx.cmd supabase functions deploy commissioner-login --no-verify-jwt
npx.cmd supabase functions deploy commissioner-session-check --no-verify-jwt
npx.cmd supabase functions deploy review-trade --no-verify-jwt
npx.cmd supabase functions deploy commissioner-audit-log --no-verify-jwt
```

The live v1.5.0 site still logs trades, because the new `accept-trade` still accepts v1.5.0.

## Step 4: Move the history (about 2 minutes)

In **Explorer**:

```sql
select * from owner_move_pre_league_history('<LEAGUE NAME>');
```

**Check against step 0:**
- `moved` = all trades.
- `moved_deleted` = deleted.
- `moved_active` = the difference.
- `trades_without_league` = 0.

If they don't match, stop and tell Claude.

## Step 5: Merge the site and close public reads (about 10 minutes)

1. **GitHub:** merge the release PR (`release/web-v2.0` → `main`) with a merge commit. GitHub Pages deploys in 1–2 minutes.
2. Open the live site and hard-refresh (Ctrl+F5). The header should say **Web Release v2.0**.
3. Tell Claude it's merged. Claude opens a one-file PR adding `…_drop_public_trade_read.sql` (staged today in `docs/roadmap/v5/sql/web-v2.0-drop-public-trade-read.sql`). Merge it.
4. **GitHub Desktop:** switch to `main` → **Fetch** → **Pull**. Then in **PowerShell**:

   ```powershell
   npx.cmd supabase db push --remote
   ```

   Confirm only if the drop migration is the **only** one listed.

From now on, trades can only be read through a league name.

## Step 6: Switchover sweep (1 minute)

Trades logged from open v1.5.0 tabs during steps 3–5 have no league. In **Explorer**:

```sql
select * from owner_move_pre_league_history('<LEAGUE NAME>');
```

Usually `moved` is 0 or a small number. `trades_without_league` must be 0.

## Step 7: Smoke test, then retire the old Admin (about 15 minutes)

On the live site, on desktop and on a phone:

1. **Practice mode:** values match v1.5.0 (try one known trade). There's no Submit button.
2. **League:** a wrong name shows "No league with that name." The right name loads 32 teams, with the human teams marked.
3. Submit a FAIR trade and an UNFAIR test trade. Both show in Trade History as **Unreviewed**, and the UNFAIR one is flagged in the Commissioner queue.
4. **Commissioner:**
   - A wrong password is refused.
   - Sign in, mark one test trade reviewed, then correct it. Both versions should show under "Show original submission".
   - Reverse the test trades, with the reason "Launch test". They leave history but stay in the audit log.
5. **Pre-league:** Trade History shows the old trades with the Pre-league badge, and the count matches step 4's `moved_active`.
6. Check dark mode.

Then, in **PowerShell**, retire the v1.5.0 Admin:

```powershell
npx.cmd supabase functions delete admin-login
npx.cmd supabase functions delete admin-session-check
npx.cmd supabase functions delete delete-trade
npx.cmd supabase functions delete admin-audit-log
npx.cmd supabase secrets unset ADMIN_PASSWORD
```

Keep `ADMIN_SESSION_SECRET`: it signs commissioner sessions.

Finally, share the league name with members privately (Discord), together with a note that practice mode no longer logs trades.

## Step 8: About a week later

Claude opens a small maintenance PR that removes `v1.5.0` from `accept-trade`. Merge it, then redeploy:

```powershell
npx.cmd supabase functions deploy accept-trade --no-verify-jwt
```

## If something goes wrong

| Problem | Fix |
|---|---|
| Step 1 lists other migrations | Answer `n`, tell Claude |
| Step 2 says "No Snallabot team list found" | Run an export in Snallabot, wait 2 minutes, re-run |
| Step 4 counts don't match | Stop. Nothing is lost: the trades are still there and the backup exists. Tell Claude |
| The site is broken after step 5 | GitHub → the merged PR → **Revert**, then merge the revert PR. The v1.5.0 site returns; the database changes are harmless to it. If the drop migration already ran, tell Claude (re-creating the read policy is one statement, in the staged file's rollback section) |
| A function deploy fails | Re-run that line. If it fails again, the old function is still live: tell Claude |
| Commissioner locked out | `select * from owner_set_commissioner_password('<LEAGUE NAME>', '<NEW PASSWORD>');` clears the lockout |
