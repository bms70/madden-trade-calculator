-- Madden League Trade Calculator
-- Web Release v3.0: draft-pick ownership and snapshot review
-- Ruleset v4.4 and valuation.js remain unchanged.
--
-- Draft picks (decided 2026-11-27, reversing the Q33 deferral):
--   * draft_picks: every team's picks for the current draft and the next two
--     (7 rounds), set up by the site owner (owner_setup_draft_picks). While a
--     league has picks set up (leagues.current_draft_year), every Draft Pick in a
--     league trade must name the pick (asset.pick_id): the giving team must own
--     it, and its round and year must match the pick label and timing.
--   * Picks move when a trade is submitted, move back when it's reversed, and a
--     correction moves the old revision's picks back and applies the new ones.
--     If a pick has moved again since, the reversal or correction is refused.
--     Every move is kept in pick_moves.
--   * The commissioner can move a pick by hand and marks the draft complete
--     (current year retired, years shift, a new third year is created).
--     draft_rollover_due() is the hook for doing that automatically later.
--   * Owner: owner_setup_draft_picks, owner_set_pick_owner, owner_draft_picks,
--     owner_replay_pick_trades (updates picks from trades logged before
--     tracking started).
-- Snapshot review: the commissioner reviews each export's health and marks one
-- current (leagues.current_snapshot_id). Nothing reads it for valuation.

-- ============================================================
-- 1. Audit actions
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
            'PRE_LEAGUE_MIGRATION',
            'PICKS_SET_UP',
            'DRAFT_COMPLETED'
        )
    );

-- ============================================================
-- 2. League settings
-- ============================================================

alter table public.leagues
    add column current_draft_year integer,
    add column current_snapshot_id uuid references public.import_snapshots(id),
    add column current_snapshot_marked_at timestamptz,
    add column current_snapshot_marked_by text,
    add constraint leagues_current_draft_year_range check (
        current_draft_year is null or current_draft_year between 2000 and 2200
    );

-- ============================================================
-- 3. Draft picks and their moves
-- ============================================================

create table public.draft_picks (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    draft_year integer not null,
    round integer not null,
    original_team_id uuid not null,
    owner_team_id uuid not null,
    status text not null default 'ACTIVE',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    foreign key (league_id, original_team_id) references public.league_teams (league_id, id),
    foreign key (league_id, owner_team_id) references public.league_teams (league_id, id),
    constraint draft_picks_round_range check (round between 1 and 7),
    constraint draft_picks_status_allowed check (status in ('ACTIVE', 'USED')),
    constraint draft_picks_one_per_team unique (league_id, draft_year, round, original_team_id)
);

create index draft_picks_owner_idx on public.draft_picks (league_id, owner_team_id, draft_year, round);

create table public.pick_moves (
    id bigint generated always as identity primary key,
    league_id uuid not null references public.leagues(id),
    pick_id uuid not null references public.draft_picks(id),
    from_team_id uuid not null,
    to_team_id uuid not null,
    reason text not null,
    trade_id uuid references public.trades(id),
    revision integer,
    moved_by text not null,
    moved_at timestamptz not null default now(),
    undone_at timestamptz,

    constraint pick_moves_reason_allowed check (
        reason in ('TRADE', 'TRADE_REVERSED', 'TRADE_CORRECTED', 'COMMISSIONER', 'SITE_OWNER', 'REPLAY')
    )
);

create index pick_moves_trade_idx on public.pick_moves (trade_id, revision);
create index pick_moves_pick_idx on public.pick_moves (pick_id, moved_at desc);

-- No foreign key: an unknown pick must reach apply_trade_picks, which refuses
-- it with a clear message (draft_picks rows are never deleted).
alter table public.trade_assets
    add column pick_id uuid;

-- ============================================================
-- 4. Helpers
-- ============================================================

-- Pick label -> round: '1.05', 'Future Mid 1st' -> 1; 'Early 2nd' -> 2;
-- 'Late 3rd' -> 3; '4th'..'7th'. Null when unknown.
create or replace function public.pick_round(p_label text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when p_label ~ '^1\.[0-9]{2}$' or p_label ~* '1st' then 1
        when p_label ~* '2nd' then 2
        when p_label ~* '3rd' then 3
        when p_label ~ '^[4-7]th$' then substring(p_label from '^([4-7])th$')::integer
    end;
$$;

-- Timing -> years after the current draft.
create or replace function public.pick_year_offset(p_timing text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
    select case p_timing
        when 'Current draft' then 0
        when 'Next year' then 1
        when 'Two years away' then 2
    end;
$$;

-- '2028 2nd (DAL)'
create or replace function public.pick_display(p_pick_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
    select p.draft_year || ' ' ||
           case p.round when 1 then '1st' when 2 then '2nd' when 3 then '3rd' else p.round || 'th' end ||
           ' (' || t.abbreviation || ')'
    from draft_picks p join league_teams t on t.id = p.original_team_id
    where p.id = p_pick_id;
$$;

-- Creates every team's picks for one draft year (missing ones only).
create or replace function public.create_draft_year(p_league_id uuid, p_year integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    insert into draft_picks (league_id, draft_year, round, original_team_id, owner_team_id)
    select p_league_id, p_year, r, t.id, t.id
    from league_teams t cross join generate_series(1, 7) r
    where t.league_id = p_league_id
    on conflict on constraint draft_picks_one_per_team do nothing;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- Moves one pick and records the move.
create or replace function public.move_pick(
    p_pick_id uuid, p_to_team uuid, p_reason text, p_moved_by text,
    p_trade_id uuid default null, p_revision integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_pick draft_picks%rowtype;
begin
    select * into v_pick from draft_picks where id = p_pick_id for update;
    if not found then
        raise exception using errcode = 'P0002', message = 'Pick not found.';
    end if;
    if v_pick.owner_team_id = p_to_team then
        return;
    end if;
    update draft_picks set owner_team_id = p_to_team, updated_at = now() where id = p_pick_id;
    insert into pick_moves (league_id, pick_id, from_team_id, to_team_id, reason, trade_id, revision, moved_by)
    values (v_pick.league_id, p_pick_id, v_pick.owner_team_id, p_to_team, p_reason, p_trade_id, p_revision, p_moved_by);
end;
$$;

-- ============================================================
-- 5. Picks in trades
-- ============================================================

-- Validates and moves the picks of one trade revision (trade_assets rows must
-- exist). Does nothing when the league has no picks set up.
-- side SUBMITTING = what the submitting team receives (from the other team).
create or replace function public.apply_trade_picks(p_trade_id uuid, p_revision integer, p_moved_by text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trade trades%rowtype;
    v_year integer;
    v_a record;
    v_pick draft_picks%rowtype;
    v_giving uuid;
    v_receiving uuid;
    v_round integer;
    v_offset integer;
    v_seen uuid[] := '{}';
    v_count integer := 0;
    v_owner text;
begin
    select * into v_trade from trades where id = p_trade_id;
    select l.current_draft_year into v_year from leagues l where l.id = v_trade.league_id;
    if v_year is null then
        return 0;
    end if;

    for v_a in
        select a.* from trade_assets a
        where a.trade_id = p_trade_id and a.revision = p_revision and a.asset_type = 'Draft Pick'
        order by a.side, a.position_in_side
    loop
        if v_a.side = 'SUBMITTING' then
            v_giving := v_trade.other_team_id; v_receiving := v_trade.submitting_team_id;
        else
            v_giving := v_trade.submitting_team_id; v_receiving := v_trade.other_team_id;
        end if;

        if v_a.pick_id is null then
            raise exception using errcode = '22023',
                message = format('Choose whose %s pick this is. If the choice isn''t shown, reload the page.', coalesce(v_a.pick, 'draft'));
        end if;

        if v_a.pick_id = any (v_seen) then
            raise exception using errcode = '22023', message = format('%s is in this trade twice.', pick_display(v_a.pick_id));
        end if;
        v_seen := v_seen || v_a.pick_id;

        select * into v_pick from draft_picks p where p.id = v_a.pick_id and p.league_id = v_trade.league_id for update;
        if not found then
            raise exception using errcode = '22023', message = 'That pick isn''t in this league. Reload the page and choose it again.';
        end if;

        if v_pick.status <> 'ACTIVE' then
            raise exception using errcode = '22023', message = format('%s has already been used.', pick_display(v_pick.id));
        end if;

        if v_pick.owner_team_id <> v_giving then
            select t.abbreviation into v_owner from league_teams t where t.id = v_pick.owner_team_id;
            raise exception using errcode = '22023',
                message = format('%s belongs to %s now, not the team giving it. Reload the page and choose again.', pick_display(v_pick.id), v_owner);
        end if;

        v_round := pick_round(v_a.pick);
        v_offset := pick_year_offset(v_a.timing);
        if v_round is distinct from v_pick.round or v_offset is null or v_year + v_offset <> v_pick.draft_year then
            raise exception using errcode = '22023',
                message = format('%s doesn''t match "%s, %s".', pick_display(v_pick.id), v_a.pick, v_a.timing);
        end if;

        perform move_pick(v_pick.id, v_receiving, 'TRADE', p_moved_by, p_trade_id, p_revision);
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

-- Moves back the picks a trade revision moved. Refused when a pick has moved
-- again since (another trade or the commissioner).
create or replace function public.undo_trade_picks(p_trade_id uuid, p_revision integer, p_reason text, p_moved_by text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_m record;
    v_pick draft_picks%rowtype;
    v_count integer := 0;
    v_later text;
begin
    for v_m in
        select * from pick_moves m
        where m.trade_id = p_trade_id and m.revision = p_revision and m.reason in ('TRADE', 'REPLAY') and m.undone_at is null
        order by m.id desc
    loop
        select * into v_pick from draft_picks where id = v_m.pick_id for update;
        if v_pick.owner_team_id <> v_m.to_team_id then
            select coalesce('trade #' || tr.trade_number, 'a manual move') into v_later
            from pick_moves m left join trades tr on tr.id = m.trade_id
            where m.pick_id = v_m.pick_id and m.id > v_m.id
            order by m.id desc limit 1;
            raise exception using errcode = '22023',
                message = format('%s has moved again since this trade (%s). Undo that first.', pick_display(v_pick.id), coalesce(v_later, 'a later move'));
        end if;
        update draft_picks set owner_team_id = v_m.from_team_id, updated_at = now() where id = v_m.pick_id;
        insert into pick_moves (league_id, pick_id, from_team_id, to_team_id, reason, trade_id, revision, moved_by)
        values (v_m.league_id, v_m.pick_id, v_m.to_team_id, v_m.from_team_id, p_reason, p_trade_id, p_revision, p_moved_by);
        update pick_moves set undone_at = now() where id = v_m.id;
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$$;


-- Trade assets now keep the pick (same as 20261122160000 otherwise).
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
                years_remaining, years_in_league, role_current, role_projected, value, pick_id
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
                case when jsonb_typeof(v_asset -> 'value') = 'number' then (v_asset ->> 'value')::double precision end,
                case when v_type = 'Draft Pick' and (v_asset ->> 'pick_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     then (v_asset ->> 'pick_id')::uuid end
            );

            v_count := v_count + 1;
        end loop;
    end loop;

    return v_count;
end;
$$;

-- ============================================================
-- 6. Submit and review (same as 20261122160000, plus picks)
-- ============================================================

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

    -- Web v3.0: the trade's picks move to the receiving teams (or the whole
    -- submission fails with the reason).
    perform apply_trade_picks(v_trade.id, 0, v_name);

    return query select v_trade.id, v_trade.trade_number, v_trade.accepted_at;
end;
$$;

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

        -- Picks: the old revision's go back first, then the new revision's move.
        perform undo_trade_picks(v_trade.id, v_trade.current_revision, 'TRADE_CORRECTED', v_name);

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
        perform apply_trade_picks(v_trade.id, v_revision, v_name);

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

        perform undo_trade_picks(v_trade.id, v_trade.current_revision, 'TRADE_REVERSED', v_name);

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

-- ============================================================
-- 7. Members: league lookup and the pick choices for two teams
-- ============================================================

-- league_lookup adds current_draft_year (null = picks not tracked).
drop function public.league_lookup(text);

create function public.league_lookup(p_name text)
returns table (league_id uuid, league_name text, madden_version text, current_draft_year integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select l.id, l.name, l.madden_version, l.current_draft_year
    from leagues l
    where l.status = 'ACTIVE' and l.name_key = league_name_key(p_name);
$$;

-- The picks two teams own (for the "whose pick" choice). With p_trade_id
-- (a commissioner correction), the picks that trade moved are shown with the
-- team that gave them, so they can be chosen again.
create or replace function public.league_pick_choices(
    p_name text, p_team_a uuid, p_team_b uuid, p_trade_id uuid default null
)
returns table (
    pick_id uuid,
    draft_year integer,
    round integer,
    original_team_id uuid,
    original_abbreviation text,
    owner_team_id uuid,
    in_this_trade boolean,
    current_draft_year integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with lg as (
        select l.id, l.current_draft_year from leagues l
        where l.status = 'ACTIVE' and l.name_key = league_name_key(p_name) and l.current_draft_year is not null
    ),
    moved as (
        select m.pick_id, m.from_team_id
        from pick_moves m
        join trades t on t.id = m.trade_id
        join lg on lg.id = t.league_id
        where m.trade_id = p_trade_id and m.revision = t.current_revision
          and m.reason in ('TRADE', 'REPLAY') and m.undone_at is null
    )
    select p.id, p.draft_year, p.round, p.original_team_id, ot.abbreviation,
           coalesce(mv.from_team_id, p.owner_team_id), mv.pick_id is not null, lg.current_draft_year
    from draft_picks p
    join lg on lg.id = p.league_id
    join league_teams ot on ot.id = p.original_team_id
    left join moved mv on mv.pick_id = p.id
    where p.status = 'ACTIVE'
      and coalesce(mv.from_team_id, p.owner_team_id) in (p_team_a, p_team_b)
    order by p.draft_year, p.round, ot.abbreviation;
$$;

-- ============================================================
-- 8. Draft rollover hook
-- ============================================================

-- True when the current snapshot (or, if none is marked, the newest export)
-- shows a season at or past the current draft year: the draft has probably
-- happened. The commissioner confirms with Draft complete; an automatic
-- rollover can call commissioner_draft_complete from here later.
create or replace function public.draft_rollover_due(p_league_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
    select coalesce((
        select s.season >= l.current_draft_year
        from leagues l
        join import_snapshots s on s.id = coalesce(l.current_snapshot_id, (
            select x.id from import_snapshots x
            where x.league_id = l.id and x.season is not null
            order by x.first_received_at desc limit 1))
        where l.id = p_league_id and l.current_draft_year is not null
    ), false);
$$;

-- ============================================================
-- 9. Commissioner: picks
-- ============================================================

create or replace function public.commissioner_draft_picks(p_league_id uuid)
returns table (
    pick_id uuid,
    draft_year integer,
    round integer,
    original_team_id uuid,
    original_abbreviation text,
    owner_team_id uuid,
    owner_abbreviation text,
    current_draft_year integer,
    rollover_due boolean,
    latest_season integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.id, p.draft_year, p.round, p.original_team_id, ot.abbreviation,
           p.owner_team_id, wt.abbreviation, l.current_draft_year,
           draft_rollover_due(l.id),
           (select s.season from import_snapshots s
             where s.id = coalesce(l.current_snapshot_id, (
                 select x.id from import_snapshots x
                 where x.league_id = l.id and x.season is not null
                 order by x.first_received_at desc limit 1)))
    from leagues l
    join draft_picks p on p.league_id = l.id and p.status = 'ACTIVE'
    join league_teams ot on ot.id = p.original_team_id
    join league_teams wt on wt.id = p.owner_team_id
    where l.id = p_league_id and l.status = 'ACTIVE'
    order by p.draft_year, p.round, ot.abbreviation;
$$;

-- Moves one pick by hand. Audited as PICK_OWNERSHIP_CHANGED.
create or replace function public.commissioner_set_pick_owner(
    p_league_id uuid, p_pick_id uuid, p_owner_team_id uuid, p_commissioner_name text
)
returns table (pick_id uuid, owner_team_id uuid, owner_abbreviation text, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_pick draft_picks%rowtype;
    v_name text := trim(coalesce(p_commissioner_name, ''));
    v_from text;
    v_to text;
begin
    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;

    select p.* into v_pick from draft_picks p
    join leagues l on l.id = p.league_id and l.status = 'ACTIVE'
    where p.id = p_pick_id and p.league_id = p_league_id
    for update of p;
    if not found then
        raise exception using errcode = 'P0002', message = 'Pick not found in this league.';
    end if;
    if v_pick.status <> 'ACTIVE' then
        raise exception using errcode = '22023', message = 'That pick has already been used.';
    end if;

    select t.abbreviation into v_to from league_teams t where t.id = p_owner_team_id and t.league_id = p_league_id;
    if v_to is null then
        raise exception using errcode = 'P0002', message = 'Team not found in this league.';
    end if;

    if v_pick.owner_team_id = p_owner_team_id then
        return query select v_pick.id, v_pick.owner_team_id, v_to, false;
        return;
    end if;

    select t.abbreviation into v_from from league_teams t where t.id = v_pick.owner_team_id;
    perform move_pick(v_pick.id, p_owner_team_id, 'COMMISSIONER', v_name);

    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (null, null, 'PICK_OWNERSHIP_CHANGED', v_name, null, p_league_id, 'COMMISSIONER', jsonb_build_object(
        'pick', pick_display(v_pick.id), 'from', v_from, 'to', v_to));

    return query select v_pick.id, p_owner_team_id, v_to, true;
end;
$$;

-- Draft complete: the current year's picks are marked used, the next year
-- becomes current, and a new third year is created (each team owns its own).
-- p_expected_year guards against a double click.
create or replace function public.commissioner_draft_complete(
    p_league_id uuid, p_expected_year integer, p_commissioner_name text
)
returns table (current_draft_year integer, picks_retired integer, picks_created integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_name text := trim(coalesce(p_commissioner_name, ''));
    v_retired integer;
    v_created integer;
begin
    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;

    select * into v_league from leagues l where l.id = p_league_id and l.status = 'ACTIVE' for update;
    if not found then
        raise exception using errcode = 'P0002', message = 'League not found.';
    end if;
    if v_league.current_draft_year is null then
        raise exception using errcode = '22023', message = 'Draft picks aren''t set up for this league yet.';
    end if;
    if v_league.current_draft_year is distinct from p_expected_year then
        raise exception using errcode = '22023',
            message = format('The current draft is already %s. Reload the Commissioner tab.', v_league.current_draft_year);
    end if;

    update draft_picks set status = 'USED', updated_at = now()
    where league_id = p_league_id and draft_year = v_league.current_draft_year and status = 'ACTIVE';
    get diagnostics v_retired = row_count;

    update leagues set current_draft_year = v_league.current_draft_year + 1 where id = p_league_id;
    v_created := create_draft_year(p_league_id, v_league.current_draft_year + 3);

    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (null, null, 'DRAFT_COMPLETED', v_name, null, p_league_id, 'COMMISSIONER', jsonb_build_object(
        'draft_year', v_league.current_draft_year,
        'new_current_draft_year', v_league.current_draft_year + 1,
        'picks_retired', v_retired, 'picks_created', v_created));

    return query select v_league.current_draft_year + 1, v_retired, v_created;
end;
$$;

-- ============================================================
-- 10. Commissioner: snapshot review
-- ============================================================

create or replace function public.commissioner_snapshots(p_league_id uuid, p_limit integer default 10)
returns table (
    snapshot_id uuid,
    first_received_at timestamptz,
    status text,
    season integer,
    stage_index integer,
    week integer,
    rosters_received integer,
    teams_in_league integer,
    missing_roster_count integer,
    complete boolean,
    players integer,
    free_agents integer,
    history_failed integer,
    is_current boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select s.id, s.first_received_at, s.status, s.season, s.stage_index, s.week,
           (s.diagnostics ->> 'rosters_received')::integer,
           (s.diagnostics ->> 'teams_in_league')::integer,
           coalesce(jsonb_array_length(case when jsonb_typeof(s.diagnostics -> 'missing_roster_team_ids') = 'array'
                                            then s.diagnostics -> 'missing_roster_team_ids' end), 0),
           coalesce((s.diagnostics ->> 'complete')::boolean, false),
           (select count(*)::integer from player_history h where h.snapshot_id = s.id and h.team_id is not null),
           (select count(*)::integer from player_history h where h.snapshot_id = s.id and h.team_id is null),
           (select count(*)::integer from import_payloads p where p.snapshot_id = s.id and p.history_status = 'FAILED'),
           coalesce(s.id = l.current_snapshot_id, false)
    from import_snapshots s
    join leagues l on l.id = s.league_id and l.status = 'ACTIVE'
    where s.league_id = p_league_id
    order by s.first_received_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

create or replace function public.commissioner_mark_snapshot_current(
    p_league_id uuid, p_snapshot_id uuid, p_commissioner_name text
)
returns table (snapshot_id uuid, season integer, week integer, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_snap import_snapshots%rowtype;
    v_league leagues%rowtype;
    v_name text := trim(coalesce(p_commissioner_name, ''));
begin
    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;

    select * into v_league from leagues l where l.id = p_league_id and l.status = 'ACTIVE' for update;
    if not found then
        raise exception using errcode = 'P0002', message = 'League not found.';
    end if;

    select * into v_snap from import_snapshots s where s.id = p_snapshot_id and s.league_id = p_league_id;
    if not found then
        raise exception using errcode = 'P0002', message = 'Export not found in this league.';
    end if;
    if v_snap.status = 'RECEIVING' and v_snap.last_received_at > now() - interval '10 minutes' then
        raise exception using errcode = '22023', message = 'This export is still arriving. Try again in a few minutes.';
    end if;

    if v_league.current_snapshot_id is not distinct from p_snapshot_id then
        return query select v_snap.id, v_snap.season, v_snap.week, false;
        return;
    end if;

    update leagues
    set current_snapshot_id = p_snapshot_id, current_snapshot_marked_at = now(), current_snapshot_marked_by = v_name
    where id = p_league_id;

    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (null, null, 'SNAPSHOT_MARKED_CURRENT', v_name, null, p_league_id, 'COMMISSIONER', jsonb_build_object(
        'received_at', v_snap.first_received_at, 'season', v_snap.season, 'week', v_snap.week,
        'complete', coalesce((v_snap.diagnostics ->> 'complete')::boolean, false)));

    return query select v_snap.id, v_snap.season, v_snap.week, true;
end;
$$;

-- ============================================================
-- 11. Owner commands (Supabase dashboard)
-- ============================================================

-- Turns on pick tracking: every team owns its own picks for the current draft
-- year and the next two. p_current_draft_year is the next draft to happen
-- (during the 2027 season, that's 2028).
create or replace function public.owner_setup_draft_picks(p_name text, p_current_draft_year integer)
returns table (draft_year integer, picks integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_teams integer;
begin
    v_league := owner_find_league(p_name);
    if v_league.current_draft_year is not null then
        raise exception using errcode = '22023',
            message = format('Draft picks are already set up (current draft %s).', v_league.current_draft_year);
    end if;
    if p_current_draft_year is null or p_current_draft_year not between 2000 and 2200 then
        raise exception using errcode = '22023', message = 'Give the current draft year, e.g. 2028.';
    end if;
    select count(*) into v_teams from league_teams t where t.league_id = v_league.id;
    if v_teams = 0 then
        raise exception using errcode = '22023', message = 'Load the league''s teams first (owner_load_teams).';
    end if;

    update leagues set current_draft_year = p_current_draft_year where id = v_league.id;
    perform create_draft_year(v_league.id, p_current_draft_year);
    perform create_draft_year(v_league.id, p_current_draft_year + 1);
    perform create_draft_year(v_league.id, p_current_draft_year + 2);
    perform owner_audit(v_league.id, 'PICKS_SET_UP', null, jsonb_build_object(
        'current_draft_year', p_current_draft_year, 'teams', v_teams));

    return query
    select p.draft_year, count(*)::integer from draft_picks p
    where p.league_id = v_league.id group by p.draft_year order by p.draft_year;
end;
$$;

-- Picks that aren't with their original team (or every pick of one year).
create or replace function public.owner_draft_picks(p_name text, p_year integer default null)
returns table (draft_year integer, round integer, original_team text, owner_team text, last_move text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.draft_year, p.round, ot.abbreviation, wt.abbreviation,
           (select m.reason || coalesce(' trade #' || tr.trade_number, '') || ' ' ||
                   to_char(m.moved_at at time zone 'America/Chicago', 'YYYY-MM-DD')
              from pick_moves m left join trades tr on tr.id = m.trade_id
             where m.pick_id = p.id order by m.id desc limit 1)
    from draft_picks p
    join league_teams ot on ot.id = p.original_team_id
    join league_teams wt on wt.id = p.owner_team_id
    where p.league_id = (owner_find_league(p_name)).id
      and p.status = 'ACTIVE'
      and (case when p_year is null then p.owner_team_id <> p.original_team_id else p.draft_year = p_year end)
    order by p.draft_year, p.round, ot.abbreviation;
$$;

-- Sets one pick's owner, e.g. ('<LEAGUE>', 2028, 2, 'DAL', 'PHI'). Audited.
create or replace function public.owner_set_pick_owner(
    p_name text, p_year integer, p_round integer, p_original_team text, p_owner_team text
)
returns table (pick text, owner_team text, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_pick draft_picks%rowtype;
    v_owner league_teams%rowtype;
    v_from text;
begin
    v_league := owner_find_league(p_name);

    select p.* into v_pick from draft_picks p
    join league_teams t on t.id = p.original_team_id
    where p.league_id = v_league.id and p.draft_year = p_year and p.round = p_round
      and upper(t.abbreviation) = upper(trim(coalesce(p_original_team, '')))
      and p.status = 'ACTIVE';
    if not found then
        raise exception using errcode = 'P0002', message = format('No active %s round %s pick of %s.', p_year, p_round, p_original_team);
    end if;

    select * into v_owner from league_teams t
    where t.league_id = v_league.id and upper(t.abbreviation) = upper(trim(coalesce(p_owner_team, '')));
    if not found then
        raise exception using errcode = 'P0002', message = format('No team %s in this league.', p_owner_team);
    end if;

    if v_pick.owner_team_id = v_owner.id then
        return query select pick_display(v_pick.id), v_owner.abbreviation, false;
        return;
    end if;

    select t.abbreviation into v_from from league_teams t where t.id = v_pick.owner_team_id;
    perform move_pick(v_pick.id, v_owner.id, 'SITE_OWNER', 'site owner');
    perform owner_audit(v_league.id, 'PICK_OWNERSHIP_CHANGED', null, jsonb_build_object(
        'pick', pick_display(v_pick.id), 'from', v_from, 'to', v_owner.abbreviation));

    return query select pick_display(v_pick.id), v_owner.abbreviation, true;
end;
$$;

-- Updates pick ownership from league trades logged without a pick choice
-- (before tracking started), oldest first. Each pick asset becomes the giving
-- team's own pick of that round and year, or, if the giving team doesn't own
-- it, the only pick of that round and year it does own. Anything else is
-- skipped with the reason (fix those with owner_set_pick_owner). The year is
-- counted from the current draft year, so trades logged in an earlier draft
-- year come out a year late: check them. Safe to run again.
create or replace function public.owner_replay_pick_trades(p_name text)
returns table (trade_number bigint, asset text, pick text, result text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_a record;
    v_round integer;
    v_offset integer;
    v_year integer;
    v_giving uuid;
    v_receiving uuid;
    v_pick_id uuid;
    v_count integer;
    v_giving_abbr text;
    v_receiving_abbr text;
begin
    v_league := owner_find_league(p_name);
    if v_league.current_draft_year is null then
        raise exception using errcode = '22023', message = 'Set up draft picks first (owner_setup_draft_picks).';
    end if;

    for v_a in
        select t.id as trade_id, t.trade_number, t.current_revision, t.submitting_team_id, t.other_team_id,
               a.side, a.position_in_side, a.pick, a.timing
        from trades t
        join trade_assets a on a.trade_id = t.id and a.revision = t.current_revision
        where t.league_id = v_league.id and t.deleted_at is null
          and t.submitting_team_id is not null and t.other_team_id is not null
          and a.asset_type = 'Draft Pick' and a.pick_id is null
        order by t.accepted_at, t.trade_number, a.side, a.position_in_side
    loop
        trade_number := v_a.trade_number;
        asset := case when v_a.side = 'SUBMITTING' then 'S' else 'O' end || v_a.position_in_side;
        pick := coalesce(v_a.pick, '?') || ', ' || coalesce(v_a.timing, '?');

        if v_a.side = 'SUBMITTING' then
            v_giving := v_a.other_team_id; v_receiving := v_a.submitting_team_id;
        else
            v_giving := v_a.submitting_team_id; v_receiving := v_a.other_team_id;
        end if;
        select t.abbreviation into v_giving_abbr from league_teams t where t.id = v_giving;
        select t.abbreviation into v_receiving_abbr from league_teams t where t.id = v_receiving;

        v_round := pick_round(v_a.pick);
        v_offset := pick_year_offset(v_a.timing);
        if v_round is null or v_offset is null then
            result := 'SKIPPED: unknown pick or timing';
            return next;
            continue;
        end if;
        v_year := v_league.current_draft_year + v_offset;

        select p.id into v_pick_id from draft_picks p
        where p.league_id = v_league.id and p.status = 'ACTIVE' and p.draft_year = v_year and p.round = v_round
          and p.original_team_id = v_giving and p.owner_team_id = v_giving;

        if v_pick_id is null then
            select count(*), min(p.id::text)::uuid into v_count, v_pick_id from draft_picks p
            where p.league_id = v_league.id and p.status = 'ACTIVE' and p.draft_year = v_year and p.round = v_round
              and p.owner_team_id = v_giving;
            if v_count <> 1 then
                v_pick_id := null;
                result := format('SKIPPED: %s owns %s %s round %s picks; set it with owner_set_pick_owner',
                                 v_giving_abbr, case when v_count = 0 then 'no' else v_count::text end, v_year, v_round);
                return next;
                continue;
            end if;
        end if;

        perform move_pick(v_pick_id, v_receiving, 'REPLAY', 'site owner', v_a.trade_id, v_a.current_revision);
        update trade_assets ta set pick_id = v_pick_id
        where ta.trade_id = v_a.trade_id and ta.revision = v_a.current_revision
          and ta.side = v_a.side and ta.position_in_side = v_a.position_in_side;
        result := format('MOVED %s: %s -> %s', pick_display(v_pick_id), v_giving_abbr, v_receiving_abbr);
        return next;
    end loop;

    if found then
        perform owner_audit(v_league.id, 'PICK_OWNERSHIP_CHANGED', 'Replayed logged trades', '{}'::jsonb);
    end if;
end;
$$;

-- ============================================================
-- 12. Access
-- ============================================================

alter table public.draft_picks enable row level security;
alter table public.pick_moves enable row level security;
revoke all on table public.draft_picks, public.pick_moves from anon, authenticated;
grant select, insert, update, delete on table public.draft_picks, public.pick_moves to service_role;

revoke all on function public.league_lookup(text) from public, anon, authenticated;
grant execute on function public.league_lookup(text) to anon, authenticated, service_role;
revoke all on function public.league_pick_choices(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.league_pick_choices(text, uuid, uuid, uuid) to anon, authenticated, service_role;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.pick_round(text)', 'public.pick_year_offset(text)', 'public.pick_display(uuid)',
        'public.create_draft_year(uuid, integer)',
        'public.move_pick(uuid, uuid, text, text, uuid, integer)',
        'public.apply_trade_picks(uuid, integer, text)', 'public.undo_trade_picks(uuid, integer, text, text)',
        'public.draft_rollover_due(uuid)',
        'public.commissioner_draft_picks(uuid)', 'public.commissioner_set_pick_owner(uuid, uuid, uuid, text)',
        'public.commissioner_draft_complete(uuid, integer, text)',
        'public.commissioner_snapshots(uuid, integer)', 'public.commissioner_mark_snapshot_current(uuid, uuid, text)',
        'public.insert_trade_assets(uuid, integer, jsonb)',
        'public.submit_league_trade(uuid, uuid, uuid, text, text, jsonb)',
        'public.review_league_trade(uuid, uuid, text, text, text, jsonb)'
    ] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
        execute format('grant execute on function %s to service_role', f);
    end loop;

    foreach f in array array[
        'public.owner_setup_draft_picks(text, integer)', 'public.owner_draft_picks(text, integer)',
        'public.owner_set_pick_owner(text, integer, integer, text, text)', 'public.owner_replay_pick_trades(text)'
    ] loop
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    end loop;
end;
$$;

