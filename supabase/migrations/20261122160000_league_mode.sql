-- Madden League Trade Calculator
-- Web Release v2.0 (League mode): database
-- Ruleset v4.4 remains unchanged.
--
-- Design: docs/roadmap/v5/V5_WEB_V2.0_SPEC.md (sections 5-8).
-- Applied at release step 1, BEFORE the v2.0 site merges. Everything here is
-- additive: the v1.5.0 site, accept-trade v1.5.0 and the v1.4.0 Admin delete
-- keep working unchanged. The public read policy on trades is NOT dropped here;
-- a separate migration does that after the site merge (release step 5).
--
-- public.leagues already exists (20261122060000_snallabot_import.sql).

-- ============================================================
-- 1. League teams
-- ============================================================

create table public.league_teams (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),

    -- Madden teamId (unique within a league only).
    external_team_id bigint,

    abbreviation text not null,          -- e.g. LAR, AZ, OMH (from the league's own payload)
    city_name text not null,
    nickname text not null,
    division text,

    -- leagueTeamInfoList.userName: empty = CPU, filled = human.
    controlled_by text not null default 'CPU',
    owner_label text,                    -- display only; never published in the repo

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint league_teams_controlled_by_allowed check (controlled_by in ('USER', 'CPU')),
    constraint league_teams_abbreviation_not_blank check (length(trim(abbreviation)) > 0),
    unique (league_id, abbreviation),
    unique (league_id, id)
);

create unique index league_teams_external_idx
    on public.league_teams (league_id, external_team_id)
    where external_team_id is not null;

-- ============================================================
-- 2. League trades: additive columns on trades, plus revisions and assets
-- ============================================================
-- user_team_* columns mean "submitting team" and cpu_team_* mean "other team"
-- in league mode (no rename; the snapshot contract keeps its field names).

alter table public.trades
    add column league_id uuid references public.leagues(id),
    add column submitting_team_id uuid,
    add column other_team_id uuid,
    add column review_status text,
    add column submitter_name text,
    add column submitter_note text,
    add column is_pre_league boolean not null default false,
    add column current_revision integer not null default 0,
    add column reviewed_at timestamptz,
    add column reviewed_by text,
    add column reversal_reason text,

    add constraint trades_review_status_allowed check (
        review_status is null
        or review_status in ('UNREVIEWED', 'REVIEWED', 'REVERSED')
    ),
    add constraint trades_submitting_team_fk
        foreign key (league_id, submitting_team_id)
        references public.league_teams (league_id, id),
    add constraint trades_other_team_fk
        foreign key (league_id, other_team_id)
        references public.league_teams (league_id, id),
    add constraint trades_teams_differ check (
        submitting_team_id is null or other_team_id is null
        or submitting_team_id <> other_team_id
    ),
    add constraint trades_league_fields_complete check (
        league_id is null
        or is_pre_league
        or (submitting_team_id is not null
            and other_team_id is not null
            and review_status is not null
            and submitter_name is not null
            and length(trim(submitter_name)) between 1 and 60)
    ),
    add constraint trades_submitter_note_length check (
        submitter_note is null or length(submitter_note) <= 500
    ),
    add constraint trades_reversal_consistent check (
        review_status is distinct from 'REVERSED'
        or (deleted_at is not null and reversal_reason is not null)
    ),
    add constraint trades_current_revision_nonnegative check (current_revision >= 0);

create index trades_league_history_idx
    on public.trades (league_id, accepted_at desc)
    where deleted_at is null;

create index trades_review_queue_idx
    on public.trades (league_id, accepted_at)
    where review_status = 'UNREVIEWED' and deleted_at is null;

-- Every evaluation of a league trade, frozen. Revision 0 is the member's
-- submission; each commissioner correction adds one (both kept).
create table public.trade_revisions (
    trade_id uuid not null references public.trades(id),
    revision integer not null,

    snapshot jsonb not null,             -- the validated trade object, as stored
    web_release text not null,
    ruleset_version text not null,
    verdict text not null,
    user_adjusted_value double precision not null,
    cpu_adjusted_value double precision not null,

    created_by_role text not null,
    created_by_name text not null,
    reason text,
    created_at timestamptz not null default now(),

    primary key (trade_id, revision),

    constraint trade_revisions_revision_nonnegative check (revision >= 0),
    constraint trade_revisions_role_allowed check (
        created_by_role in ('MEMBER', 'COMMISSIONER', 'MIGRATION')
    ),
    constraint trade_revisions_correction_has_reason check (
        revision = 0
        or (created_by_role = 'COMMISSIONER' and reason is not null and length(trim(reason)) > 0)
    )
);

-- Assets per revision, normalized for the audit view. A convenience copy:
-- the full submitted values always stay in trade_revisions.snapshot and on the
-- trades row. Values that don't parse or fall outside the calculator's ranges
-- are stored as null here rather than blocking a trade.
create table public.trade_assets (
    id uuid primary key default gen_random_uuid(),
    trade_id uuid not null,
    revision integer not null,
    side text not null,                  -- SUBMITTING (user_team) or OTHER (cpu_team)
    position_in_side integer not null,

    asset_type text not null,
    name text,
    pick text,
    timing text,
    ovr integer,
    age integer,
    pos text,
    dev text,
    cap_hit_m numeric(6, 2),
    years_remaining integer,
    years_in_league integer,
    role_current text,
    role_projected text,
    value double precision,

    -- Pre-fill provenance (Web v3.1+). Empty until imports feed the calculator.
    import_snapshot_id uuid references public.import_snapshots(id),
    imported_values jsonb,
    edited_fields text[] not null default '{}',

    foreign key (trade_id, revision) references public.trade_revisions (trade_id, revision),
    unique (trade_id, revision, side, position_in_side),

    constraint trade_assets_side_allowed check (side in ('SUBMITTING', 'OTHER')),
    constraint trade_assets_type_allowed check (asset_type in ('Player', 'Draft Pick')),
    constraint trade_assets_ovr_range check (ovr is null or ovr between 0 and 99),
    constraint trade_assets_age_range check (age is null or age between 18 and 60),
    constraint trade_assets_years_range check (years_remaining is null or years_remaining between 1 and 10),
    constraint trade_assets_league_range check (years_in_league is null or years_in_league between 0 and 40),
    constraint trade_assets_cap_nonnegative check (cap_hit_m is null or cap_hit_m >= 0),
    constraint trade_assets_edits_need_import check (
        cardinality(edited_fields) = 0 or imported_values is not null
    )
);

create index trade_assets_trade_idx on public.trade_assets (trade_id, revision);

-- ============================================================
-- 3. Audit records: one trail for trade and league actions
-- ============================================================

alter table public.audit_events
    alter column trade_id drop not null,
    alter column trade_number drop not null,
    add column league_id uuid references public.leagues(id),
    add column actor_role text not null default 'ADMIN',
    add column details jsonb not null default '{}'::jsonb,
    drop constraint audit_events_action_allowed,
    drop constraint audit_events_trade_number_positive,
    add constraint audit_events_action_allowed check (
        action in (
            'TRADE_DELETED',                 -- v1.4.0 Admin delete (kept for history)
            'TRADE_REVIEWED',
            'TRADE_CORRECTED',
            'TRADE_REVERSED',
            'LEAGUE_CREATED',
            'COMMISSIONER_PASSWORD_SET',
            'IMPORT_SECRET_ROTATED',
            'TEAM_UPDATED',
            'CALENDAR_UPDATED',
            'PICK_OWNERSHIP_CHANGED',
            'SNAPSHOT_MARKED_CURRENT',
            'SNAPSHOT_REJECTED',
            'PRE_LEAGUE_MIGRATION'
        )
    ),
    add constraint audit_events_trade_number_positive check (
        trade_number is null or trade_number > 0
    ),
    add constraint audit_events_trade_actions_have_trade check (
        action not like 'TRADE_%' or (trade_id is not null and trade_number is not null)
    ),
    add constraint audit_events_league_actions_have_league check (
        action like 'TRADE_%' or league_id is not null
    ),
    add constraint audit_events_actor_role_allowed check (
        actor_role in ('ADMIN', 'COMMISSIONER', 'SITE_OWNER', 'SYSTEM')
    );

create index audit_events_league_idx
    on public.audit_events (league_id, occurred_at desc)
    where league_id is not null;

-- ============================================================
-- 4. Commissioner login attempts (lockout: 5 wrong passwords / 15 minutes)
-- ============================================================

create table public.commissioner_login_attempts (
    id bigint generated always as identity primary key,
    league_id uuid not null references public.leagues(id),
    attempted_at timestamptz not null default now(),
    succeeded boolean not null
);

create index commissioner_login_attempts_league_idx
    on public.commissioner_login_attempts (league_id, attempted_at desc);

-- ============================================================
-- 5. Helpers
-- ============================================================

-- League name -> key, the same rule as leagues.name_key.
create or replace function public.league_name_key(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

-- Lenient parsers for calculator form values (strings or numbers).
create or replace function public.try_int(p_value text, p_min integer, p_max integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
    -- Nested CASE: the cast only runs after the format check (AND has no fixed order).
    select case
        when trim(coalesce(p_value, '')) ~ '^[0-9]{1,6}$' then
            case when trim(p_value)::integer between p_min and p_max
                 then trim(p_value)::integer end
    end;
$$;

create or replace function public.try_cap(p_value text)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when trim(coalesce(p_value, '')) ~ '^[0-9]{1,4}(\.[0-9]+)?$'
        then round(trim(p_value)::numeric, 2)
    end;
$$;

-- Copies one revision's assets from a trade object into trade_assets.
create or replace function public.insert_trade_assets(p_trade_id uuid, p_revision integer, p_trade jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer := 0;
    v_side text;
    v_key text;
    v_asset jsonb;
    v_index integer;
    v_type text;
begin
    foreach v_key in array array['user_team_assets', 'cpu_team_assets'] loop
        v_side := case when v_key = 'user_team_assets' then 'SUBMITTING' else 'OTHER' end;

        if jsonb_typeof(p_trade -> v_key) <> 'array' then
            continue;
        end if;

        v_index := 0;

        for v_asset in select value from jsonb_array_elements(p_trade -> v_key) loop
            v_index := v_index + 1;
            v_type := case when v_asset ->> 'type' = 'Draft Pick' then 'Draft Pick' else 'Player' end;

            insert into trade_assets (
                trade_id, revision, side, position_in_side, asset_type,
                name, pick, timing, ovr, age, pos, dev, cap_hit_m,
                years_remaining, years_in_league, role_current, role_projected, value
            )
            values (
                p_trade_id, p_revision, v_side, v_index, v_type,
                nullif(left(trim(coalesce(v_asset ->> 'name', '')), 80), ''),
                case when v_type = 'Draft Pick' then nullif(trim(coalesce(v_asset ->> 'pick', '')), '') end,
                case when v_type = 'Draft Pick' then nullif(trim(coalesce(v_asset ->> 'timing', '')), '') end,
                case when v_type = 'Player' then try_int(v_asset ->> 'ovr', 0, 99) end,
                case when v_type = 'Player' then try_int(v_asset ->> 'age', 18, 60) end,
                case when v_type = 'Player' then nullif(trim(coalesce(v_asset ->> 'pos', '')), '') end,
                case when v_type = 'Player' then nullif(trim(coalesce(v_asset ->> 'dev', '')), '') end,
                case when v_type = 'Player' then try_cap(v_asset ->> 'cap') end,
                case when v_type = 'Player' then try_int(v_asset ->> 'years', 1, 10) end,
                case when v_type = 'Player' then try_int(v_asset ->> 'league', 0, 40) end,
                case when v_type = 'Player' then nullif(trim(coalesce(v_asset ->> 'current', '')), '') end,
                case when v_type = 'Player' then nullif(trim(coalesce(v_asset ->> 'projected', '')), '') end,
                case when jsonb_typeof(v_asset -> 'value') = 'number' then (v_asset ->> 'value')::double precision end
            );

            v_count := v_count + 1;
        end loop;
    end loop;

    return v_count;
end;
$$;

-- ============================================================
-- 6. Read functions (browser): knowing the league name is the access
-- ============================================================

create or replace function public.league_lookup(p_name text)
returns table (league_id uuid, league_name text, madden_version text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select l.id, l.name, l.madden_version
    from leagues l
    where l.status = 'ACTIVE' and l.name_key = league_name_key(p_name);
$$;

create or replace function public.league_team_list(p_name text)
returns table (team_id uuid, abbreviation text, city_name text, nickname text,
               division text, controlled_by text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select t.id, t.abbreviation, t.city_name, t.nickname, t.division, t.controlled_by
    from league_teams t
    join leagues l on l.id = t.league_id
    where l.status = 'ACTIVE' and l.name_key = league_name_key(p_name)
    order by t.city_name, t.nickname;
$$;

-- Active (not reversed) trades of one league, newest first, with team names.
create or replace function public.league_trade_history(p_name text)
returns table (
    trade_id uuid,
    trade_number bigint,
    accepted_at timestamptz,
    web_release text,
    ruleset_version text,
    review_status text,
    is_pre_league boolean,
    current_revision integer,
    submitter_name text,
    submitter_note text,
    reviewed_at timestamptz,
    submitting_team text,
    other_team text,
    user_team_assets jsonb,
    cpu_team_assets jsonb,
    user_raw_value double precision,
    cpu_raw_value double precision,
    user_adjusted_value double precision,
    cpu_adjusted_value double precision,
    adjusted_gap double precision,
    verdict text,
    evaluation_mode text,
    protection_tier text,
    required_target double precision,
    fair_maximum double precision,
    trade_intelligence jsonb,
    suggested_correction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        tr.id, tr.trade_number, tr.accepted_at, tr.web_release, tr.ruleset_version,
        tr.review_status, tr.is_pre_league, tr.current_revision,
        tr.submitter_name, tr.submitter_note, tr.reviewed_at,
        st.city_name || ' ' || st.nickname,
        ot.city_name || ' ' || ot.nickname,
        tr.user_team_assets, tr.cpu_team_assets,
        tr.user_raw_value, tr.cpu_raw_value,
        tr.user_adjusted_value, tr.cpu_adjusted_value,
        tr.adjusted_gap, tr.verdict, tr.evaluation_mode, tr.protection_tier,
        tr.required_target, tr.fair_maximum, tr.trade_intelligence, tr.suggested_correction
    from trades tr
    join leagues l on l.id = tr.league_id
    left join league_teams st on st.id = tr.submitting_team_id
    left join league_teams ot on ot.id = tr.other_team_id
    where l.status = 'ACTIVE'
      and l.name_key = league_name_key(p_name)
      and tr.deleted_at is null
    order by tr.accepted_at desc;
$$;

-- All revisions of one active trade in one league (Original submission view).
create or replace function public.league_trade_revisions(p_name text, p_trade_id uuid)
returns table (
    revision integer,
    created_at timestamptz,
    created_by_role text,
    created_by_name text,
    reason text,
    verdict text,
    user_adjusted_value double precision,
    cpu_adjusted_value double precision,
    snapshot jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select r.revision, r.created_at, r.created_by_role, r.created_by_name, r.reason,
           r.verdict, r.user_adjusted_value, r.cpu_adjusted_value, r.snapshot
    from trade_revisions r
    join trades tr on tr.id = r.trade_id
    join leagues l on l.id = tr.league_id
    where l.status = 'ACTIVE'
      and l.name_key = league_name_key(p_name)
      and tr.id = p_trade_id
      and tr.deleted_at is null
    order by r.revision;
$$;

-- ============================================================
-- 7. Commissioner login (service role; called by commissioner-login)
-- ============================================================
-- Returns status:
--   OK        password correct (league_id returned)
--   BAD       wrong password (attempt recorded)
--   LOCKED    5 wrong passwords within 15 minutes since the last success;
--             nothing is checked or recorded until it expires
--   NOT_SET   the league has no commissioner password yet
--   UNKNOWN   no active league with that name
create or replace function public.commissioner_login(p_league_name text, p_password text)
returns table (status text, league_id uuid, league_name text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_window_start timestamptz;
    v_failures integer;
    v_oldest_failure timestamptz;
    v_ok boolean;
begin
    select * into v_league
    from leagues l
    where l.status = 'ACTIVE' and l.name_key = league_name_key(p_league_name);

    if not found then
        return query select 'UNKNOWN'::text, null::uuid, null::text, null::integer;
        return;
    end if;

    if v_league.commissioner_password_hash is null then
        return query select 'NOT_SET'::text, null::uuid, null::text, null::integer;
        return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('login:' || v_league.id::text, 0));

    delete from commissioner_login_attempts a
    where a.league_id = v_league.id and a.attempted_at < now() - interval '1 day';

    select greatest(
        now() - interval '15 minutes',
        coalesce(max(a.attempted_at) filter (where a.succeeded), '-infinity'::timestamptz)
    )
    into v_window_start
    from commissioner_login_attempts a
    where a.league_id = v_league.id;

    select count(*), min(a.attempted_at)
    into v_failures, v_oldest_failure
    from (
        select a2.attempted_at
        from commissioner_login_attempts a2
        where a2.league_id = v_league.id
          and not a2.succeeded
          and a2.attempted_at > v_window_start
        order by a2.attempted_at desc
        limit 5
    ) a;

    if v_failures >= 5 then
        return query select
            'LOCKED'::text, null::uuid, null::text,
            greatest(1, ceil(extract(epoch from (v_oldest_failure + interval '15 minutes' - now())))::integer);
        return;
    end if;

    v_ok := v_league.commissioner_password_hash = crypt(coalesce(p_password, ''), v_league.commissioner_password_hash);

    insert into commissioner_login_attempts (league_id, succeeded) values (v_league.id, v_ok);

    if v_ok then
        return query select 'OK'::text, v_league.id, v_league.name, null::integer;
    else
        return query select 'BAD'::text, null::uuid, null::text, null::integer;
    end if;
end;
$$;

-- ============================================================
-- 8. Submit and review (service role; called by accept-trade / review-trade)
-- ============================================================

-- Logs a league trade as UNREVIEWED with revision 0 and its assets.
-- p_trade is the trade object accept-trade has already validated (the same
-- fields it inserts today). Errors:
--   P0002  league not found or not active
--   22023  a team isn't in this league, the teams are the same, or a field is invalid
create or replace function public.submit_league_trade(
    p_league_id uuid,
    p_submitting_team_id uuid,
    p_other_team_id uuid,
    p_submitter_name text,
    p_submitter_note text,
    p_trade jsonb
)
returns table (trade_id uuid, trade_number bigint, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trade trades%rowtype;
    v_name text := trim(coalesce(p_submitter_name, ''));
    v_note text := nullif(trim(coalesce(p_submitter_note, '')), '');
begin
    if not exists (select 1 from leagues l where l.id = p_league_id and l.status = 'ACTIVE') then
        raise exception using errcode = 'P0002', message = 'League not found.';
    end if;

    if p_submitting_team_id is null or p_other_team_id is null
       or p_submitting_team_id = p_other_team_id then
        raise exception using errcode = '22023', message = 'Choose two different teams.';
    end if;

    if (select count(*) from league_teams t
        where t.league_id = p_league_id
          and t.id in (p_submitting_team_id, p_other_team_id)) <> 2 then
        raise exception using errcode = '22023', message = 'Both teams must belong to this league.';
    end if;

    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Your name must be 1 to 60 characters.';
    end if;

    if v_note is not null and length(v_note) > 500 then
        raise exception using errcode = '22023', message = 'The note must be 500 characters or fewer.';
    end if;

    insert into trades (
        web_release, ruleset_version, user_team_assets, cpu_team_assets,
        user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value,
        adjusted_gap, verdict, evaluation_mode, protection_tier,
        required_target, fair_maximum, trade_intelligence, suggested_correction,
        league_id, submitting_team_id, other_team_id, review_status,
        submitter_name, submitter_note, current_revision
    )
    values (
        p_trade ->> 'web_release',
        p_trade ->> 'ruleset_version',
        coalesce(p_trade -> 'user_team_assets', '[]'::jsonb),
        coalesce(p_trade -> 'cpu_team_assets', '[]'::jsonb),
        (p_trade ->> 'user_raw_value')::double precision,
        (p_trade ->> 'cpu_raw_value')::double precision,
        (p_trade ->> 'user_adjusted_value')::double precision,
        (p_trade ->> 'cpu_adjusted_value')::double precision,
        (p_trade ->> 'adjusted_gap')::double precision,
        p_trade ->> 'verdict',
        p_trade ->> 'evaluation_mode',
        p_trade ->> 'protection_tier',
        (p_trade ->> 'required_target')::double precision,
        (p_trade ->> 'fair_maximum')::double precision,
        coalesce(p_trade -> 'trade_intelligence', '[]'::jsonb),
        p_trade ->> 'suggested_correction',
        p_league_id, p_submitting_team_id, p_other_team_id, 'UNREVIEWED',
        v_name, v_note, 0
    )
    returning * into v_trade;

    insert into trade_revisions (
        trade_id, revision, snapshot, web_release, ruleset_version, verdict,
        user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name
    )
    values (
        v_trade.id, 0, p_trade, v_trade.web_release, v_trade.ruleset_version, v_trade.verdict,
        v_trade.user_adjusted_value, v_trade.cpu_adjusted_value, 'MEMBER', v_name
    );

    perform insert_trade_assets(v_trade.id, 0, p_trade);

    return query select v_trade.id, v_trade.trade_number, v_trade.accepted_at;
end;
$$;

-- Commissioner review actions on one trade of one league.
--   REVIEW   mark Reviewed (p_reason = optional comment)
--   CORRECT  add a revision from p_trade (reason required); the trades row
--            shows the corrected values; status Reviewed
--   REVERSE  logical removal with a reason; status Reversed
-- Errors:
--   P0002  trade not found in this league
--   22023  invalid action, missing reason / name / trade, or already reversed
create or replace function public.review_league_trade(
    p_league_id uuid,
    p_trade_id uuid,
    p_action text,
    p_commissioner_name text,
    p_reason text default null,
    p_trade jsonb default null
)
returns table (trade_id uuid, trade_number bigint, review_status text, current_revision integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trade trades%rowtype;
    v_action text := upper(trim(coalesce(p_action, '')));
    v_name text := trim(coalesce(p_commissioner_name, ''));
    v_reason text := nullif(trim(coalesce(p_reason, '')), '');
    v_revision integer;
begin
    if v_action not in ('REVIEW', 'CORRECT', 'REVERSE') then
        raise exception using errcode = '22023', message = 'Unknown review action.';
    end if;

    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name is required.';
    end if;

    select * into v_trade
    from trades tr
    where tr.id = p_trade_id and tr.league_id = p_league_id
    for update;

    if not found then
        raise exception using errcode = 'P0002', message = 'Trade not found in this league.';
    end if;

    if v_trade.deleted_at is not null or v_trade.review_status = 'REVERSED' then
        raise exception using errcode = '22023', message = 'This trade has already been reversed.';
    end if;

    if v_action = 'REVIEW' then
        update trades tr
        set review_status = 'REVIEWED', reviewed_at = now(), reviewed_by = v_name
        where tr.id = v_trade.id;

        insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role)
        values (v_trade.id, v_trade.trade_number, 'TRADE_REVIEWED', v_name, v_reason, p_league_id, 'COMMISSIONER');

    elsif v_action = 'CORRECT' then
        if v_reason is null then
            raise exception using errcode = '22023', message = 'A correction needs a reason.';
        end if;

        if p_trade is null or jsonb_typeof(p_trade) <> 'object' then
            raise exception using errcode = '22023', message = 'A correction needs the corrected trade.';
        end if;

        v_revision := v_trade.current_revision + 1;

        insert into trade_revisions (
            trade_id, revision, snapshot, web_release, ruleset_version, verdict,
            user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name, reason
        )
        values (
            v_trade.id, v_revision, p_trade, p_trade ->> 'web_release', p_trade ->> 'ruleset_version',
            p_trade ->> 'verdict',
            (p_trade ->> 'user_adjusted_value')::double precision,
            (p_trade ->> 'cpu_adjusted_value')::double precision,
            'COMMISSIONER', v_name, v_reason
        );

        perform insert_trade_assets(v_trade.id, v_revision, p_trade);

        update trades tr
        set user_team_assets = coalesce(p_trade -> 'user_team_assets', '[]'::jsonb),
            cpu_team_assets = coalesce(p_trade -> 'cpu_team_assets', '[]'::jsonb),
            user_raw_value = (p_trade ->> 'user_raw_value')::double precision,
            cpu_raw_value = (p_trade ->> 'cpu_raw_value')::double precision,
            user_adjusted_value = (p_trade ->> 'user_adjusted_value')::double precision,
            cpu_adjusted_value = (p_trade ->> 'cpu_adjusted_value')::double precision,
            adjusted_gap = (p_trade ->> 'adjusted_gap')::double precision,
            verdict = p_trade ->> 'verdict',
            evaluation_mode = p_trade ->> 'evaluation_mode',
            protection_tier = p_trade ->> 'protection_tier',
            required_target = (p_trade ->> 'required_target')::double precision,
            fair_maximum = (p_trade ->> 'fair_maximum')::double precision,
            trade_intelligence = coalesce(p_trade -> 'trade_intelligence', '[]'::jsonb),
            suggested_correction = p_trade ->> 'suggested_correction',
            current_revision = v_revision,
            review_status = 'REVIEWED',
            reviewed_at = now(),
            reviewed_by = v_name
        where tr.id = v_trade.id;

        insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
        values (v_trade.id, v_trade.trade_number, 'TRADE_CORRECTED', v_name, v_reason, p_league_id, 'COMMISSIONER',
                jsonb_build_object('revision', v_revision,
                                   'verdict_before', v_trade.verdict,
                                   'verdict_after', p_trade ->> 'verdict'));

    else -- REVERSE
        if v_reason is null then
            raise exception using errcode = '22023', message = 'Reversing a trade needs a reason.';
        end if;

        update trades tr
        set review_status = 'REVERSED', deleted_at = now(), reversal_reason = v_reason,
            reviewed_at = now(), reviewed_by = v_name
        where tr.id = v_trade.id;

        insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role)
        values (v_trade.id, v_trade.trade_number, 'TRADE_REVERSED', v_name, v_reason, p_league_id, 'COMMISSIONER');
    end if;

    return query
    select tr.id, tr.trade_number, tr.review_status, tr.current_revision
    from trades tr where tr.id = v_trade.id;
end;
$$;

-- This league's audit events, newest first (service role; commissioner-audit-log).
create or replace function public.league_audit_log(p_league_id uuid, p_limit integer default 200)
returns table (
    occurred_at timestamptz,
    action text,
    trade_number bigint,
    actor_role text,
    actor_name text,
    reason text,
    details jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select a.occurred_at, a.action, a.trade_number, a.actor_role, a.administrator_name, a.reason, a.details
    from audit_events a
    left join trades tr on tr.id = a.trade_id
    where a.league_id = p_league_id or tr.league_id = p_league_id
    order by a.occurred_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;

-- ============================================================
-- 9. Access
-- ============================================================

alter table public.league_teams enable row level security;
alter table public.trade_revisions enable row level security;
alter table public.trade_assets enable row level security;
alter table public.commissioner_login_attempts enable row level security;

revoke all on table public.league_teams, public.trade_revisions, public.trade_assets,
    public.commissioner_login_attempts
from anon, authenticated;

grant select, insert, update, delete
    on table public.league_teams, public.trade_revisions, public.trade_assets,
             public.commissioner_login_attempts
to service_role;

revoke all on function public.league_name_key(text) from public, anon, authenticated;
revoke all on function public.try_int(text, integer, integer) from public, anon, authenticated;
revoke all on function public.try_cap(text) from public, anon, authenticated;
revoke all on function public.insert_trade_assets(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.league_lookup(text) from public, anon, authenticated;
revoke all on function public.league_team_list(text) from public, anon, authenticated;
revoke all on function public.league_trade_history(text) from public, anon, authenticated;
revoke all on function public.league_trade_revisions(text, uuid) from public, anon, authenticated;
revoke all on function public.commissioner_login(text, text) from public, anon, authenticated;
revoke all on function public.submit_league_trade(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.review_league_trade(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.league_audit_log(uuid, integer) from public, anon, authenticated;

-- Browser: the four name-based read functions only.
grant execute on function public.league_lookup(text) to anon, authenticated, service_role;
grant execute on function public.league_team_list(text) to anon, authenticated, service_role;
grant execute on function public.league_trade_history(text) to anon, authenticated, service_role;
grant execute on function public.league_trade_revisions(text, uuid) to anon, authenticated, service_role;

-- Edge Functions (service role).
grant execute on function public.league_name_key(text) to service_role;
grant execute on function public.try_int(text, integer, integer) to service_role;
grant execute on function public.try_cap(text) to service_role;
grant execute on function public.insert_trade_assets(uuid, integer, jsonb) to service_role;
grant execute on function public.commissioner_login(text, text) to service_role;
grant execute on function public.submit_league_trade(uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.review_league_trade(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.league_audit_log(uuid, integer) to service_role;
