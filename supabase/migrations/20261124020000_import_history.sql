-- Madden League Trade Calculator
-- Import history (backend only; no Web Release; evidence for Ruleset v5.0)
-- Ruleset v4.4 and valuation.js remain unchanged. Nothing on the website reads these tables.
--
-- Every Snallabot roster and standings payload is copied into two small,
-- typed history tables as it arrives:
--   player_history  one row per player per roster payload (about 40 fields)
--   team_history    one row per team per standings payload
-- Players are keyed by Madden's rosterId, so a player can be followed across
-- weeks and trades. Every export is kept; the *_latest views pick the newest
-- export for each league week.
--
-- If building history ever fails, the payload is still stored (the receiver
-- catches the error and marks the payload FAILED); owner_build_import_history
-- re-runs it. Data dictionary: docs/roadmap/v5/V5_IMPORT_HISTORY.md

-- ============================================================
-- 1. Payload bookkeeping
-- ============================================================

alter table public.import_payloads
    add column history_status text,
    add column history_error text,
    add column history_built_at timestamptz,
    add constraint import_payloads_history_status_allowed check (
        history_status is null or history_status in ('DONE', 'FAILED')
    );

-- ============================================================
-- 2. History tables
-- ============================================================

create table public.player_history (
    payload_id uuid not null references public.import_payloads(id),
    roster_id bigint not null,                -- rosterId: stable player key
    league_id uuid not null references public.leagues(id),
    snapshot_id uuid not null references public.import_snapshots(id),
    received_at timestamptz not null,

    -- Identity and team
    team_id bigint,
    first_name text,
    last_name text,
    position text,                            -- Madden label (LT, MIKE, ...); see v44_position()
    jersey_num integer,

    -- v4.4 inputs
    ovr integer,                              -- playerBestOvr
    age integer,
    dev_trait integer,                        -- 0 Normal, 1 Star, 2 Superstar, 3 X-Factor
    years_pro integer,
    cap_hit integer,                          -- units of $10,000 (÷100 = $M)
    contract_years_left integer,              -- 0 = expiring / none

    -- Status
    is_on_practice_squad boolean,
    is_on_ir boolean,
    is_active boolean,
    is_free_agent boolean,

    -- Development
    scheme_ovr integer,                       -- playerSchemeOvr
    experience_points integer,
    skill_points integer,
    legacy_score integer,

    -- Durability
    injury_rating integer,
    injury_type integer,
    injury_length integer,                    -- weeks; 0 = healthy

    -- Aging (physical ratings)
    speed integer,
    acceleration integer,
    agility integer,
    strength integer,
    awareness integer,
    stamina integer,
    toughness integer,
    height integer,                           -- inches
    weight integer,                           -- pounds
    birth_year integer,
    birth_month integer,
    birth_day integer,

    -- Contract / cap efficiency (raw Madden units)
    contract_length integer,
    contract_salary bigint,                   -- dollars, contract total
    contract_bonus bigint,                    -- dollars, contract total
    cap_release_penalty integer,              -- units of $10,000
    cap_release_net_savings bigint,           -- dollars
    re_sign_status integer,

    primary key (payload_id, roster_id)
);

create index player_history_player_idx
    on public.player_history (league_id, roster_id, received_at desc);
create index player_history_snapshot_idx
    on public.player_history (snapshot_id);

create table public.team_history (
    payload_id uuid not null references public.import_payloads(id),
    team_id bigint not null,
    league_id uuid not null references public.leagues(id),
    snapshot_id uuid not null references public.import_snapshots(id),
    received_at timestamptz not null,

    team_name text,
    division_name text,
    conference_name text,

    season integer,                           -- calendarYear
    season_index integer,
    stage_index integer,                      -- 1 = regular season
    week integer,                             -- weekIndex + 1

    wins integer,
    losses integer,
    ties integer,
    win_pct numeric,
    rank integer,
    prev_rank integer,
    seed integer,
    playoff_status integer,
    streak_raw integer,                       -- winLossStreak as sent (single byte)
    streak integer,                           -- decoded: +N wins, -N losses, 0 none
    team_ovr integer,

    pts_for integer,
    pts_against integer,
    net_pts integer,
    turnover_diff integer,

    cap_room bigint,                          -- dollars
    cap_spent bigint,
    cap_available bigint,

    primary key (payload_id, team_id)
);

create index team_history_team_idx
    on public.team_history (league_id, team_id, received_at desc);

-- ============================================================
-- 3. Helpers
-- ============================================================

create or replace function public.import_int(p jsonb, k text)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
    select case when jsonb_typeof(p -> k) = 'number' and (p ->> k) ~ '^-?[0-9]+$'
                then (p ->> k)::bigint end;
$$;

create or replace function public.import_bool(p jsonb, k text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
    select case when jsonb_typeof(p -> k) = 'boolean' then (p ->> k)::boolean end;
$$;

-- Madden position label -> Ruleset v4.4 position. LS has none yet (Q decided: v5.0).
create or replace function public.v44_position(p_position text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select case upper(p_position)
        when 'LT' then 'OT' when 'RT' then 'OT'
        when 'LG' then 'IOL' when 'RG' then 'IOL' when 'C' then 'IOL'
        when 'LEDG' then 'EDGE' when 'REDG' then 'EDGE'
        when 'MIKE' then 'LB' when 'WILL' then 'LB' when 'SAM' then 'LB'
        when 'FS' then 'S' when 'SS' then 'S'
        when 'QB' then 'QB' when 'HB' then 'HB' when 'FB' then 'FB'
        when 'WR' then 'WR' when 'TE' then 'TE' when 'DT' then 'DT'
        when 'CB' then 'CB' when 'K' then 'K' when 'P' then 'P'
    end;
$$;

-- winLossStreak is one unsigned byte holding a signed value: 1-127 wins, 255 = 1 loss.
create or replace function public.decode_streak(p_raw integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
    select case when p_raw is null or p_raw < 0 or p_raw > 255 then null
                when p_raw > 127 then p_raw - 256
                else p_raw end;
$$;

-- ============================================================
-- 4. Build history for one payload (idempotent)
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

    else
        return 0;   -- other routes are not part of history (game stats: not now)
    end if;

    update import_payloads
    set history_status = 'DONE', history_error = null, history_built_at = now()
    where id = p_payload_id;

    return v_rows;
end;
$$;

-- ============================================================
-- 5. Receiver: same as 20261122070000, plus history on arrival
-- ============================================================

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
    if v_inserted = 1 and (p_route ~ '^team/[0-9]+/roster$' or p_route = 'standings') then
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

-- ============================================================
-- 6. Views for v5.0 analysis (dashboard / SQL editor only)
-- ============================================================

-- Players with the export's season/week and the v4.4 reading of each field.
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
    nullif(h.contract_years_left, 0) as v44_years_left
from public.player_history h
join public.import_snapshots s on s.id = h.snapshot_id;

-- The newest export of each league week, per player.
create or replace view public.player_history_latest
with (security_invoker = true)
as
select distinct on (league_id, season, stage_index, week, roster_id) *
from public.player_history_view
order by league_id, season, stage_index, week, roster_id, received_at desc;

-- The newest export of each league week, per team.
create or replace view public.team_history_latest
with (security_invoker = true)
as
select distinct on (league_id, season, stage_index, week, team_id) *
from public.team_history
order by league_id, season, stage_index, week, team_id, received_at desc;

-- ============================================================
-- 7. Owner commands (Supabase dashboard)
-- ============================================================

-- Backfill / repair: builds history for every stored roster and standings
-- payload of a league that has none yet (or failed). Safe to run again.
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
          and (p.route ~ '^team/[0-9]+/roster$' or p.route = 'standings')
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

-- One row per export: what history holds for it.
create or replace function public.owner_import_history(p_name text)
returns table (
    received timestamptz,
    season integer,
    stage_index integer,
    week integer,
    roster_payloads integer,
    players integer,
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
        (select count(*)::integer from player_history h where h.snapshot_id = s.id),
        (select count(*)::integer from team_history h where h.snapshot_id = s.id),
        (select count(*)::integer from import_payloads p
          where p.snapshot_id = s.id and p.history_status = 'FAILED'),
        (select count(*)::integer from import_payloads p
          where p.snapshot_id = s.id and p.history_status is null
            and (p.route ~ '^team/[0-9]+/roster$' or p.route = 'standings'))
    from import_snapshots s
    where s.league_id = (owner_find_league(p_name)).id
    order by s.first_received_at desc;
$$;

-- ============================================================
-- 8. Access: no browser access; history is service role + dashboard only
-- ============================================================

alter table public.player_history enable row level security;
alter table public.team_history enable row level security;

revoke all on table public.player_history, public.team_history from anon, authenticated;
revoke all on table public.player_history_view, public.player_history_latest, public.team_history_latest
    from anon, authenticated;
grant select on table public.player_history, public.team_history,
    public.player_history_view, public.player_history_latest, public.team_history_latest
    to service_role;
grant insert, update, delete on table public.player_history, public.team_history to service_role;

revoke all on function public.build_payload_history(uuid) from public, anon, authenticated;
grant execute on function public.build_payload_history(uuid) to service_role;

revoke all on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    from public, anon, authenticated;
grant execute on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    to service_role;

revoke all on function public.owner_build_import_history(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_import_history(text) from public, anon, authenticated, service_role;
