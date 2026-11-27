-- Madden League Trade Calculator
-- Free agents and roster status (backend only; no Web Release).
-- Ruleset v4.4, valuation.js and stored trades are unchanged.
--
-- * The free-agent list (freeagents/roster) is saved into player_history like a
--   roster with no team (team_id null, is_free_agent true). Stored exports are
--   backfilled when this is applied.
-- * roster_status everywhere: ROSTER, PRACTICE SQUAD, IR or FREE AGENT.
-- * Roster moves show each side's status, include signings (free agent -> team)
--   and releases (team -> free agent), and add contract_changed for team-to-team
--   moves: a traded player normally keeps his contract, a new signing doesn't
--   (a hint, not proof). Only team-to-team moves can be LOGGED / NOT LOGGED, so
--   signings and releases are never flagged by check_this.
-- Guide: docs/roadmap/v5/V5_TRADE_LEDGER.md (Checks), V5_IMPORT_HISTORY.md

-- ============================================================
-- 1. Roster status
-- ============================================================

create or replace function public.player_status(
    p_team_id bigint, p_is_free_agent boolean, p_is_on_ir boolean, p_is_on_practice_squad boolean
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when p_team_id is null or p_is_free_agent then 'FREE AGENT'
        when p_is_on_ir then 'IR'
        when p_is_on_practice_squad then 'PRACTICE SQUAD'
        else 'ROSTER'
    end;
$$;


-- ============================================================
-- 2. History build: free agents are saved like a roster with no team
-- ============================================================

create or replace function public.build_payload_history(p_payload_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payload import_payloads%rowtype;
    v_league_id uuid;
    v_route_team bigint;
    v_rows integer := 0;
begin
    select * into v_payload from import_payloads where id = p_payload_id;
    if not found then
        raise exception using errcode = 'P0002', message = 'No such payload.';
    end if;
    if v_payload.body is null then
        raise exception using errcode = '22023',
            message = 'Payload body was trimmed by retention; history cannot be built.';
    end if;

    select s.league_id into v_league_id from import_snapshots s where s.id = v_payload.snapshot_id;

    if v_payload.route ~ '^team/[0-9]+/roster$' or v_payload.route = 'freeagents/roster' then
        v_route_team := substring(v_payload.route from '^team/([0-9]+)/roster$')::bigint;

        -- A team roster must have a player list; a missing free-agent list means none.
        if v_payload.route <> 'freeagents/roster'
           and jsonb_typeof(v_payload.body -> 'rosterInfoList') is distinct from 'array' then
            raise exception using errcode = '22023', message = 'Roster payload has no rosterInfoList.';
        end if;

        delete from player_history where payload_id = p_payload_id;

        insert into player_history (
            payload_id, roster_id, league_id, snapshot_id, received_at,
            team_id, first_name, last_name, position, jersey_num,
            ovr, age, dev_trait, years_pro, cap_hit, contract_years_left,
            is_on_practice_squad, is_on_ir, is_active, is_free_agent,
            scheme_ovr, experience_points, skill_points, legacy_score,
            injury_rating, injury_type, injury_length,
            speed, acceleration, agility, strength, awareness, stamina, toughness,
            height, weight, birth_year, birth_month, birth_day,
            contract_length, contract_salary, contract_bonus,
            cap_release_penalty, cap_release_net_savings, re_sign_status
        )
        select distinct on (import_int(p, 'rosterId'))
            p_payload_id, import_int(p, 'rosterId'), v_league_id, v_payload.snapshot_id, v_payload.received_at,
            case when v_payload.route = 'freeagents/roster' then null
                 else coalesce(import_int(p, 'teamId'), v_route_team) end,
            left(p ->> 'firstName', 60), left(p ->> 'lastName', 60), left(p ->> 'position', 8),
            import_int(p, 'jerseyNum'),
            import_int(p, 'playerBestOvr'), import_int(p, 'age'), import_int(p, 'devTrait'),
            import_int(p, 'yearsPro'), import_int(p, 'capHit'), import_int(p, 'contractYearsLeft'),
            import_bool(p, 'isOnPracticeSquad'), import_bool(p, 'isOnIR'),
            import_bool(p, 'isActive'),
            case when v_payload.route = 'freeagents/roster' then true else import_bool(p, 'isFreeAgent') end,
            import_int(p, 'playerSchemeOvr'), import_int(p, 'experiencePoints'),
            import_int(p, 'skillPoints'), import_int(p, 'legacyScore'),
            import_int(p, 'injuryRating'), import_int(p, 'injuryType'), import_int(p, 'injuryLength'),
            import_int(p, 'speedRating'), import_int(p, 'accelRating'), import_int(p, 'agilityRating'),
            import_int(p, 'strengthRating'), import_int(p, 'awareRating'), import_int(p, 'staminaRating'),
            import_int(p, 'toughRating'),
            import_int(p, 'height'), import_int(p, 'weight'),
            import_int(p, 'birthYear'), import_int(p, 'birthMonth'), import_int(p, 'birthDay'),
            import_int(p, 'contractLength'), import_int(p, 'contractSalary'), import_int(p, 'contractBonus'),
            import_int(p, 'capReleasePenalty'), import_int(p, 'capReleaseNetSavings'),
            import_int(p, 'reSignStatus')
        from jsonb_array_elements(v_payload.body -> 'rosterInfoList') p
        where jsonb_typeof(p) = 'object' and import_int(p, 'rosterId') is not null;

        get diagnostics v_rows = row_count;

    elsif v_payload.route = 'standings' then
        if jsonb_typeof(v_payload.body -> 'teamStandingInfoList') <> 'array' then
            raise exception using errcode = '22023', message = 'Standings payload has no teamStandingInfoList.';
        end if;

        delete from team_history where payload_id = p_payload_id;

        insert into team_history (
            payload_id, team_id, league_id, snapshot_id, received_at,
            team_name, division_name, conference_name,
            season, season_index, stage_index, week,
            wins, losses, ties, win_pct, rank, prev_rank, seed, playoff_status,
            streak_raw, streak, team_ovr,
            pts_for, pts_against, net_pts, turnover_diff,
            cap_room, cap_spent, cap_available
        )
        select distinct on (import_int(s, 'teamId'))
            p_payload_id, import_int(s, 'teamId'), v_league_id, v_payload.snapshot_id, v_payload.received_at,
            left(s ->> 'teamName', 60), left(s ->> 'divisionName', 60), left(s ->> 'conferenceName', 20),
            import_int(s, 'calendarYear'), import_int(s, 'seasonIndex'), import_int(s, 'stageIndex'),
            import_int(s, 'weekIndex') + 1,
            import_int(s, 'totalWins'), import_int(s, 'totalLosses'), import_int(s, 'totalTies'),
            case when jsonb_typeof(s -> 'winPct') = 'number' then (s ->> 'winPct')::numeric end,
            import_int(s, 'rank'), import_int(s, 'prevRank'), import_int(s, 'seed'),
            import_int(s, 'playoffStatus'),
            import_int(s, 'winLossStreak'), decode_streak(import_int(s, 'winLossStreak')::integer),
            import_int(s, 'teamOvr'),
            import_int(s, 'ptsFor'), import_int(s, 'ptsAgainst'), import_int(s, 'netPts'), import_int(s, 'tODiff'),
            import_int(s, 'capRoom'), import_int(s, 'capSpent'), import_int(s, 'capAvailable')
        from jsonb_array_elements(v_payload.body -> 'teamStandingInfoList') s
        where jsonb_typeof(s) = 'object' and import_int(s, 'teamId') is not null;

        get diagnostics v_rows = row_count;

    elsif v_payload.route = 'leagueteams' then
        v_rows := map_league_team_ids(p_payload_id);

    else
        return 0;   -- other routes are not part of history (game stats: not now)
    end if;

    update import_payloads
    set history_status = 'DONE', history_error = null, history_built_at = now()
    where id = p_payload_id;

    return v_rows;
end;
$$;

-- Receiver: same as 20261125010000, plus the free-agent list.
create or replace function public.record_snallabot_payload(
    p_secret_sha256 text,
    p_platform text,
    p_external_league_id bigint,
    p_route text,
    p_body jsonb,
    p_body_sha256 text,
    p_content_length integer
)
returns table (
    snapshot_id uuid,
    snapshot_status text,
    is_duplicate boolean,
    request_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league public.leagues%rowtype;
    v_snapshot_id uuid;
    v_payload_id uuid;
    v_inserted integer;
    v_new_snapshot boolean := false;
begin
    select * into v_league
    from leagues l
    where l.import_secret_sha256 = lower(p_secret_sha256)
      and l.status = 'ACTIVE';

    if not found then
        raise exception using errcode = 'P0002', message = 'Unknown import URL.';
    end if;

    if v_league.external_league_id is not null
       and v_league.external_league_id <> p_external_league_id then
        raise exception using errcode = '22023',
            message = 'This import URL belongs to a different league.';
    end if;

    -- Serialize requests for one league so a parallel burst can't open two snapshots.
    perform pg_advisory_xact_lock(hashtextextended(v_league.id::text, 0));

    if v_league.external_league_id is null or v_league.platform_label is null then
        update leagues
        set external_league_id = coalesce(external_league_id, p_external_league_id),
            platform_label = coalesce(platform_label, p_platform)
        where id = v_league.id;
    end if;

    select s.id into v_snapshot_id
    from import_snapshots s
    where s.league_id = v_league.id
      and s.status = 'RECEIVING'
      and s.last_received_at > now() - interval '10 minutes';

    if v_snapshot_id is null then
        update import_snapshots s
        set status = 'RECEIVED'
        where s.league_id = v_league.id and s.status = 'RECEIVING';

        insert into import_snapshots (league_id, source, platform_label, external_league_id)
        values (v_league.id, 'SNALLABOT', p_platform, p_external_league_id)
        returning id into v_snapshot_id;

        v_new_snapshot := true;
    end if;

    insert into import_payloads (snapshot_id, route, content_length, body_sha256, body)
    values (v_snapshot_id, p_route, p_content_length, lower(p_body_sha256), p_body)
    on conflict on constraint import_payloads_snapshot_id_route_body_sha256_key do nothing
    returning id into v_payload_id;

    get diagnostics v_inserted = row_count;

    update import_snapshots s
    set last_received_at = now(),
        request_count = s.request_count + 1,
        duplicate_count = s.duplicate_count + case when v_inserted = 0 then 1 else 0 end,
        total_bytes = s.total_bytes + case when v_inserted = 1 then p_content_length else 0 end
    where s.id = v_snapshot_id;

    perform refresh_import_diagnostics(v_snapshot_id);

    -- History never blocks an export: any error is recorded on the payload
    -- and the export is still stored. owner_build_import_history re-runs it.
    if v_inserted = 1 and (p_route ~ '^team/[0-9]+/roster$' or p_route in ('standings', 'leagueteams', 'freeagents/roster')) then
        begin
            perform build_payload_history(v_payload_id);
        exception when others then
            update import_payloads
            set history_status = 'FAILED', history_error = left(sqlerrm, 500), history_built_at = now()
            where id = v_payload_id;
        end;
    end if;

    if v_new_snapshot then
        perform trim_import_payloads(v_league.id, v_league.import_keep_full_snapshots);
    end if;

    return query
    select s.id, s.status, v_inserted = 0, s.request_count
    from import_snapshots s
    where s.id = v_snapshot_id;
end;
$$;

create or replace function public.owner_build_import_history(p_name text)
returns table (payloads_built integer, payloads_failed integer, players integer, teams integer, skipped_trimmed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_p record;
    v_built integer := 0;
    v_failed integer := 0;
begin
    v_league := owner_find_league(p_name);

    for v_p in
        select p.id
        from import_payloads p
        join import_snapshots s on s.id = p.snapshot_id
        where s.league_id = v_league.id
          and p.body is not null
          and (p.route ~ '^team/[0-9]+/roster$' or p.route in ('standings', 'leagueteams', 'freeagents/roster'))
          and (p.history_status is null or p.history_status = 'FAILED')
        order by p.received_at
    loop
        begin
            perform build_payload_history(v_p.id);
            v_built := v_built + 1;
        exception when others then
            update import_payloads
            set history_status = 'FAILED', history_error = left(sqlerrm, 500), history_built_at = now()
            where id = v_p.id;
            v_failed := v_failed + 1;
        end;
    end loop;

    return query select
        v_built,
        v_failed,
        (select count(*)::integer from player_history h where h.league_id = v_league.id),
        (select count(*)::integer from team_history h where h.league_id = v_league.id),
        (select count(*)::integer from import_payloads p join import_snapshots s on s.id = p.snapshot_id
          where s.league_id = v_league.id and p.body is null
            and (p.history_status is null or p.history_status = 'FAILED')
            and (p.route ~ '^team/[0-9]+/roster$' or p.route in ('standings', 'freeagents/roster')));
end;
$$;

-- ============================================================
-- 3. Owner check: players on teams and free agents counted apart
-- ============================================================

drop function public.owner_import_history(text);

-- One row per export: what history holds for it.
create function public.owner_import_history(p_name text)
returns table (
    received timestamptz,
    season integer,
    stage_index integer,
    week integer,
    roster_payloads integer,
    players integer,
    free_agents integer,
    teams integer,
    failed integer,
    not_built integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        s.first_received_at,
        s.season,
        s.stage_index,
        s.week,
        (select count(*)::integer from import_payloads p
          where p.snapshot_id = s.id and p.route ~ '^team/[0-9]+/roster$'),
        (select count(*)::integer from player_history h where h.snapshot_id = s.id and h.team_id is not null),
        (select count(*)::integer from player_history h where h.snapshot_id = s.id and h.team_id is null),
        (select count(*)::integer from team_history h where h.snapshot_id = s.id),
        (select count(*)::integer from import_payloads p
          where p.snapshot_id = s.id and p.history_status = 'FAILED'),
        (select count(*)::integer from import_payloads p
          where p.snapshot_id = s.id and p.history_status is null
            and (p.route ~ '^team/[0-9]+/roster$' or p.route in ('standings', 'freeagents/roster')))
    from import_snapshots s
    where s.league_id = (owner_find_league(p_name)).id
    order by s.first_received_at desc;
$$;

revoke all on function public.owner_import_history(text) from public, anon, authenticated, service_role;

-- ============================================================
-- 4. History views: roster status (ROSTER, PRACTICE SQUAD, IR, FREE AGENT)
-- ============================================================

create or replace view public.player_history_view
with (security_invoker = true)
as
select
    h.*,
    s.season,
    s.stage_index,
    s.week,
    v44_position(h.position) as v44_position,
    round(h.cap_hit / 100.0, 2) as cap_hit_m,
    nullif(h.contract_years_left, 0) as v44_years_left,
    league_team_of(h.league_id, h.team_id) as league_team_id,
    (select lt.abbreviation from public.league_teams lt where lt.id = league_team_of(h.league_id, h.team_id)) as team_abbr,
    player_status(h.team_id, h.is_free_agent, h.is_on_ir, h.is_on_practice_squad) as roster_status
from public.player_history h
join public.import_snapshots s on s.id = h.snapshot_id;

create or replace view public.player_history_latest
with (security_invoker = true)
as
select distinct on (league_id, season, stage_index, week, roster_id) *
from public.player_history_view
order by league_id, season, stage_index, week, roster_id, received_at desc;

-- ============================================================
-- 5. Roster moves: statuses, signings and releases, contract hint
-- ============================================================

create or replace view public.roster_moves
with (security_invoker = true)
as
with snaps as (
    select s.id, s.league_id, s.first_received_at, s.season, s.stage_index, s.week,
           lag(s.id) over w as prev_id,
           lag(s.first_received_at) over w as prev_received_at,
           lag(s.season) over w as prev_season,
           lag(s.week) over w as prev_week
    from import_snapshots s
    where s.season is not null
      and exists (select 1 from player_history h where h.snapshot_id = s.id)
    window w as (partition by s.league_id order by s.first_received_at)
),
players as (
    select distinct on (h.snapshot_id, h.roster_id)
        h.snapshot_id, h.roster_id, h.team_id, h.first_name, h.last_name, h.position, h.ovr,
        player_status(h.team_id, h.is_free_agent, h.is_on_ir, h.is_on_practice_squad) as roster_status,
        h.contract_length, h.contract_salary, h.contract_bonus
    from player_history h
    -- A player on a team roster and the free-agent list in one export: the team wins.
    order by h.snapshot_id, h.roster_id, (h.team_id is null), h.received_at desc
),
moves as (
    select
        sn.league_id, sn.prev_id as from_snapshot_id, sn.id as to_snapshot_id,
        sn.prev_received_at, sn.first_received_at as received_at,
        sn.prev_season, sn.prev_week, sn.season, sn.stage_index, sn.week,
        b.roster_id,
        trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')) as player,
        v44_position(b.position) as position,
        b.ovr,
        league_team_of(sn.league_id, a.team_id) as from_team_id,
        league_team_of(sn.league_id, b.team_id) as to_team_id,
        a.roster_status as from_status,
        b.roster_status as to_status,
        case when a.team_id is null or b.team_id is null then null
             else (a.contract_length, a.contract_salary, a.contract_bonus)
                  is distinct from (b.contract_length, b.contract_salary, b.contract_bonus) end as contract_changed
    from snaps sn
    join players a on a.snapshot_id = sn.prev_id
    join players b on b.snapshot_id = sn.id and b.roster_id = a.roster_id
    where sn.prev_id is not null
      -- Same league team under a new Madden ID is not a move.
      and coalesce(league_team_of(sn.league_id, a.team_id)::text, 'madden:' || a.team_id)
          is distinct from coalesce(league_team_of(sn.league_id, b.team_id)::text, 'madden:' || b.team_id)
)
select
    m.league_id,
    m.prev_season as from_season,
    m.prev_week as from_week,
    m.season as to_season,
    m.week as to_week,
    m.received_at,
    m.roster_id,
    m.player,
    m.position,
    m.ovr,
    ft.abbreviation as from_team,
    tt.abbreviation as to_team,
    (select min(l.trade_number) from trade_ledger l
      where l.league_id = m.league_id and l.roster_id = m.roster_id
        and l.from_team_id = ft.id and l.to_team_id = tt.id
        and l.accepted_at <= m.received_at + interval '7 days'
        and l.accepted_at >= m.prev_received_at - interval '30 days') as logged_trade_number,
    case when m.from_status = 'FREE AGENT' then 'SIGNING'
         when m.to_status = 'FREE AGENT' then 'RELEASE'
         when exists (
        select 1 from trade_ledger l
        where l.league_id = m.league_id and l.roster_id = m.roster_id
          and l.from_team_id = ft.id and l.to_team_id = tt.id
          and l.accepted_at <= m.received_at + interval '7 days'
          and l.accepted_at >= m.prev_received_at - interval '30 days')
         then 'LOGGED' else 'NOT LOGGED' end as status,
    m.from_snapshot_id,
    m.to_snapshot_id,
    m.from_status,
    m.to_status,
    m.contract_changed,
    m.from_team_id,
    m.to_team_id
from moves m
left join league_teams ft on ft.id = m.from_team_id
left join league_teams tt on tt.id = m.to_team_id;

-- ============================================================
-- 6. Owner: roster moves with statuses
-- ============================================================

drop function public.owner_roster_moves(text);

create function public.owner_roster_moves(p_name text)
returns table (
    to_season integer, from_week integer, to_week integer, player text, pos text, ovr integer,
    from_team text, from_status text, from_control text, to_team text, to_status text, to_control text,
    status text, check_this boolean, contract_changed boolean, logged_trade_number bigint, roster_id bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
begin
    v_league := owner_find_league(p_name);
    perform ledger_refresh(v_league.id);
    return query
    select m.to_season, m.from_week, m.to_week, m.player, m.position, m.ovr,
           m.from_team, m.from_status, ft.controlled_by, m.to_team, m.to_status, tt.controlled_by,
           m.status,
           m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER'),
           m.contract_changed,
           m.logged_trade_number, m.roster_id
    from roster_moves m
    left join league_teams ft on ft.id = m.from_team_id
    left join league_teams tt on tt.id = m.to_team_id
    where m.league_id = v_league.id
    order by m.received_at desc,
             (m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER')) desc,
             (m.status in ('SIGNING', 'RELEASE')), m.status desc, m.player;
end;
$$;

revoke all on function public.owner_roster_moves(text) from public, anon, authenticated, service_role;

-- ============================================================
-- 7. Backfill: free-agent lists of stored exports, oldest first
-- ============================================================

do $$
declare
    r record;
begin
    for r in
        select p.id from public.import_payloads p
        where p.route = 'freeagents/roster' and p.body is not null and p.history_status is null
        order by p.received_at
    loop
        begin
            perform public.build_payload_history(r.id);
        exception when others then
            update public.import_payloads
            set history_status = 'FAILED', history_error = left(sqlerrm, 500), history_built_at = now()
            where id = r.id;
        end;
    end loop;
end;
$$;

revoke all on function public.player_status(bigint, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.player_status(bigint, boolean, boolean, boolean) to service_role;

