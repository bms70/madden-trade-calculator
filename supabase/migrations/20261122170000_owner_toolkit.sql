-- Madden League Trade Calculator
-- Web Release v2.0: site-owner toolkit
-- Ruleset v4.4 remains unchanged.
--
-- One-line functions the site owner runs in the Supabase dashboard (Explorer),
-- e.g.  select * from owner_set_commissioner_password('League', 'password');
-- Guide: docs/roadmap/v5/V5_OWNER_TOOLKIT.md. Applied with the league-mode
-- migration at release step 1.
--
-- Access: owned by postgres (the dashboard's role). Execute is revoked from
-- public, anon, authenticated and service_role, so neither the website nor the
-- Edge Functions can call them.
--
-- League names: every function finds the league by name the same way members
-- do (case and spacing ignored), including archived leagues.

-- ============================================================
-- 1. Audit actions for owner changes
-- ============================================================

alter table public.audit_events
    drop constraint audit_events_action_allowed,
    add constraint audit_events_action_allowed check (
        action in (
            'TRADE_DELETED',
            'TRADE_REVIEWED',
            'TRADE_CORRECTED',
            'TRADE_REVERSED',
            'LEAGUE_CREATED',
            'LEAGUE_RENAMED',
            'LEAGUE_STATUS_CHANGED',
            'COMMISSIONER_PASSWORD_SET',
            'IMPORT_SECRET_ROTATED',
            'TEAM_UPDATED',
            'CALENDAR_UPDATED',
            'PICK_OWNERSHIP_CHANGED',
            'SNAPSHOT_MARKED_CURRENT',
            'SNAPSHOT_REJECTED',
            'PRE_LEAGUE_MIGRATION'
        )
    );

-- ============================================================
-- 2. Helpers
-- ============================================================

-- The league for a name, active or archived; raises if there's none.
create or replace function public.owner_find_league(p_name text)
returns public.leagues
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
begin
    select * into v_league from leagues l where l.name_key = league_name_key(p_name);
    if not found then
        raise exception using errcode = 'P0002',
            message = format('No league named %L. Run: select * from owner_leagues();', p_name);
    end if;
    return v_league;
end;
$$;

create or replace function public.owner_audit(
    p_league_id uuid, p_action text, p_reason text, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (null, null, p_action, 'site owner', p_reason, p_league_id, 'SITE_OWNER', coalesce(p_details, '{}'::jsonb));
$$;

-- ============================================================
-- 3. Overview
-- ============================================================

create or replace function public.owner_leagues()
returns table (
    league_name text,
    status text,
    password_set boolean,
    teams integer,
    human_teams integer,
    active_trades integer,
    unreviewed integer,
    pre_league integer,
    snallabot_connected boolean,
    latest_export timestamptz,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        l.name,
        l.status,
        l.commissioner_password_hash is not null,
        (select count(*)::integer from league_teams t where t.league_id = l.id),
        (select count(*)::integer from league_teams t where t.league_id = l.id and t.controlled_by = 'USER'),
        (select count(*)::integer from trades tr where tr.league_id = l.id and tr.deleted_at is null),
        (select count(*)::integer from trades tr
          where tr.league_id = l.id and tr.deleted_at is null and tr.review_status = 'UNREVIEWED'),
        (select count(*)::integer from trades tr where tr.league_id = l.id and tr.is_pre_league),
        l.import_secret_sha256 is not null,
        (select max(s.first_received_at) from import_snapshots s where s.league_id = l.id),
        l.created_at
    from leagues l
    order by l.created_at;
$$;

-- ============================================================
-- 4. Leagues
-- ============================================================

-- A new league with its Snallabot import secret (shown once; only its hash
-- is kept). Then: load teams after the first export, set the password.
create or replace function public.owner_create_league(
    p_name text,
    p_madden_version text default 'Madden 27'
)
returns table (league_name text, import_secret text, next_steps text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_name text := trim(coalesce(p_name, ''));
    v_secret text := encode(gen_random_bytes(24), 'hex');
    v_id uuid;
begin
    if length(v_name) not between 1 and 100 then
        raise exception using errcode = '22023', message = 'A league name must be 1 to 100 characters.';
    end if;

    if exists (select 1 from leagues l where l.name_key = league_name_key(v_name)) then
        raise exception using errcode = '23505',
            message = format('A league named %L already exists.', v_name);
    end if;

    insert into leagues (name, madden_version, import_secret_sha256, import_secret_set_at)
    values (v_name, coalesce(nullif(trim(p_madden_version), ''), 'Madden 27'),
            encode(digest(v_secret, 'sha256'), 'hex'), now())
    returning id into v_id;

    perform owner_audit(v_id, 'LEAGUE_CREATED', null, '{}'::jsonb);

    return query select v_name, v_secret,
        'Copy the import secret now (it is not shown again). Next: Snallabot export, owner_load_teams, owner_set_commissioner_password.'::text;
end;
$$;

-- Renaming changes what members type to enter the league.
create or replace function public.owner_rename_league(p_name text, p_new_name text)
returns table (old_name text, new_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_new text := trim(coalesce(p_new_name, ''));
begin
    if length(v_new) not between 1 and 100 then
        raise exception using errcode = '22023', message = 'A league name must be 1 to 100 characters.';
    end if;

    if exists (select 1 from leagues l
               where l.name_key = league_name_key(v_new) and l.id <> v_league.id) then
        raise exception using errcode = '23505',
            message = format('A league named %L already exists.', v_new);
    end if;

    update leagues set name = v_new where id = v_league.id;
    perform owner_audit(v_league.id, 'LEAGUE_RENAMED', null, '{}'::jsonb);

    return query select v_league.name, v_new;
end;
$$;

-- ARCHIVED hides the league from members (lookup, history, submit, sign-in);
-- nothing is deleted. ACTIVE brings it back.
create or replace function public.owner_set_league_status(p_name text, p_status text)
returns table (league_name text, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_status text := upper(trim(coalesce(p_status, '')));
begin
    if v_status not in ('ACTIVE', 'ARCHIVED') then
        raise exception using errcode = '22023', message = 'Status must be ACTIVE or ARCHIVED.';
    end if;

    update leagues l set status = v_status where l.id = v_league.id;
    perform owner_audit(v_league.id, 'LEAGUE_STATUS_CHANGED', null,
        jsonb_build_object('from', v_league.status, 'to', v_status));

    return query select v_league.name, v_status;
end;
$$;

-- ============================================================
-- 5. Commissioner password and import secret
-- ============================================================

-- Sets or resets the league's commissioner password (bcrypt) and clears any
-- login lockout. Discard the query afterwards: it contains the password.
create or replace function public.owner_set_commissioner_password(p_name text, p_password text)
returns table (league_name text, result text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_was_set boolean := v_league.commissioner_password_hash is not null;
begin
    if p_password is null or length(p_password) < 8 or length(p_password) > 200 then
        raise exception using errcode = '22023', message = 'The password must be 8 to 200 characters.';
    end if;

    update leagues l
    set commissioner_password_hash = crypt(p_password, gen_salt('bf', 10)),
        commissioner_password_set_at = now()
    where l.id = v_league.id;

    delete from commissioner_login_attempts a where a.league_id = v_league.id;

    perform owner_audit(v_league.id, 'COMMISSIONER_PASSWORD_SET', null,
        jsonb_build_object('reset', v_was_set));

    return query select v_league.name,
        case when v_was_set then 'Password changed. Any lockout is cleared.'
             else 'Password set.' end;
end;
$$;

-- A new Snallabot import secret. The old export URL stops working at once.
create or replace function public.owner_rotate_import_secret(p_name text)
returns table (league_name text, import_secret text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_secret text := encode(gen_random_bytes(24), 'hex');
begin
    update leagues l
    set import_secret_sha256 = encode(digest(v_secret, 'sha256'), 'hex'),
        import_secret_set_at = now()
    where l.id = v_league.id;

    perform owner_audit(v_league.id, 'IMPORT_SECRET_ROTATED', null, '{}'::jsonb);

    return query select v_league.name, v_secret;
end;
$$;

-- ============================================================
-- 6. Teams
-- ============================================================

-- Loads or refreshes the league's teams from the newest Snallabot export that
-- still has its leagueteams body. Matches on Madden teamId, so it's safe to
-- re-run (e.g. after a relocation or a new human owner); teams are never
-- deleted. userName filled = USER (human), empty = CPU; userName is kept in
-- owner_label, which the website never shows.
create or replace function public.owner_load_teams(p_name text)
returns table (abbreviation text, team text, division text, controlled_by text, change text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_body jsonb;
    v_received timestamptz;
    v_count integer;
begin
    select p.body, p.received_at into v_body, v_received
    from import_payloads p
    join import_snapshots s on s.id = p.snapshot_id
    where s.league_id = v_league.id
      and p.route = 'leagueteams'
      and p.body is not null
    order by p.received_at desc
    limit 1;

    if v_body is null or jsonb_typeof(v_body -> 'leagueTeamInfoList') is distinct from 'array' then
        raise exception using errcode = 'P0002',
            message = 'No Snallabot team list found for this league yet. Run an export from Snallabot first.';
    end if;

    drop table if exists owner_incoming;
    drop table if exists owner_changes;

    create temporary table owner_incoming on commit drop as
    select
        (t ->> 'teamId')::bigint as external_team_id,
        trim(t ->> 'abbrName') as abbreviation,
        trim(t ->> 'cityName') as city_name,
        trim(coalesce(nullif(t ->> 'nickName', ''), t ->> 'displayName')) as nickname,
        nullif(trim(t ->> 'divName'), '') as division,
        case when length(trim(coalesce(t ->> 'userName', ''))) > 0 then 'USER' else 'CPU' end as controlled_by,
        nullif(trim(coalesce(t ->> 'userName', '')), '') as owner_label
    from jsonb_array_elements(v_body -> 'leagueTeamInfoList') t
    where (t ->> 'teamId') ~ '^[0-9]+$'
      and length(trim(coalesce(t ->> 'abbrName', ''))) > 0;

    select count(*) into v_count from owner_incoming;
    if v_count = 0 then
        raise exception using errcode = '22023', message = 'The Snallabot team list is empty.';
    end if;

    create temporary table owner_changes (external_team_id bigint, change text) on commit drop;

    with upd as (
        update league_teams lt
        set abbreviation = i.abbreviation,
            city_name = i.city_name,
            nickname = i.nickname,
            division = i.division,
            controlled_by = i.controlled_by,
            owner_label = i.owner_label,
            updated_at = now()
        from owner_incoming i
        where lt.league_id = v_league.id
          and lt.external_team_id = i.external_team_id
          and (lt.abbreviation, lt.city_name, lt.nickname, lt.division, lt.controlled_by, lt.owner_label)
              is distinct from (i.abbreviation, i.city_name, i.nickname, i.division, i.controlled_by, i.owner_label)
        returning lt.external_team_id
    )
    insert into owner_changes select external_team_id, 'updated' from upd;

    with ins as (
        insert into league_teams (league_id, external_team_id, abbreviation, city_name, nickname,
                                  division, controlled_by, owner_label)
        select v_league.id, i.external_team_id, i.abbreviation, i.city_name, i.nickname,
               i.division, i.controlled_by, i.owner_label
        from owner_incoming i
        where not exists (select 1 from league_teams lt
                          where lt.league_id = v_league.id and lt.external_team_id = i.external_team_id)
        returning external_team_id
    )
    insert into owner_changes select external_team_id, 'added' from ins;

    perform owner_audit(v_league.id, 'TEAM_UPDATED', null, jsonb_build_object(
        'source', 'snallabot',
        'export_received_at', v_received,
        'added', (select count(*) from owner_changes oc where oc.change = 'added'),
        'updated', (select count(*) from owner_changes oc where oc.change = 'updated')));

    return query
    select lt.abbreviation, lt.city_name || ' ' || lt.nickname, lt.division, lt.controlled_by,
           coalesce(c.change, 'unchanged')
    from league_teams lt
    left join owner_changes c on c.external_team_id = lt.external_team_id
    where lt.league_id = v_league.id
    order by lt.division nulls last, lt.city_name;
end;
$$;

-- Manual fix for one team: human / CPU and the owner label (null keeps a
-- value as it is). The next owner_load_teams overwrites these from Snallabot.
create or replace function public.owner_set_team(
    p_name text,
    p_abbreviation text,
    p_controlled_by text default null,
    p_owner_label text default null
)
returns table (abbreviation text, team text, controlled_by text, owner_label text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_control text := upper(trim(coalesce(p_controlled_by, '')));
    v_team league_teams%rowtype;
begin
    if v_control = 'HUMAN' then v_control := 'USER'; end if;
    if v_control <> '' and v_control not in ('USER', 'CPU') then
        raise exception using errcode = '22023', message = 'Controlled by must be USER (human) or CPU.';
    end if;

    select * into v_team from league_teams lt
    where lt.league_id = v_league.id and upper(lt.abbreviation) = upper(trim(coalesce(p_abbreviation, '')));
    if not found then
        raise exception using errcode = 'P0002',
            message = format('No team %L in this league. Run: select * from owner_teams(%L);', p_abbreviation, v_league.name);
    end if;

    update league_teams lt
    set controlled_by = coalesce(nullif(v_control, ''), lt.controlled_by),
        owner_label = coalesce(nullif(trim(p_owner_label), ''), lt.owner_label),
        updated_at = now()
    where lt.id = v_team.id;

    perform owner_audit(v_league.id, 'TEAM_UPDATED', null,
        jsonb_build_object('source', 'manual', 'team', v_team.abbreviation));

    return query
    select lt.abbreviation, lt.city_name || ' ' || lt.nickname, lt.controlled_by, lt.owner_label
    from league_teams lt where lt.id = v_team.id;
end;
$$;

create or replace function public.owner_teams(p_name text)
returns table (abbreviation text, team text, division text, controlled_by text, owner_label text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
begin
    return query
    select lt.abbreviation, lt.city_name || ' ' || lt.nickname, lt.division, lt.controlled_by,
           lt.owner_label, lt.updated_at
    from league_teams lt
    where lt.league_id = v_league.id
    order by lt.division nulls last, lt.city_name;
end;
$$;

-- ============================================================
-- 7. Pre-league history (release steps 4 and 6)
-- ============================================================

-- Moves every trade that has no league (the v1.x history, and any v1.5.0
-- trade logged during the switchover) into this league as pre-league:
-- revision 0 frozen from the stored values, assets copied, one audit event.
-- Status (Q22): active trades become REVIEWED, Admin-deleted ones REVERSED
-- with their deletion reason. Deleted trades move too, so the league's audit
-- log keeps their history. Safe to re-run: only trades without a league are
-- touched.
create or replace function public.owner_move_pre_league_history(p_name text)
returns table (moved integer, moved_active integer, moved_deleted integer,
               league_active_trades integer, trades_without_league integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype := owner_find_league(p_name);
    v_trade trades%rowtype;
    v_snapshot jsonb;
    v_moved integer := 0;
    v_active integer := 0;
    v_deleted integer := 0;
begin
    -- One run at a time.
    perform pg_advisory_xact_lock(hashtextextended('pre-league-move', 0));

    for v_trade in
        select * from trades tr where tr.league_id is null order by tr.accepted_at for update
    loop
        v_snapshot := jsonb_build_object(
            'web_release', v_trade.web_release,
            'ruleset_version', v_trade.ruleset_version,
            'user_team_assets', v_trade.user_team_assets,
            'cpu_team_assets', v_trade.cpu_team_assets,
            'user_raw_value', v_trade.user_raw_value,
            'cpu_raw_value', v_trade.cpu_raw_value,
            'user_adjusted_value', v_trade.user_adjusted_value,
            'cpu_adjusted_value', v_trade.cpu_adjusted_value,
            'adjusted_gap', v_trade.adjusted_gap,
            'verdict', v_trade.verdict,
            'evaluation_mode', v_trade.evaluation_mode,
            'protection_tier', v_trade.protection_tier,
            'required_target', v_trade.required_target,
            'fair_maximum', v_trade.fair_maximum,
            'trade_intelligence', v_trade.trade_intelligence,
            'suggested_correction', v_trade.suggested_correction);

        update trades tr
        set league_id = v_league.id,
            is_pre_league = true,
            current_revision = 0,
            review_status = case when v_trade.deleted_at is null then 'REVIEWED' else 'REVERSED' end,
            reversal_reason = case when v_trade.deleted_at is null then null else coalesce(
                (select nullif(trim(a.reason), '') from audit_events a
                 where a.trade_id = v_trade.id and a.action = 'TRADE_DELETED'
                 order by a.occurred_at desc limit 1),
                'Deleted with the v1.x Admin') end
        where tr.id = v_trade.id;

        insert into trade_revisions (
            trade_id, revision, snapshot, web_release, ruleset_version, verdict,
            user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name, created_at
        )
        values (
            v_trade.id, 0, v_snapshot, v_trade.web_release, v_trade.ruleset_version, v_trade.verdict,
            v_trade.user_adjusted_value, v_trade.cpu_adjusted_value, 'MIGRATION', 'site owner',
            v_trade.accepted_at
        )
        on conflict (trade_id, revision) do nothing;

        if not exists (select 1 from trade_assets a where a.trade_id = v_trade.id and a.revision = 0) then
            perform insert_trade_assets(v_trade.id, 0, v_snapshot);
        end if;

        v_moved := v_moved + 1;
        if v_trade.deleted_at is null then v_active := v_active + 1; else v_deleted := v_deleted + 1; end if;
    end loop;

    if v_moved > 0 then
        perform owner_audit(v_league.id, 'PRE_LEAGUE_MIGRATION', null, jsonb_build_object(
            'moved', v_moved, 'active', v_active, 'deleted', v_deleted));
    end if;

    return query select v_moved, v_active, v_deleted,
        (select count(*)::integer from trades tr where tr.league_id = v_league.id and tr.deleted_at is null),
        (select count(*)::integer from trades tr where tr.league_id is null);
end;
$$;

-- ============================================================
-- 8. Access: dashboard (postgres) only
-- ============================================================

revoke all on function public.owner_find_league(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_audit(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.owner_leagues() from public, anon, authenticated, service_role;
revoke all on function public.owner_create_league(text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_rename_league(text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_set_league_status(text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_set_commissioner_password(text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_rotate_import_secret(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_load_teams(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_set_team(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_teams(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_move_pre_league_history(text) from public, anon, authenticated, service_role;
