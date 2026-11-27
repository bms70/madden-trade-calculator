-- Madden League Trade Calculator
-- Web Release v4.0: League activity panel and trade posture FYI
-- Ruleset v4.4 and valuation.js remain unchanged.
--
-- * Trade posture FYI: each League submission stores the posture shown for
--   both teams (record, week, label, strength, warnings) in trades.posture.
--   Information only; it never changes a value or verdict. Corrections keep
--   the posture from submission.
-- * league_posture_inputs(name): each team's record from the league's
--   current export (or the newest), for the FYI's pre-filled records.
-- * League activity (commissioner): roster moves between recent exports with
--   human / CPU, a "handled" mark with a note (roster_move_reviews), trades
--   to check (not seen in Madden, players not linked), player candidates and
--   linking. Audited: ROSTER_MOVE_HANDLED, TRADE_PLAYER_LINKED.

-- ============================================================
-- 1. Audit actions, posture column, handled moves
-- ============================================================

alter table public.audit_events
    drop constraint audit_events_action_allowed,
    add constraint audit_events_action_allowed check (
        action in (
            'TRADE_DELETED', 'TRADE_REVIEWED', 'TRADE_CORRECTED', 'TRADE_REVERSED',
            'LEAGUE_CREATED', 'LEAGUE_RENAMED', 'LEAGUE_STATUS_CHANGED',
            'COMMISSIONER_PASSWORD_SET', 'IMPORT_SECRET_ROTATED', 'TEAM_UPDATED',
            'CALENDAR_UPDATED', 'PICK_OWNERSHIP_CHANGED', 'SNAPSHOT_MARKED_CURRENT',
            'SNAPSHOT_REJECTED', 'PRE_LEAGUE_MIGRATION', 'PICKS_SET_UP', 'DRAFT_COMPLETED',
            'ROSTER_MOVE_HANDLED', 'TRADE_PLAYER_LINKED'
        )
    );

alter table public.trades add column posture jsonb;

create table public.roster_move_reviews (
    league_id uuid not null references public.leagues(id),
    roster_id bigint not null,
    to_snapshot_id uuid not null references public.import_snapshots(id),
    handled_by text not null,
    note text,
    handled_at timestamptz not null default now(),
    primary key (league_id, roster_id, to_snapshot_id),
    constraint roster_move_reviews_note_length check (note is null or length(note) <= 300)
);

-- ============================================================
-- 2. Members: the records behind the posture FYI
-- ============================================================

-- One row per team: its record in the league's current export (or, if none
-- is marked, the newest export with standings).
create or replace function public.league_posture_inputs(p_name text)
returns table (
    team_id uuid,
    abbreviation text,
    wins integer,
    losses integer,
    ties integer,
    season integer,
    stage_index integer,
    week integer,
    received_at timestamptz,
    is_current boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with lg as (
        select l.id, l.current_snapshot_id from leagues l
        where l.status = 'ACTIVE' and l.name_key = league_name_key(p_name)
    ),
    snap as (
        select s.id, s.first_received_at, coalesce(s.id = lg.current_snapshot_id, false) as is_current
        from lg join import_snapshots s on s.id = coalesce(lg.current_snapshot_id, (
            select x.id from import_snapshots x
            where x.league_id = lg.id and exists (select 1 from team_history h where h.snapshot_id = x.id)
            order by x.first_received_at desc limit 1))
    )
    select distinct on (lt.id)
           lt.id, lt.abbreviation, h.wins, h.losses, h.ties, h.season, h.stage_index, h.week,
           snap.first_received_at, snap.is_current
    from snap
    join team_history h on h.snapshot_id = snap.id
    join league_teams lt on lt.id = league_team_of(h.league_id, h.team_id)
    order by lt.id, h.received_at desc;
$$;


-- ============================================================
-- 3. Submit: same as 20261127040000, plus the posture
-- ============================================================

drop function public.submit_league_trade(uuid, uuid, uuid, text, text, jsonb);

create function public.submit_league_trade(
    p_league_id uuid,
    p_submitting_team_id uuid,
    p_other_team_id uuid,
    p_submitter_name text,
    p_submitter_note text,
    p_trade jsonb,
    p_posture jsonb default null
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

    -- Web v4.0: the trade posture FYI shown when the trade was submitted.
    if p_posture is not null and (jsonb_typeof(p_posture) <> 'object' or length(p_posture::text) > 4000) then
        raise exception using errcode = '22023', message = 'The posture information is invalid.';
    end if;

    insert into trades (
        web_release, ruleset_version, user_team_assets, cpu_team_assets,
        user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value,
        adjusted_gap, verdict, evaluation_mode, protection_tier,
        required_target, fair_maximum, trade_intelligence, suggested_correction,
        league_id, submitting_team_id, other_team_id, review_status,
        submitter_name, submitter_note, current_revision, posture
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
        v_name, v_note, 0, p_posture
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

-- ============================================================
-- 4. League history adds the posture (members see the FYI that was shown)
-- ============================================================

drop function public.league_trade_history(text);

create function public.league_trade_history(p_name text)
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
    suggested_correction text,
    posture jsonb
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
        tr.required_target, tr.fair_maximum, tr.trade_intelligence, tr.suggested_correction, tr.posture
    from trades tr
    join leagues l on l.id = tr.league_id
    left join league_teams st on st.id = tr.submitting_team_id
    left join league_teams ot on ot.id = tr.other_team_id
    where l.status = 'ACTIVE'
      and l.name_key = league_name_key(p_name)
      and tr.deleted_at is null
    order by tr.accepted_at desc;
$$;

-- ============================================================
-- 5. Commissioner: League activity
-- ============================================================

-- Roster moves from the newest p_exports exports (pairs of consecutive
-- exports), with human / CPU, check_this and the handled mark.
create or replace function public.commissioner_roster_moves(p_league_id uuid, p_exports integer default 4)
returns table (
    to_snapshot_id uuid,
    received_at timestamptz,
    from_week integer,
    to_season integer,
    to_week integer,
    roster_id bigint,
    player text,
    pos text,
    ovr integer,
    from_team text,
    from_status text,
    from_control text,
    to_team text,
    to_status text,
    to_control text,
    status text,
    check_this boolean,
    contract_changed boolean,
    logged_trade_number bigint,
    handled_by text,
    handled_note text,
    handled_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform ledger_refresh(p_league_id);
    return query
    with recent as (
        select s.id from import_snapshots s
        where s.league_id = p_league_id and s.season is not null
          and exists (select 1 from player_history h where h.snapshot_id = s.id)
        order by s.first_received_at desc
        limit greatest(1, least(coalesce(p_exports, 4), 20))
    )
    select m.to_snapshot_id, m.received_at, m.from_week, m.to_season, m.to_week, m.roster_id,
           m.player, m.position, m.ovr,
           m.from_team, m.from_status, ft.controlled_by,
           m.to_team, m.to_status, tt.controlled_by,
           m.status,
           m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER'),
           m.contract_changed, m.logged_trade_number,
           r.handled_by, r.note, r.handled_at
    from roster_moves m
    join recent on recent.id = m.to_snapshot_id
    left join league_teams ft on ft.id = m.from_team_id
    left join league_teams tt on tt.id = m.to_team_id
    left join roster_move_reviews r
      on r.league_id = m.league_id and r.roster_id = m.roster_id and r.to_snapshot_id = m.to_snapshot_id
    where m.league_id = p_league_id
    order by m.received_at desc,
             (m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER')) desc,
             (m.status in ('SIGNING', 'RELEASE', 'PRACTICE SQUAD')), m.status desc, m.player;
end;
$$;

-- Marks a move handled (with an optional note), or clears the mark.
create or replace function public.commissioner_mark_move_handled(
    p_league_id uuid, p_roster_id bigint, p_to_snapshot_id uuid,
    p_handled boolean, p_note text, p_commissioner_name text
)
returns table (handled boolean, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text := trim(coalesce(p_commissioner_name, ''));
    v_note text := nullif(trim(coalesce(p_note, '')), '');
    v_player text;
    v_count integer;
begin
    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;
    if v_note is not null and length(v_note) > 300 then
        raise exception using errcode = '22023', message = 'The note must be 300 characters or fewer.';
    end if;

    select m.player into v_player from roster_moves m
    where m.league_id = p_league_id and m.roster_id = p_roster_id and m.to_snapshot_id = p_to_snapshot_id;
    if v_player is null then
        raise exception using errcode = 'P0002', message = 'Move not found in this league.';
    end if;

    if p_handled then
        insert into roster_move_reviews (league_id, roster_id, to_snapshot_id, handled_by, note)
        values (p_league_id, p_roster_id, p_to_snapshot_id, v_name, v_note)
        on conflict (league_id, roster_id, to_snapshot_id) do update
        set handled_by = excluded.handled_by, note = excluded.note, handled_at = now();
        v_count := 1;
    else
        delete from roster_move_reviews r
        where r.league_id = p_league_id and r.roster_id = p_roster_id and r.to_snapshot_id = p_to_snapshot_id;
        get diagnostics v_count = row_count;
    end if;

    if v_count > 0 then
        insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
        values (null, null, 'ROSTER_MOVE_HANDLED', v_name, v_note, p_league_id, 'COMMISSIONER',
                jsonb_build_object('player', v_player, 'handled', p_handled));
    end if;

    return query select p_handled, v_count > 0;
end;
$$;

-- Trades worth a look: a linked player not seen on the new team in a later
-- export, or a player that couldn't be linked.
create or replace function public.commissioner_ledger_issues(p_league_id uuid)
returns table (
    trade_id uuid,
    trade_number bigint,
    accepted_at timestamptz,
    review_status text,
    asset_ref text,
    from_team text,
    to_team text,
    asset text,
    pos text,
    ovr integer,
    match_status text,
    matched_player text,
    roster_id bigint,
    seen_in_game text,
    issue text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform ledger_refresh(p_league_id);
    return query
    select l.trade_id, l.trade_number, l.accepted_at, l.review_status, l.asset_ref,
           l.from_team, l.to_team, coalesce(l.name, '(no name)'), l.pos, l.ovr,
           l.match_status, l.matched_player, l.roster_id, l.seen_in_game,
           case when l.match_status in ('AMBIGUOUS', 'UNMATCHED') then 'NOT LINKED'
                else 'NOT SEEN IN GAME' end
    from trade_ledger l
    where l.league_id = p_league_id
      and l.asset_type = 'Player'
      and (l.match_status in ('AMBIGUOUS', 'UNMATCHED') or l.seen_in_game = 'NO')
    order by l.trade_number desc, l.asset_ref;
end;
$$;

-- Players who could be the one in a trade asset: both teams' rosters in the
-- trade's export (same v4.4 position first).
create or replace function public.commissioner_player_candidates(p_league_id uuid, p_trade_id uuid)
returns table (roster_id bigint, player text, pos text, ovr integer, age integer, team text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with t as (
        select tr.id, tr.submitting_team_id, tr.other_team_id,
               ledger_trade_snapshot(tr.league_id, tr.accepted_at) as snapshot_id
        from trades tr
        where tr.id = p_trade_id and tr.league_id = p_league_id and tr.deleted_at is null
    )
    select distinct on (h.roster_id)
           h.roster_id, trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')),
           v44_position(h.position), h.ovr, h.age, lt.abbreviation
    from t
    join player_history h on h.snapshot_id = t.snapshot_id
    join league_teams lt on lt.id = league_team_of(h.league_id, h.team_id)
    where lt.id in (t.submitting_team_id, t.other_team_id)
    order by h.roster_id, h.received_at desc;
$$;

-- Links a trade's player to a Madden player (null = back to automatic).
create or replace function public.commissioner_link_trade_player(
    p_league_id uuid, p_trade_id uuid, p_asset_ref text, p_roster_id bigint, p_commissioner_name text
)
returns table (asset_ref text, match_status text, matched_player text, roster_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trade trades%rowtype;
    v_ref text := upper(trim(coalesce(p_asset_ref, '')));
    v_side text;
    v_pos integer;
    v_name text := trim(coalesce(p_commissioner_name, ''));
begin
    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;

    select * into v_trade from trades t
    where t.id = p_trade_id and t.league_id = p_league_id and t.deleted_at is null;
    if not found then
        raise exception using errcode = 'P0002', message = 'Trade not found in this league.';
    end if;

    if v_ref !~ '^[SO][0-9]{1,2}$' then
        raise exception using errcode = '22023', message = 'Asset must look like S1 or O2.';
    end if;
    v_side := case when left(v_ref, 1) = 'S' then 'SUBMITTING' else 'OTHER' end;
    v_pos := substr(v_ref, 2)::integer;

    if not exists (select 1 from trade_assets a
                   where a.trade_id = v_trade.id and a.revision = v_trade.current_revision
                     and a.side = v_side and a.position_in_side = v_pos and a.asset_type = 'Player') then
        raise exception using errcode = 'P0002', message = 'That trade has no such player.';
    end if;

    if p_roster_id is not null and not exists (
        select 1 from player_history h where h.league_id = p_league_id and h.roster_id = p_roster_id) then
        raise exception using errcode = 'P0002', message = 'No such player in this league''s exports.';
    end if;

    delete from trade_ledger_links k
    where k.trade_id = v_trade.id and k.revision = v_trade.current_revision
      and k.side = v_side and k.position_in_side = v_pos;

    if p_roster_id is not null then
        insert into trade_ledger_links (trade_id, revision, side, position_in_side, roster_id,
            match_status, match_method, snapshot_id, set_by)
        values (v_trade.id, v_trade.current_revision, v_side, v_pos, p_roster_id,
            'MANUAL', 'COMMISSIONER', ledger_trade_snapshot(p_league_id, v_trade.accepted_at), v_name);
    end if;

    perform ledger_refresh(p_league_id);

    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (v_trade.id, v_trade.trade_number, 'TRADE_PLAYER_LINKED', v_name, null, p_league_id, 'COMMISSIONER',
            jsonb_build_object('asset', v_ref, 'roster_id', p_roster_id));

    return query
    select l.asset_ref, l.match_status,
           coalesce(l.matched_player, (select trim(h.first_name || ' ' || h.last_name) from player_history h
                                        where h.league_id = p_league_id and h.roster_id = l.roster_id
                                        order by h.received_at desc limit 1)),
           l.roster_id
    from trade_ledger l
    where l.trade_id = v_trade.id and l.asset_ref = v_ref;
end;
$$;

-- ============================================================
-- 6. Access
-- ============================================================

alter table public.roster_move_reviews enable row level security;
revoke all on table public.roster_move_reviews from anon, authenticated;
grant select, insert, update, delete on table public.roster_move_reviews to service_role;

revoke all on function public.league_posture_inputs(text) from public, anon, authenticated;
grant execute on function public.league_posture_inputs(text) to anon, authenticated, service_role;
revoke all on function public.league_trade_history(text) from public, anon, authenticated;
grant execute on function public.league_trade_history(text) to anon, authenticated, service_role;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.submit_league_trade(uuid, uuid, uuid, text, text, jsonb, jsonb)',
        'public.commissioner_roster_moves(uuid, integer)',
        'public.commissioner_mark_move_handled(uuid, bigint, uuid, boolean, text, text)',
        'public.commissioner_ledger_issues(uuid)',
        'public.commissioner_player_candidates(uuid, uuid)',
        'public.commissioner_link_trade_player(uuid, uuid, text, bigint, text)'
    ] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
        execute format('grant execute on function %s to service_role', f);
    end loop;
end;
$$;

