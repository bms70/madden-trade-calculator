-- Madden League Trade Calculator
-- Snallabot connection (backend only; Web Release v1.5.0 maintenance)
-- Ruleset v4.4 remains unchanged. No existing table or function is modified.
--
-- Stores every Snallabot export as received: one import snapshot per export
-- burst, raw payloads kept, a health check per snapshot, and a retention rule.
-- Design: docs/roadmap/v5/V5_SNALLABOT_CONNECTION.md
--
-- The league name and the import secret are never written in this file. The
-- site owner creates the league row with docs/roadmap/v5/sql/connect-snallabot.sql.

-- ============================================================
-- Leagues (minimal; Web v2.0 extends this table)
-- ============================================================

create table public.leagues (
    id uuid primary key default gen_random_uuid(),

    name text not null,
    name_key text generated always as (
        lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
    ) stored,

    madden_version text not null default 'Madden 27',

    -- Opaque labels from the import path: /<secret>/<platform>/<leagueId>/<route>.
    platform_label text,
    external_league_id bigint,

    -- Web v2.0 sets this (bcrypt). Nullable until then.
    commissioner_password_hash text,
    commissioner_password_set_at timestamptz,

    -- SHA-256 hex of the secret URL segment. The secret itself is never stored.
    import_secret_sha256 text,
    import_secret_set_at timestamptz,

    status text not null default 'ACTIVE',

    created_at timestamptz not null default now(),
    created_by text not null default 'site owner',

    constraint leagues_name_not_blank check (length(trim(name)) > 0),
    constraint leagues_status_allowed check (status in ('ACTIVE', 'ARCHIVED')),
    constraint leagues_password_is_bcrypt check (
        commissioner_password_hash is null or commissioner_password_hash like '$2%'
    ),
    constraint leagues_import_secret_hex check (
        import_secret_sha256 is null or import_secret_sha256 ~ '^[0-9a-f]{64}$'
    )
);

create unique index leagues_name_key_idx on public.leagues (name_key);
create unique index leagues_import_secret_idx
    on public.leagues (import_secret_sha256)
    where import_secret_sha256 is not null;

-- ============================================================
-- Import snapshots and raw payloads
-- ============================================================

create table public.import_snapshots (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    source text not null default 'SNALLABOT',
    platform_label text,
    external_league_id bigint,

    -- From standings, filled in by the health check.
    season integer,                      -- calendarYear
    week integer,                        -- weekIndex + 1
    stage_index integer,                 -- stageIndex (1 = regular season)

    first_received_at timestamptz not null default now(),
    last_received_at timestamptz not null default now(),
    request_count integer not null default 0,
    duplicate_count integer not null default 0,
    total_bytes bigint not null default 0,

    -- RECEIVING while the burst is open; RECEIVED once the next burst starts.
    -- The later statuses are reserved for Web v3.0 (review, mark current).
    status text not null default 'RECEIVING',
    diagnostics jsonb not null default '{}'::jsonb,
    reviewed_at timestamptz,
    reviewed_by text,

    constraint import_snapshots_source_allowed check (
        source in ('SNALLABOT', 'COMPANION', 'CSV')
    ),
    constraint import_snapshots_status_allowed check (
        status in ('RECEIVING', 'RECEIVED', 'VALIDATED', 'CURRENT', 'SUPERSEDED', 'REJECTED')
    ),
    constraint import_snapshots_review_recorded check (
        status not in ('CURRENT', 'REJECTED') or reviewed_by is not null
    ),
    constraint import_snapshots_counts_nonnegative check (
        request_count >= 0 and duplicate_count >= 0 and total_bytes >= 0
    )
);

create index import_snapshots_league_idx
    on public.import_snapshots (league_id, first_received_at desc);

create unique index import_snapshots_one_receiving_idx
    on public.import_snapshots (league_id)
    where status = 'RECEIVING';

create unique index import_snapshots_one_current_idx
    on public.import_snapshots (league_id)
    where status = 'CURRENT';

create table public.import_payloads (
    id uuid primary key default gen_random_uuid(),
    snapshot_id uuid not null references public.import_snapshots(id),
    route text not null,                 -- e.g. team/776994846/roster, standings
    received_at timestamptz not null default now(),
    content_length integer not null,
    body_sha256 text not null,
    body jsonb,                          -- null once trimmed by the retention rule

    unique (snapshot_id, route, body_sha256),

    constraint import_payloads_length_nonnegative check (content_length >= 0),
    constraint import_payloads_sha_hex check (body_sha256 ~ '^[0-9a-f]{64}$'),
    constraint import_payloads_route_safe check (route ~ '^[a-z0-9/]{1,120}$')
);

create index import_payloads_snapshot_idx
    on public.import_payloads (snapshot_id, route);

-- ============================================================
-- Health check
-- ============================================================

-- Recomputes a snapshot's diagnostics from its payloads:
-- which teams sent rosters, which are missing (per the leagueteams list),
-- which league routes and weekly routes arrived, and the season, week and
-- stage from standings.
create or replace function public.refresh_import_diagnostics(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league_teams jsonb;
    v_standings jsonb;
    v_roster_ids bigint[];
    v_team_ids bigint[];
    v_missing bigint[];
    v_weekly text[];
    v_unknown text[];
    v_diag jsonb;
    v_season integer;
    v_week integer;
    v_stage integer;
begin
    select array_agg(distinct substring(route from '^team/([0-9]+)/roster$')::bigint)
    into v_roster_ids
    from import_payloads
    where snapshot_id = p_snapshot_id and route ~ '^team/[0-9]+/roster$';

    select p.body into v_league_teams
    from import_payloads p
    where p.snapshot_id = p_snapshot_id and p.route = 'leagueteams' and p.body is not null
    order by p.received_at desc limit 1;

    select p.body into v_standings
    from import_payloads p
    where p.snapshot_id = p_snapshot_id and p.route = 'standings' and p.body is not null
    order by p.received_at desc limit 1;

    if v_league_teams ? 'leagueTeamInfoList'
       and jsonb_typeof(v_league_teams -> 'leagueTeamInfoList') = 'array' then
        select array_agg((t ->> 'teamId')::bigint order by (t ->> 'teamId')::bigint)
        into v_team_ids
        from jsonb_array_elements(v_league_teams -> 'leagueTeamInfoList') t
        where (t ->> 'teamId') ~ '^[0-9]+$';

        select array_agg(id order by id) into v_missing
        from unnest(coalesce(v_team_ids, '{}')) id
        where not (id = any (coalesce(v_roster_ids, '{}')));

        -- array_agg over no rows is NULL; no missing teams means an empty list.
        v_missing := coalesce(v_missing, '{}');
    end if;

    if v_standings ? 'teamStandingInfoList'
       and jsonb_typeof(v_standings -> 'teamStandingInfoList') = 'array'
       and jsonb_array_length(v_standings -> 'teamStandingInfoList') > 0 then
        select
            case when (s ->> 'calendarYear') ~ '^[0-9]+$' then (s ->> 'calendarYear')::integer end,
            case when (s ->> 'weekIndex') ~ '^[0-9]+$' then (s ->> 'weekIndex')::integer + 1 end,
            case when (s ->> 'stageIndex') ~ '^[0-9]+$' then (s ->> 'stageIndex')::integer end
        into v_season, v_week, v_stage
        from jsonb_array_elements(v_standings -> 'teamStandingInfoList') s
        limit 1;
    end if;

    select array_agg(distinct route order by route) into v_weekly
    from import_payloads
    where snapshot_id = p_snapshot_id and route ~ '^week/';

    select array_agg(distinct route order by route) into v_unknown
    from import_payloads
    where snapshot_id = p_snapshot_id
      and route !~ '^(leagueteams|standings|freeagents/roster|team/[0-9]+/roster|week/(reg|pre)/[0-9]{1,2}/(passing|rushing|receiving|defense|kicking|punting|teamstats|schedules))$';

    v_diag := jsonb_build_object(
        'rosters_received', coalesce(cardinality(v_roster_ids), 0),
        'teams_in_league', coalesce(cardinality(v_team_ids), 0),
        'missing_roster_team_ids', to_jsonb(coalesce(v_missing, '{}')),
        'has_leagueteams', v_league_teams is not null,
        'has_standings', v_standings is not null,
        'has_freeagents', exists (
            select 1 from import_payloads
            where snapshot_id = p_snapshot_id and route = 'freeagents/roster'),
        'weekly_routes', to_jsonb(coalesce(v_weekly, '{}')),
        'unknown_routes', to_jsonb(coalesce(v_unknown, '{}')),
        'complete', v_league_teams is not null
                    and v_standings is not null
                    and coalesce(cardinality(v_missing), 1) = 0
    );

    update import_snapshots
    set diagnostics = v_diag,
        season = coalesce(v_season, season),
        week = coalesce(v_week, week),
        stage_index = coalesce(v_stage, stage_index)
    where id = p_snapshot_id;

    return v_diag;
end;
$$;

-- ============================================================
-- Retention
-- ============================================================

-- Keeps full bodies for the newest p_keep snapshots of a league. Older
-- payloads keep their row, route, size and hash; only the body is cleared.
create or replace function public.trim_import_payloads(p_league_id uuid, p_keep integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trimmed integer;
begin
    if p_keep is null or p_keep < 1 then
        raise exception using errcode = '22023', message = 'p_keep must be at least 1.';
    end if;

    update import_payloads p
    set body = null
    where p.body is not null
      and p.snapshot_id in (
          select s.id
          from import_snapshots s
          where s.league_id = p_league_id
            and s.status <> 'CURRENT'
          order by s.first_received_at desc
          offset p_keep
      );

    get diagnostics v_trimmed = row_count;
    return v_trimmed;
end;
$$;

-- ============================================================
-- Receiver entry point (called by the snallabot-import Edge Function)
-- ============================================================

-- One call per Snallabot request. The Edge Function has already parsed the
-- path, hashed the secret and the body, and checked the size.
--   * Unknown or inactive secret        -> errcode P0002 (function answers 404)
--   * League ID differs from the league -> errcode 22023 (function answers 403)
-- A burst is every request with less than 10 minutes between them. The first
-- request after a longer gap closes the previous snapshot (RECEIVED) and opens
-- a new one, then trims old bodies.
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
    on conflict on constraint import_payloads_snapshot_id_route_body_sha256_key do nothing;

    get diagnostics v_inserted = row_count;

    update import_snapshots s
    set last_received_at = now(),
        request_count = s.request_count + 1,
        duplicate_count = s.duplicate_count + case when v_inserted = 0 then 1 else 0 end,
        total_bytes = s.total_bytes + case when v_inserted = 1 then p_content_length else 0 end
    where s.id = v_snapshot_id;

    perform refresh_import_diagnostics(v_snapshot_id);

    if v_new_snapshot then
        perform trim_import_payloads(v_league.id, 10);
    end if;

    return query
    select s.id, s.status, v_inserted = 0, s.request_count
    from import_snapshots s
    where s.id = v_snapshot_id;
end;
$$;

-- ============================================================
-- Summary view for the site owner (Supabase dashboard / SQL editor)
-- ============================================================

create or replace view public.import_snapshot_summary
with (security_invoker = true)
as
select
    s.id as snapshot_id,
    s.league_id,
    s.status,
    s.first_received_at,
    s.last_received_at,
    s.request_count,
    s.duplicate_count,
    round(s.total_bytes / 1048576.0, 2) as total_mb,
    s.season,
    s.week,
    s.stage_index,
    (s.diagnostics ->> 'rosters_received')::integer as rosters_received,
    (s.diagnostics ->> 'teams_in_league')::integer as teams_in_league,
    s.diagnostics -> 'missing_roster_team_ids' as missing_roster_team_ids,
    (s.diagnostics ->> 'complete')::boolean as complete
from public.import_snapshots s;

-- ============================================================
-- Access: no browser access; service role only
-- ============================================================

alter table public.leagues enable row level security;
alter table public.import_snapshots enable row level security;
alter table public.import_payloads enable row level security;

revoke all on table public.leagues, public.import_snapshots, public.import_payloads
    from anon, authenticated;
revoke all on table public.import_snapshot_summary from anon, authenticated;

grant select, insert, update, delete
    on table public.leagues, public.import_snapshots, public.import_payloads
    to service_role;
grant select on table public.import_snapshot_summary to service_role;

revoke all on function public.refresh_import_diagnostics(uuid) from public, anon, authenticated;
revoke all on function public.trim_import_payloads(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    from public, anon, authenticated;

grant execute on function public.refresh_import_diagnostics(uuid) to service_role;
grant execute on function public.trim_import_payloads(uuid, integer) to service_role;
grant execute on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    to service_role;
