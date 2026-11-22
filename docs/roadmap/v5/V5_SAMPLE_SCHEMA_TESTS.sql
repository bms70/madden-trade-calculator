-- ============================================================================
-- V5_SAMPLE_SCHEMA_TESTS.sql
-- Behavior and constraint checks for V5_SAMPLE_SCHEMA.sql (Phase 1).
--
-- Run against a SCRATCH Postgres 15+ database, never the live Supabase project:
--   1. create roles anon, authenticated (nologin) and service_role (nologin bypassrls)
--   2. apply supabase/migrations/*.sql in order (includes the Snallabot connection)
--   3. apply docs/roadmap/v5/V5_SAMPLE_SCHEMA.sql
--   4. psql -f docs/roadmap/v5/V5_SAMPLE_SCHEMA_TESTS.sql
-- Expected last line: 33 / 33 PASS
-- ============================================================================
\set ON_ERROR_STOP 1
\pset tuples_only on
create temp table results (n serial, name text, ok boolean);
grant all on results to public; grant usage on sequence results_n_seq to public;
create or replace function pg_temp.expect_fail(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; insert into results(name, ok) values (p_name, false);
  exception when others then insert into results(name, ok) values (p_name, true); end;
end $$;
create or replace function pg_temp.check(p_name text, p_ok boolean) returns void language sql as $$
  insert into results(name, ok) values (p_name, coalesce(p_ok,false)); $$;

-- Legacy v1.5.0 trades (one active, one Admin-deleted through the v1.4.0 function)
insert into trades (web_release, ruleset_version, user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode)
values ('v1.5.0','v4.4',100,98,100,98,0.02,'FAIR','DIRECTIONAL'),
       ('v1.5.0','v4.4',50,90,50,90,0.44,'LEAGUE-BREAKING','DIRECTIONAL');
select pg_temp.check('v1.4.0 delete_trade_with_audit still works',
  (select count(*) = 1 from delete_trade_with_audit((select id from trades where trade_number = 2), 'Admin', 'test')));

-- Migration sketch (section 7) with real values
insert into leagues (name, commissioner_password_hash) values ('  The   Main League ', crypt('s3cret', gen_salt('bf', 6)));
insert into league_teams (league_id, abbreviation, city_name, nickname, division, controlled_by)
select l.id, x.a, x.c, x.n, x.d, x.cb from leagues l,
 (values ('LAR','Los Angeles','Rams','NFC West','USER'), ('ARI','Arizona','Cardinals','NFC West','CPU'), ('SEA','Seattle','Seahawks','NFC West','CPU')) x(a,c,n,d,cb);
update trades set league_id = (select id from leagues), is_pre_league = true,
  review_status = case when deleted_at is null then 'REVIEWED' else 'REVERSED' end,
  reversal_reason = case when deleted_at is null then null else 'Deleted before league mode (v1.4.0 Admin delete)' end,
  reviewed_by = 'pre-league migration', reviewed_at = now()
where league_id is null;
insert into trade_revisions (trade_id, revision, snapshot, web_release, ruleset_version, verdict, user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name, created_at)
select id, 0, to_jsonb(t) - 'id', web_release, ruleset_version, verdict, user_adjusted_value, cpu_adjusted_value, 'MIGRATION', 'pre-league migration', accepted_at from trades t where t.is_pre_league;
insert into audit_events (action, league_id, actor_role, administrator_name, details)
values ('PRE_LEAGUE_MIGRATION', (select id from leagues), 'SITE_OWNER', 'site owner', jsonb_build_object('trades', 2));
select pg_temp.check('migration: every trade has league + revision 0',
  (select count(*) = 0 from trades t where league_id is null or not exists (select 1 from trade_revisions r where r.trade_id = t.id and r.revision = 0)));
select pg_temp.check('migration: deleted trade became REVERSED', (select review_status = 'REVERSED' from trades where trade_number = 2));

-- A new league trade: submit, assets, review, correction
insert into trades (web_release, ruleset_version, user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode,
  league_id, submitting_team_id, other_team_id, review_status, submitter_name)
select 'v2.0','v4.4',80,80,80,80,0,'FAIR','DRAFT_ONLY', l.id,
  (select id from league_teams where abbreviation='LAR'), (select id from league_teams where abbreviation='ARI'), 'UNREVIEWED', 'Brandon'
from leagues l;
insert into trade_revisions (trade_id, revision, snapshot, web_release, ruleset_version, verdict, user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name)
select id, 0, '{}'::jsonb, 'v2.0','v4.4','FAIR',80,80,'MEMBER','Brandon' from trades where trade_number = 3;
insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, pick, timing, value)
select id, 0, 'SUBMITTING', 1, 'Draft Pick', '1.16', 'Current draft', 80 from trades where trade_number = 3;
insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, name, ovr, age, pos, dev, cap_hit_m, years_remaining, years_in_league, role_current, role_projected, value, imported_values, edited_fields)
select id, 0, 'OTHER', 1, 'Player', 'Test WR', 84, 25, 'WR', 'Star', 3.50, 3, 3, 'Starter', 'Starter', 80, '{"ovr":82}', '{ovr}' from trades where trade_number = 3;
select pg_temp.check('review queue shows the new trade',
  (select count(*) = 1 from trades where review_status = 'UNREVIEWED' and deleted_at is null));
insert into trade_revisions (trade_id, revision, snapshot, web_release, ruleset_version, verdict, user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name, reason)
select id, 1, '{}'::jsonb, 'v2.0','v4.4','UNFAIR',80,70,'COMMISSIONER','Commish','OVR was 82, not 84' from trades where trade_number = 3;
update trades set current_revision = 1, review_status = 'REVIEWED', reviewed_by = 'Commish', reviewed_at = now() where trade_number = 3;
select pg_temp.check('correction keeps both revisions', (select count(*) = 2 from trade_revisions r join trades t on t.id = r.trade_id where t.trade_number = 3));

-- Constraints that must reject bad data
select pg_temp.expect_fail('same team on both sides', $q$ update trades set other_team_id = submitting_team_id where trade_number = 3 $q$);
select pg_temp.expect_fail('team from another league', $q$
  with l2 as (insert into leagues (name, commissioner_password_hash) values ('Other League', crypt('x', gen_salt('bf',6))) returning id),
       t2 as (insert into league_teams (league_id, abbreviation, city_name, nickname) select id, 'NYG','New York','Giants' from l2 returning id)
  update trades set other_team_id = (select id from t2) where trade_number = 3 $q$);
select pg_temp.expect_fail('league trade without submitter', $q$ update trades set submitter_name = '  ' where trade_number = 3 $q$);
select pg_temp.expect_fail('REVERSED without deleted_at/reason', $q$ update trades set review_status = 'REVERSED' where trade_number = 3 $q$);
select pg_temp.expect_fail('duplicate league name (case/space-insensitive)', $q$ insert into leagues (name, commissioner_password_hash) values ('the main league', crypt('x', gen_salt('bf',6))) $q$);
select pg_temp.expect_fail('plain-text password rejected', $q$ insert into leagues (name, commissioner_password_hash) values ('L3', 'password') $q$);
select pg_temp.expect_fail('asset OVR 100', $q$ insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, ovr, value) select id, 0, 'OTHER', 9, 'Player', 100, 0 from trades where trade_number = 3 $q$);
select pg_temp.expect_fail('asset years remaining 0', $q$ insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, years_remaining, value) select id, 0, 'OTHER', 9, 'Player', 0, 0 from trades where trade_number = 3 $q$);
select pg_temp.expect_fail('LS not a v4.4 trade position', $q$ insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, pos, value) select id, 0, 'OTHER', 9, 'Player', 'LS', 0 from trades where trade_number = 3 $q$);
select pg_temp.expect_fail('edited fields without imported values', $q$ insert into trade_assets (trade_id, revision, side, position_in_side, asset_type, value, edited_fields) select id, 0, 'OTHER', 9, 'Player', 0, '{ovr}' from trades where trade_number = 3 $q$);
select pg_temp.expect_fail('correction without reason', $q$ insert into trade_revisions (trade_id, revision, snapshot, web_release, ruleset_version, verdict, user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name) select id, 2, '{}', 'v2.0','v4.4','FAIR',1,1,'COMMISSIONER','C' from trades where trade_number = 3 $q$);
select pg_temp.expect_fail('trade audit action without trade', $q$ insert into audit_events (action, league_id, administrator_name) select 'TRADE_REVIEWED', id, 'C' from leagues limit 1 $q$);
select pg_temp.expect_fail('stage outside offseason', $q$ insert into league_calendar (league_id, season, phase, week, offseason_stage, updated_by) select id, 2026, 'REGULAR', 5, 'DRAFT', 'C' from leagues where name = '  The   Main League ' $q$);

-- Imports
insert into import_snapshots (league_id, source, status, reviewed_by) select id, 'SNALLABOT', 'CURRENT', 'Commish' from leagues where name_key = 'the main league';
select pg_temp.expect_fail('two CURRENT snapshots in a league', $q$ insert into import_snapshots (league_id, source, status, reviewed_by) select id, 'SNALLABOT', 'CURRENT', 'C' from leagues where name_key = 'the main league' $q$);
select pg_temp.expect_fail('REJECTED without reviewer', $q$ insert into import_snapshots (league_id, source, status) select id, 'CSV', 'REJECTED' from leagues where name_key = 'the main league' $q$);
insert into league_players (league_id, snapshot_id, external_player_id, team_id, first_name, last_name, madden_position, pos, ovr, age, dev, cap_hit_m, years_remaining, years_in_league)
select s.league_id, s.id, 1001, (select id from league_teams where abbreviation='LAR'), 'A','Snapper','LS',null,60,30,'Normal',0.80,2,8 from import_snapshots s where s.status='CURRENT';
select pg_temp.check('LS stored on import with no v4.4 position', (select pos is null from league_players where external_player_id = 1001));
select pg_temp.expect_fail('free agent with a team', $q$ insert into league_players (league_id, snapshot_id, external_player_id, team_id, first_name, last_name, madden_position, pos, ovr, age, dev, years_in_league, is_free_agent) select s.league_id, s.id, 1002, (select id from league_teams where abbreviation='LAR'), 'B','C','QB','QB',70,25,'Normal',2,true from import_snapshots s where s.status='CURRENT' $q$);
select pg_temp.expect_fail('LT imported without mapping to OT', $q$ insert into league_players (league_id, snapshot_id, external_player_id, first_name, last_name, madden_position, pos, ovr, age, dev, years_in_league, is_free_agent) select s.league_id, s.id, 1003, 'B','C','LT',null,70,25,'Normal',2,true from import_snapshots s where s.status='CURRENT' $q$);

-- Picks
insert into draft_picks (league_id, draft_season, round, original_team_id, owner_team_id, updated_by)
select l.id, 2027, 1, (select id from league_teams where abbreviation='ARI'), (select id from league_teams where abbreviation='LAR'), 'Commish' from leagues l where name_key = 'the main league';
select pg_temp.expect_fail('pick round 8', $q$ insert into draft_picks (league_id, draft_season, round, original_team_id, owner_team_id, updated_by) select l.id, 2027, 8, t.id, t.id, 'C' from leagues l join league_teams t on t.league_id = l.id where l.name_key = 'the main league' limit 1 $q$);

-- Access as the browser role
set role anon;
select pg_temp.check('anon: league_lookup matches odd casing/spacing', (select count(*) = 1 from league_lookup('THE main   league')));
select pg_temp.check('anon: unknown league returns nothing', (select count(*) = 0 from league_lookup('nope')));
select pg_temp.check('anon: team list', (select count(*) = 3 from league_team_list('the main league')));
select pg_temp.check('anon: league history hides reversed trade', (select count(*) = 2 from league_trade_history('the main league')));
select pg_temp.expect_fail('anon: cannot list leagues directly', 'select * from leagues');
select pg_temp.expect_fail('anon: cannot read players directly', 'select * from league_players');
select pg_temp.expect_fail('anon: cannot verify passwords', $q$ select verify_commissioner_password(gen_random_uuid(), 'x') $q$);
reset role;
set role service_role;
select pg_temp.check('service_role: right password accepted', (select verify_commissioner_password((select id from leagues where name_key='the main league'), 's3cret')));
select pg_temp.check('service_role: wrong password rejected', (select not verify_commissioner_password((select id from leagues where name_key='the main league'), 'wrong')));
reset role;

\pset tuples_only off
select n, case when ok then 'PASS' else 'FAIL' end as result, name from results order by n;
select count(*) filter (where ok) || ' / ' || count(*) || ' PASS' as total from results;
