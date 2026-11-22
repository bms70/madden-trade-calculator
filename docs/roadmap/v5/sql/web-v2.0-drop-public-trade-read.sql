-- ============================================================================
-- web-v2.0-drop-public-trade-read.sql
-- STAGED MIGRATION for Web Release v2.0, release step 5. Do NOT apply early.
--
-- It stays out of supabase/migrations/ on purpose: `db push` applies every
-- pending migration, and this one must wait until the v2.0 site is live
-- (the v1.5.0 site reads Trade History directly from the trades table).
--
-- At release step 5, after the v2.0 site merges, the release PR's follow-up
-- copies this file to supabase/migrations/<timestamp>_drop_public_trade_read.sql
-- and the site owner runs `npx.cmd supabase db push --remote`.
--
-- After it: browsers can no longer read public.trades directly. League history
-- is read through league_trade_history(<league name>) only.
-- Rollback: re-create the policy and grant shown at the bottom.
-- ============================================================================

drop policy if exists "Public can read active trades" on public.trades;

revoke select on table public.trades from anon, authenticated;

-- Rollback (only if the release is reverted):
-- grant select on table public.trades to anon, authenticated;
-- create policy "Public can read active trades"
--     on public.trades for select to anon, authenticated
--     using (deleted_at is null);
