# V5_WEB_V4.0_RUNBOOK

Web Release v4.0 launch. Ruleset v4.4 unchanged. **Database and functions go live before the merge.**

| Step | Where | What | Check |
|---|---|---|---|
| 1 | PowerShell, on the PR branch (`git fetch`, `git checkout web-v4.0`, `git pull`) | `npx.cmd supabase db push --remote` | Only `20261127050000_web_v4_activity_and_posture.sql` is listed. Safe for the live v3.1 site |
| 2 | PowerShell | `npx.cmd supabase functions deploy accept-trade --no-verify-jwt`, then the same for `commissioner-activity` | Two "Deployed" lines |
| 3 | GitHub | Merge the PR, delete the branch | Pages rebuilds |
| 4 | Browser | Hard refresh (Ctrl+F5) | Header says **Web Release v4.0** |
| 5 | Site, League mode | Choose two teams and add assets (don't submit) | **League context (FYI)** shows both teams' records and labels |
| 6 | Site, Commissioner | Sign in and open **League activity** | Unlogged human moves are listed under Needs a look; mark any already resolved as handled |
| 7 | Release | Tag `v4.0` and publish the release; update the wiki | — |
| 8 | **Done 2026-11-27** (same day) | Maintenance PR: only v4.0 accepted; `accept-trade` and `review-trade` redeployed | — |
