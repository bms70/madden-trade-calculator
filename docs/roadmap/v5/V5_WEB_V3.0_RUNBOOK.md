# V5_WEB_V3.0_RUNBOOK

Web Release v3.0 launch. Ruleset v4.4 unchanged. **Order matters:** database and functions before the merge, pick tracking after.

| Step | Where | What | Check |
|---|---|---|---|
| 1 | PowerShell, repo folder, on the PR branch (`git pull`) | `npx.cmd supabase db push --remote` | Only `20261127040000_web_v3_picks_and_snapshots.sql` is listed. It's safe on the live v2.1 site: picks stay off until step 6 |
| 2 | PowerShell | `npx.cmd supabase functions deploy accept-trade --no-verify-jwt`, then the same for `review-trade`, `commissioner-picks`, `commissioner-snapshots` | Four "Deployed" lines |
| 3 | GitHub | Merge the PR (merge commit), delete the branch | Pages rebuilds in a minute or two |
| 4 | Browser | Hard refresh (Ctrl+F5) | Header says **Web Release v3.0** |
| 5 | Supabase Explorer | Confirm the current draft year: during the 2027 season the next draft is **2028** | — |
| 6 | Supabase Explorer | `select * from owner_setup_draft_picks('<LEAGUE NAME>', 2028);` | Three rows: 2028, 2029, 2030 with 224 picks each |
| 7 | Supabase Explorer | `select * from owner_replay_pick_trades('<LEAGUE NAME>');` | One row per pick in earlier trades. **MOVED** is done. Fix each **SKIPPED** with `owner_set_pick_owner(...)` |
| 8 | Site, Commissioner tab | Sign in, open **Draft picks**, then **Exports** | Picks moved by earlier trades are underlined. Mark the newest healthy export current |
| 9 | Site, League mode | Choose two teams and add a Draft Pick (don't submit) | **Whose pick** lists the giving team's picks |
| 10 | Release | Tag `web-v3.0`, publish the release, update the wiki | — |
| 11 | A few days later | Maintenance PR: remove v2.0 and v2.1 from `trade-validation.ts`, then redeploy `accept-trade` and `review-trade` | — |

**If something goes wrong after step 6:** members on old pages see "reload the page" for pick trades, which is expected. To pause tracking, run `update public.leagues set current_draft_year = null where name_key = lower('<LEAGUE NAME>');`. Trades then submit without pick checks. Set it back to resume; the picks are kept.
