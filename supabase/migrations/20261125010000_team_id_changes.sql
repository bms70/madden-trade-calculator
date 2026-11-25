-- Madden League Trade Calculator
-- Team ID changes (backend only; no Web Release). Fix for import history and the
-- transaction ledger. Ruleset v4.4, valuation.js and stored trades are unchanged.
--
-- Found 2026-11-24: the week 8 export arrived with a new Madden teamId for all
-- 32 teams (same league). History and the ledger compared raw team IDs, so every
-- player looked like he changed teams, and owner_load_teams would have tried to
-- add 32 "new" teams. Now:
--   * league_team_external_ids records every Madden team ID each league team has
--     had. A team list is matched to existing teams by known ID, then by
--     abbreviation, then by city + nickname.
--   * The newest team list moves league_teams.external_team_id to the current ID.
--   * History views, the ledger and roster moves compare league teams.
-- Guide: docs/roadmap/v5/V5_IMPORT_HISTORY.md (Team IDs)

-- ============================================================
-- 1. Every Madden team ID a league team has had
-- ============================================================

create table public.league_team_external_ids (
    league_id uuid not null references public.leagues(id),
    external_team_id bigint not null,
    league_team_id uuid not null,
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,

    primary key (league_id, external_team_id),
    foreign key (league_id, league_team_id) references public.league_teams (league_id, id)
);

create index league_team_external_ids_team_idx
    on public.league_team_external_ids (league_team_id);

-- The league team for a Madden team ID (any ID it has had), or null.
create or replace function public.league_team_of(p_league_id uuid, p_ext bigint)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
    select coalesce(
        (select m.league_team_id from public.league_team_external_ids m
          where m.league_id = p_league_id and m.external_team_id = p_ext),
        (select lt.id from public.league_teams lt
          where lt.league_id = p_league_id and lt.external_team_id = p_ext));
$$;

-- ============================================================
-- 2. Record a team list's IDs
-- ============================================================

-- Matches each team in a leagueteams payload to an existing league team (known
-- ID, then abbreviation, then city + nickname) and records the ID. If this is
-- the league's newest team list, league_teams.external_team_id moves to it.
-- Teams that match nothing are skipped (owner_load_teams adds new teams).
create or replace function public.map_league_team_ids(p_payload_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payload import_payloads%rowtype;
    v_league uuid;
    v_newest boolean;
    v_t jsonb;
    v_ext bigint;
    v_team uuid;
    v_count integer := 0;
begin
    select * into v_payload from import_payloads where id = p_payload_id;
    if not found or v_payload.route <> 'leagueteams' then
        raise exception using errcode = '22023', message = 'Not a team list payload.';
    end if;
    if v_payload.body is null then
        raise exception using errcode = '22023',
            message = 'Payload body was trimmed by retention; history cannot be built.';
    end if;
    if jsonb_typeof(v_payload.body -> 'leagueTeamInfoList') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'Team list payload has no leagueTeamInfoList.';
    end if;

    select s.league_id into v_league from import_snapshots s where s.id = v_payload.snapshot_id;

    v_newest := not exists (
        select 1 from import_payloads p
        join import_snapshots s on s.id = p.snapshot_id
        where s.league_id = v_league and p.route = 'leagueteams'
          and p.received_at > v_payload.received_at);

    for v_t in select value from jsonb_array_elements(v_payload.body -> 'leagueTeamInfoList') loop
        v_ext := import_int(v_t, 'teamId');
        continue when v_ext is null;

        v_team := null;
        select m.league_team_id into v_team from league_team_external_ids m
        where m.league_id = v_league and m.external_team_id = v_ext;
        if v_team is null then
            select lt.id into v_team from league_teams lt
            where lt.league_id = v_league and lt.external_team_id = v_ext;
        end if;
        if v_team is null then
            select lt.id into v_team from league_teams lt
            where lt.league_id = v_league
              and upper(lt.abbreviation) = upper(trim(coalesce(v_t ->> 'abbrName', '')));
        end if;
        if v_team is null then
            select lt.id into v_team from league_teams lt
            where lt.league_id = v_league
              and lower(lt.city_name) = lower(trim(coalesce(v_t ->> 'cityName', '')))
              and lower(lt.nickname) = lower(trim(coalesce(nullif(v_t ->> 'nickName', ''), v_t ->> 'displayName', '')))
            limit 1;
        end if;
        continue when v_team is null;

        insert into league_team_external_ids (league_id, external_team_id, league_team_id, first_seen_at, last_seen_at)
        values (v_league, v_ext, v_team, v_payload.received_at, v_payload.received_at)
        on conflict (league_id, external_team_id) do update
        set first_seen_at = least(league_team_external_ids.first_seen_at, excluded.first_seen_at),
            last_seen_at = greatest(league_team_external_ids.last_seen_at, excluded.last_seen_at);

        if v_newest then
            update league_teams set external_team_id = null, updated_at = now()
            where league_id = v_league and external_team_id = v_ext and id <> v_team;
            update league_teams set external_team_id = v_ext, updated_at = now()
            where id = v_team and external_team_id is distinct from v_ext;
        end if;

        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;


-- ============================================================
-- 3. History build: leagueteams payloads now record team IDs
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

    if v_payload.route ~ '^team/[0-9]+/roster$' then
        v_route_team := substring(v_payload.route from '^team/([0-9]+)/roster$')::bigint;

        if jsonb_typeof(v_payload.body -> 'rosterInfoList') <> 'array' then
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
            coalesce(import_int(p, 'teamId'), v_route_team),
            left(p ->> 'firstName', 60), left(p ->> 'lastName', 60), left(p ->> 'position', 8),
            import_int(p, 'jerseyNum'),
            import_int(p, 'playerBestOvr'), import_int(p, 'age'), import_int(p, 'devTrait'),
            import_int(p, 'yearsPro'), import_int(p, 'capHit'), import_int(p, 'contractYearsLeft'),
            import_bool(p, 'isOnPracticeSquad'), import_bool(p, 'isOnIR'),
            import_bool(p, 'isActive'), import_bool(p, 'isFreeAgent'),
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

-- Receiver: same as 20261124020000, plus leagueteams payloads.
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
    if v_inserted = 1 and (p_route ~ '^team/[0-9]+/roster$' or p_route in ('standings', 'leagueteams')) then
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
          and (p.route ~ '^team/[0-9]+/roster$' or p.route in ('standings', 'leagueteams'))
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
            and (p.route ~ '^team/[0-9]+/roster$' or p.route = 'standings'));
end;
$$;

-- ============================================================
-- 4. Owner: load teams (same as 20261122170000, mapping IDs first)
-- ============================================================

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
    -- Madden can hand out new team IDs. Record the newest list's IDs against the
    -- existing teams first (by abbreviation), so they're updated, not re-added.
    perform map_league_team_ids(p.id)
    from import_payloads p
    join import_snapshots s on s.id = p.snapshot_id
    where s.league_id = v_league.id and p.route = 'leagueteams' and p.body is not null
    order by p.received_at desc
    limit 1;

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

-- ============================================================
-- 5. History views: the league's own team (stable across ID changes)
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
    (select lt.abbreviation from public.league_teams lt where lt.id = league_team_of(h.league_id, h.team_id)) as team_abbr
from public.player_history h
join public.import_snapshots s on s.id = h.snapshot_id;

create or replace view public.player_history_latest
with (security_invoker = true)
as
select distinct on (league_id, season, stage_index, week, roster_id) *
from public.player_history_view
order by league_id, season, stage_index, week, roster_id, received_at desc;

create or replace view public.team_history_latest
with (security_invoker = true)
as
select distinct on (h.league_id, h.season, h.stage_index, h.week, h.team_id) h.*,
    league_team_of(h.league_id, h.team_id) as league_team_id,
    (select lt.abbreviation from public.league_teams lt where lt.id = league_team_of(h.league_id, h.team_id)) as team_abbr
from public.team_history h
order by h.league_id, h.season, h.stage_index, h.week, h.team_id, h.received_at desc;

-- ============================================================
-- 6. Ledger: compare league teams, not raw Madden IDs
-- ============================================================

drop function public.ledger_match_on_team(uuid, bigint, text, text, integer, integer);

create or replace function public.ledger_match_on_team(
    p_snapshot_id uuid, p_league_team_id uuid,
    p_name text, p_pos text, p_ovr integer, p_age integer
)
returns table (roster_id bigint, match_status text, match_method text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_key text := ledger_name_key(p_name);
    v_ids bigint[];
begin
    create temp table if not exists ledger_roster (
        roster_id bigint, full_key text, last_key text, first_initial text,
        v44_position text, ovr integer, age integer
    ) on commit drop;
    truncate ledger_roster;

    insert into ledger_roster
    select distinct on (h.roster_id)
        h.roster_id,
        ledger_name_key(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')),
        ledger_name_key(h.last_name),
        left(ledger_name_key(h.first_name), 1),
        v44_position(h.position), h.ovr, h.age
    from player_history h
    where h.snapshot_id = p_snapshot_id and league_team_of(h.league_id, h.team_id) = p_league_team_id
    order by h.roster_id, h.received_at desc;

    if v_key is not null then
        -- Exact full name
        select array_agg(r.roster_id) into v_ids from ledger_roster r where r.full_key = v_key;
        if cardinality(v_ids) > 1 and p_pos is not null then
            select array_agg(r.roster_id) into v_ids
            from ledger_roster r where r.full_key = v_key and r.v44_position = p_pos;
        end if;
        if cardinality(v_ids) = 1 then
            return query select v_ids[1], 'EXACT'::text, 'FULL_NAME'::text; return;
        elsif cardinality(v_ids) > 1 then
            return query select null::bigint, 'AMBIGUOUS'::text, 'FULL_NAME'::text; return;
        end if;

        -- Close: last name, initial + last name, or a small typo
        select array_agg(r.roster_id) into v_ids
        from ledger_roster r
        where r.last_key = v_key
           or r.first_initial || r.last_key = v_key
           or (length(v_key) >= 5 and ledger_levenshtein(r.full_key, v_key) <= 2);
        if cardinality(v_ids) > 1 and p_pos is not null then
            select array_agg(x) into v_ids
            from unnest(v_ids) x
            where exists (select 1 from ledger_roster r where r.roster_id = x and r.v44_position = p_pos);
        end if;
        if cardinality(v_ids) = 1 then
            return query select v_ids[1], 'CLOSE'::text, 'NAME_CLOSE'::text; return;
        elsif cardinality(v_ids) > 1 then
            return query select null::bigint, 'AMBIGUOUS'::text, 'NAME_CLOSE'::text; return;
        end if;
        return;
    end if;

    -- No name typed: position + OVR (+ age when given)
    if p_pos is not null and p_ovr is not null then
        select array_agg(r.roster_id) into v_ids
        from ledger_roster r
        where r.v44_position = p_pos and r.ovr = p_ovr and (p_age is null or r.age = p_age);
        if cardinality(v_ids) = 1 then
            return query select v_ids[1], 'CLOSE'::text, 'POS_OVR_AGE'::text; return;
        elsif cardinality(v_ids) > 1 then
            return query select null::bigint, 'AMBIGUOUS'::text, 'POS_OVR_AGE'::text; return;
        end if;
    end if;
end;
$$;

create or replace function public.ledger_refresh(p_league_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_a record;
    v_rid bigint;
    v_status text;
    v_method text;
    v_giving uuid;
    v_receiving uuid;
    v_snapshot uuid;
    v_from text;
    v_count integer := 0;
begin
    delete from trade_ledger_links k
    using trades t
    where t.id = k.trade_id and t.league_id = p_league_id
      and (k.set_by = 'auto' or k.revision <> t.current_revision or t.deleted_at is not null);

    for v_a in
        select a.trade_id, a.revision, a.side, a.position_in_side, a.name, a.pos, a.ovr, a.age,
               t.accepted_at,
               case when a.side = 'SUBMITTING' then t.other_team_id else t.submitting_team_id end as giving_team,
               case when a.side = 'SUBMITTING' then t.submitting_team_id else t.other_team_id end as receiving_team
        from trades t
        join trade_assets a on a.trade_id = t.id and a.revision = t.current_revision
        where t.league_id = p_league_id
          and t.deleted_at is null
          and t.submitting_team_id is not null
          and t.other_team_id is not null
          and a.asset_type = 'Player'
          and not exists (
              select 1 from trade_ledger_links k
              where k.trade_id = a.trade_id and k.revision = a.revision
                and k.side = a.side and k.position_in_side = a.position_in_side)
    loop
        v_snapshot := ledger_trade_snapshot(p_league_id, v_a.accepted_at);
        v_giving := v_a.giving_team;
        v_receiving := v_a.receiving_team;
        v_rid := null;
        v_status := null;
        v_method := null;
        v_from := null;

        if v_snapshot is not null and v_giving is not null then
            select m.roster_id, m.match_status, m.match_method into v_rid, v_status, v_method
            from ledger_match_on_team(v_snapshot, v_giving, v_a.name, v_a.pos, v_a.ovr, v_a.age) m;
            v_from := 'GIVING';
            -- Already moved in Madden before the export: look on the receiving roster.
            if v_status is null and v_receiving is not null then
                select m.roster_id, m.match_status, m.match_method into v_rid, v_status, v_method
                from ledger_match_on_team(v_snapshot, v_receiving, v_a.name, v_a.pos, v_a.ovr, v_a.age) m;
                v_from := 'RECEIVING';
            end if;
        end if;

        insert into trade_ledger_links (trade_id, revision, side, position_in_side,
            roster_id, match_status, match_method, matched_from, snapshot_id)
        values (v_a.trade_id, v_a.revision, v_a.side, v_a.position_in_side,
            v_rid,
            case when v_snapshot is null or v_giving is null then 'NO_DATA'
                 else coalesce(v_status, 'UNMATCHED') end,
            v_method,
            case when v_rid is not null then v_from end,
            v_snapshot);
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

create or replace view public.trade_ledger
with (security_invoker = true)
as
with base as (
    select
        t.league_id, t.id as trade_id, t.trade_number, t.accepted_at, t.review_status,
        t.current_revision as revision, t.is_pre_league,
        a.side, a.position_in_side,
        case when a.side = 'SUBMITTING' then 'S' else 'O' end || a.position_in_side as asset_ref,
        case when a.side = 'SUBMITTING' then t.other_team_id else t.submitting_team_id end as from_team_id,
        case when a.side = 'SUBMITTING' then t.submitting_team_id else t.other_team_id end as to_team_id,
        a.asset_type, a.name, a.pick, a.timing, a.pos, a.ovr, a.age, a.dev, a.cap_hit_m,
        a.years_remaining, a.value,
        ledger_trade_snapshot(t.league_id, t.accepted_at) as context_snapshot_id,
        k.roster_id, k.match_status, k.match_method, k.matched_from
    from trades t
    join trade_assets a on a.trade_id = t.id and a.revision = t.current_revision
    left join trade_ledger_links k
        on k.trade_id = a.trade_id and k.revision = a.revision
       and k.side = a.side and k.position_in_side = a.position_in_side
    where t.league_id is not null
      and t.deleted_at is null
      and t.submitting_team_id is not null
      and t.other_team_id is not null
),
keyed as (
    select trade_id, league_id, accepted_at, trade_number,
           least(from_team_id::text, to_team_id::text) || greatest(from_team_id::text, to_team_id::text) as team_pair,
           to_team_id::text || ':' || coalesce(
               ledger_name_key(name),
               lower(coalesce(pick, '') || '|' || coalesce(timing, '')),
               lower(coalesce(pos, '') || '|' || coalesce(ovr::text, '') || '|' || coalesce(age::text, ''))) as asset_key
    from base
),
sig as (
    select trade_id, league_id, accepted_at, trade_number, team_pair,
           array_agg(asset_key order by asset_key) as signature
    from keyed
    group by trade_id, league_id, accepted_at, trade_number, team_pair
)
select
    b.league_id,
    b.trade_number,
    b.trade_id,
    b.accepted_at,
    b.review_status,
    b.revision,
    b.is_pre_league,
    b.asset_ref,
    s.season,
    s.stage_index,
    s.week,
    ft.abbreviation as from_team,
    tt.abbreviation as to_team,
    b.from_team_id,
    b.to_team_id,
    b.asset_type,
    b.name,
    b.pick,
    b.timing,
    b.pos,
    b.ovr,
    b.age,
    b.dev,
    b.cap_hit_m,
    b.years_remaining,
    b.value,
    b.roster_id,
    b.match_status,
    b.match_method,
    b.matched_from,
    (select nullif(trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), '')
       from player_history h
      where h.snapshot_id = b.context_snapshot_id and h.roster_id = b.roster_id
      limit 1) as matched_player,
    (select max(d.trade_number)
       from sig me join sig d
         on d.league_id = me.league_id and d.team_pair = me.team_pair
        and d.signature = me.signature and d.trade_number < me.trade_number
        and abs(extract(epoch from (me.accepted_at - d.accepted_at))) <= 7 * 86400
      where me.trade_id = b.trade_id) as possible_duplicate_of,
    case
        when b.roster_id is null then null
        when exists (
            select 1 from player_history h
            join import_snapshots x on x.id = h.snapshot_id
            where h.league_id = b.league_id and h.roster_id = b.roster_id
              and league_team_of(h.league_id, h.team_id) = b.to_team_id
              and x.first_received_at >= coalesce(s.first_received_at, b.accepted_at)) then 'YES'
        when exists (
            select 1 from import_snapshots x
            where x.league_id = b.league_id and x.season is not null
              and x.first_received_at > b.accepted_at
              and exists (select 1 from player_history h where h.snapshot_id = x.id)) then 'NO'
        else 'PENDING'
    end as seen_in_game
from base b
left join import_snapshots s on s.id = b.context_snapshot_id
join league_teams ft on ft.id = b.from_team_id
join league_teams tt on tt.id = b.to_team_id;

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
        h.snapshot_id, h.roster_id, h.team_id, h.first_name, h.last_name, h.position, h.ovr
    from player_history h
    order by h.snapshot_id, h.roster_id, h.received_at desc
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
        league_team_of(sn.league_id, b.team_id) as to_team_id
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
    case when exists (
        select 1 from trade_ledger l
        where l.league_id = m.league_id and l.roster_id = m.roster_id
          and l.from_team_id = ft.id and l.to_team_id = tt.id
          and l.accepted_at <= m.received_at + interval '7 days'
          and l.accepted_at >= m.prev_received_at - interval '30 days')
         then 'LOGGED' else 'NOT LOGGED' end as status,
    m.from_snapshot_id,
    m.to_snapshot_id
from moves m
left join league_teams ft on ft.id = m.from_team_id
left join league_teams tt on tt.id = m.to_team_id;

-- ============================================================
-- 7. Seed: today's IDs, then every stored team list, oldest first
-- ============================================================

insert into public.league_team_external_ids (league_id, external_team_id, league_team_id, first_seen_at, last_seen_at)
select lt.league_id, lt.external_team_id, lt.id, lt.created_at, lt.created_at
from public.league_teams lt
where lt.external_team_id is not null
on conflict do nothing;

do $$
declare
    r record;
begin
    for r in
        select p.id from public.import_payloads p
        where p.route = 'leagueteams' and p.body is not null
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

-- ============================================================
-- 8. Access
-- ============================================================

alter table public.league_team_external_ids enable row level security;
revoke all on table public.league_team_external_ids from anon, authenticated;
grant select, insert, update, delete on table public.league_team_external_ids to service_role;

revoke all on function public.league_team_of(uuid, bigint) from public, anon, authenticated;
grant execute on function public.league_team_of(uuid, bigint) to service_role;
revoke all on function public.map_league_team_ids(uuid) from public, anon, authenticated;
grant execute on function public.map_league_team_ids(uuid) to service_role;
revoke all on function public.ledger_match_on_team(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ledger_match_on_team(uuid, uuid, text, text, integer, integer) to service_role;

