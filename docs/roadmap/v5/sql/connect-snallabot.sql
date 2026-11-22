-- ============================================================================
-- connect-snallabot.sql
-- Site-owner script: create the league record and its Snallabot import secret.
-- Run ONCE in the Supabase dashboard SQL editor, after the
-- 20261122060000_snallabot_import migration is applied.
--
-- Before running: replace <LEAGUE NAME> below with the league's name.
-- Don't save the edited copy anywhere public, and never commit it: the league
-- name and the secret printed below must stay out of the repo.
--
-- Output: league_id and import_secret. Copy import_secret immediately; only its
-- SHA-256 hash is stored, so it can't be shown again. If it's lost, run the
-- "Rotate the secret" block at the bottom.
--
-- The Snallabot export URL is then:
--   https://<project-ref>.supabase.co/functions/v1/snallabot-import/<import_secret>
-- (Snallabot adds /<platform>/<leagueId>/<route> itself.)
-- ============================================================================

with s as (
    select encode(extensions.gen_random_bytes(24), 'hex') as secret
),
ins as (
    insert into public.leagues (name, import_secret_sha256, import_secret_set_at)
    select '<LEAGUE NAME>', encode(extensions.digest(s.secret, 'sha256'), 'hex'), now()
    from s
    returning id
)
select ins.id as league_id, s.secret as import_secret
from ins, s;

-- ============================================================================
-- Rotate the secret (if it leaks or is lost). Replace <LEAGUE NAME>, run,
-- then paste the new URL into Snallabot. The old URL stops working at once.
-- ============================================================================
--
-- with s as (
--     select encode(extensions.gen_random_bytes(24), 'hex') as secret
-- ),
-- upd as (
--     update public.leagues l
--     set import_secret_sha256 = encode(extensions.digest(s.secret, 'sha256'), 'hex'),
--         import_secret_set_at = now()
--     from s
--     where l.name_key = lower(regexp_replace(trim('<LEAGUE NAME>'), '\s+', ' ', 'g'))
--     returning l.id
-- )
-- select upd.id as league_id, s.secret as new_import_secret
-- from upd, s;

-- ============================================================================
-- Check what has arrived (newest first)
-- ============================================================================
--
-- select * from public.import_snapshot_summary order by first_received_at desc;
