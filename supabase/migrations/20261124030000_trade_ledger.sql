-- Madden League Trade Calculator
-- Transaction ledger (backend only; no Web Release; Phase 4 groundwork for Ruleset v5.0)
-- Ruleset v4.4, valuation.js, the snapshot contract and stored trades are unchanged.
-- Nothing on the website reads these objects.
--
--   trade_ledger        one row per asset of each league trade's current revision:
--                       from team -> to team, league season/week, the linked
--                       Madden player (rosterId), duplicate and in-game checks
--   trade_ledger_links  player links found by name matching (or set by the owner)
--   roster_moves        players who changed teams between consecutive exports,
--                       with the logged trade that explains the move, if any
--
-- Reversed trades are left out. Unreviewed trades are in, with their status.
-- Guide: docs/roadmap/v5/V5_TRADE_LEDGER.md

-- ============================================================
-- 1. Name helpers
-- ============================================================

-- 'Ja''Marr Chase Jr.' -> 'jamarrchase'
create or replace function public.ledger_name_key(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select nullif(regexp_replace(
        regexp_replace(lower(coalesce(p_name, '')), '\m(jr|sr|ii|iii|iv|v)\M\.?', '', 'g'),
        '[^a-z]', '', 'g'), '');
$$;

create or replace function public.ledger_levenshtein(a text, b text)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
    la integer := length(a);
    lb integer := length(b);
    prev integer[];
    cur integer[];
    i integer;
    j integer;
begin
    if a is null or b is null then return null; end if;
    if la = 0 then return lb; end if;
    if lb = 0 then return la; end if;
    prev := array(select generate_series(0, lb));
    for i in 1..la loop
        cur := array[i];
        for j in 1..lb loop
            cur := cur || least(
                prev[j + 1] + 1,
                cur[j] + 1,
                prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
        end loop;
        prev := cur;
    end loop;
    return prev[lb + 1];
end;
$$;

-- ============================================================
-- 2. Which export a trade belongs to
-- ============================================================

-- The newest export of the league received at or before the trade (with a
-- known season/week). Null when the trade predates every export.
create or replace function public.ledger_trade_snapshot(p_league_id uuid, p_accepted_at timestamptz)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
    select s.id
    from import_snapshots s
    where s.league_id = p_league_id
      and s.season is not null
      and s.first_received_at <= p_accepted_at
      and exists (select 1 from player_history h where h.snapshot_id = s.id)
    order by s.first_received_at desc
    limit 1;
$$;

-- ============================================================
-- 3. Player links
-- ============================================================

create table public.trade_ledger_links (
    trade_id uuid not null,
    revision integer not null,
    side text not null,
    position_in_side integer not null,

    roster_id bigint,
    match_status text not null,
    match_method text,
    matched_from text,                        -- GIVING or RECEIVING team's roster
    snapshot_id uuid references public.import_snapshots(id),
    set_by text not null default 'auto',
    updated_at timestamptz not null default now(),

    primary key (trade_id, revision, side, position_in_side),
    foreign key (trade_id, revision, side, position_in_side)
        references public.trade_assets (trade_id, revision, side, position_in_side),

    constraint trade_ledger_links_status_allowed check (
        match_status in ('EXACT', 'CLOSE', 'MANUAL', 'AMBIGUOUS', 'UNMATCHED', 'NO_DATA')
    ),
    constraint trade_ledger_links_roster_consistent check (
        (match_status in ('EXACT', 'CLOSE', 'MANUAL')) = (roster_id is not null)
    ),
    constraint trade_ledger_links_from_allowed check (
        matched_from is null or matched_from in ('GIVING', 'RECEIVING')
    )
);

-- Finds one player on a team's roster in one export.
--   EXACT: full name matches (position breaks a tie)
--   CLOSE: last name only, first initial + last name, a small typo (<= 2
--          letters), or no name but position + OVR (+ age) match one player
-- Returns no row when nothing is found; status AMBIGUOUS when several fit.
create or replace function public.ledger_match_on_team(
    p_snapshot_id uuid, p_team_ext bigint,
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
    where h.snapshot_id = p_snapshot_id and h.team_id = p_team_ext
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

-- Rebuilds the automatic links of one league. Owner links (MANUAL) on the
-- current revision are kept; a commissioner correction starts that trade over.
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
    v_giving bigint;
    v_receiving bigint;
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
               case when a.side = 'SUBMITTING' then ot.external_team_id else st.external_team_id end as giving_ext,
               case when a.side = 'SUBMITTING' then st.external_team_id else ot.external_team_id end as receiving_ext
        from trades t
        join trade_assets a on a.trade_id = t.id and a.revision = t.current_revision
        join league_teams st on st.id = t.submitting_team_id
        join league_teams ot on ot.id = t.other_team_id
        where t.league_id = p_league_id
          and t.deleted_at is null
          and a.asset_type = 'Player'
          and not exists (
              select 1 from trade_ledger_links k
              where k.trade_id = a.trade_id and k.revision = a.revision
                and k.side = a.side and k.position_in_side = a.position_in_side)
    loop
        v_snapshot := ledger_trade_snapshot(p_league_id, v_a.accepted_at);
        v_giving := v_a.giving_ext;
        v_receiving := v_a.receiving_ext;
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

-- ============================================================
-- 4. The ledger
-- ============================================================

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
              and h.team_id = tt.external_team_id
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

-- ============================================================
-- 5. Roster moves between consecutive exports
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
        a.team_id as from_team_ext,
        b.team_id as to_team_ext
    from snaps sn
    join players a on a.snapshot_id = sn.prev_id
    join players b on b.snapshot_id = sn.id and b.roster_id = a.roster_id
    where sn.prev_id is not null
      and a.team_id is distinct from b.team_id
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
left join league_teams ft on ft.league_id = m.league_id and ft.external_team_id = m.from_team_ext
left join league_teams tt on tt.league_id = m.league_id and tt.external_team_id = m.to_team_ext;

-- ============================================================
-- 6. Owner commands (Supabase dashboard)
-- ============================================================

-- The league's ledger, newest trade first (refreshes automatic links first).
create or replace function public.owner_trade_ledger(p_name text)
returns table (
    trade_number bigint, accepted date, review_status text, revision integer, season integer, week integer,
    asset_ref text, from_team text, to_team text, asset text, ovr integer, pos text,
    match_status text, matched_player text, roster_id bigint, matched_from text,
    seen_in_game text, possible_duplicate_of bigint
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
    select l.trade_number, (l.accepted_at at time zone 'America/Chicago')::date, l.review_status, l.revision,
           l.season, l.week, l.asset_ref, l.from_team, l.to_team,
           case when l.asset_type = 'Draft Pick' then l.pick || ' (' || coalesce(l.timing, '') || ')'
                else coalesce(l.name, '(no name)') end,
           l.ovr, l.pos, l.match_status, l.matched_player, l.roster_id, l.matched_from,
           l.seen_in_game, l.possible_duplicate_of
    from trade_ledger l
    where l.league_id = v_league.id
    order by l.trade_number desc, l.asset_ref;
end;
$$;

-- Players who changed teams between exports, newest first. LOGGED = a league
-- trade moved that player between those teams, submitted from 30 days before
-- the earlier export to 7 days after the later one. NOT LOGGED = none did (or
-- its player isn't linked yet).
create or replace function public.owner_roster_moves(p_name text)
returns table (
    to_season integer, from_week integer, to_week integer, player text, pos text, ovr integer,
    from_team text, to_team text, status text, logged_trade_number bigint, roster_id bigint
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
           m.from_team, m.to_team, m.status, m.logged_trade_number, m.roster_id
    from roster_moves m
    where m.league_id = v_league.id
    order by m.received_at desc, m.status desc, m.player;
end;
$$;

-- Link a trade's player to a Madden player by hand, e.g.
--   select * from owner_link_trade_player('<LEAGUE>', 12, 'O1', 555222703);
-- p_asset_ref is the ledger's asset column (S = to the submitting team, O = to
-- the other team, then its number). A null roster ID returns it to automatic.
create or replace function public.owner_link_trade_player(
    p_name text, p_trade_number bigint, p_asset_ref text, p_roster_id bigint
)
returns table (trade_number bigint, asset_ref text, match_status text, matched_player text, roster_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_league leagues%rowtype;
    v_trade trades%rowtype;
    v_ref text := upper(trim(coalesce(p_asset_ref, '')));
    v_side text;
    v_pos integer;
begin
    v_league := owner_find_league(p_name);

    select * into v_trade from trades t
    where t.league_id = v_league.id and t.trade_number = p_trade_number and t.deleted_at is null;
    if not found then
        raise exception using errcode = 'P0002', message = format('No active trade #%s in this league.', p_trade_number);
    end if;

    if v_ref !~ '^[SO][0-9]{1,2}$' then
        raise exception using errcode = '22023', message = 'Asset must look like S1 or O2 (see owner_trade_ledger).';
    end if;
    v_side := case when left(v_ref, 1) = 'S' then 'SUBMITTING' else 'OTHER' end;
    v_pos := substr(v_ref, 2)::integer;

    if not exists (select 1 from trade_assets a
                   where a.trade_id = v_trade.id and a.revision = v_trade.current_revision
                     and a.side = v_side and a.position_in_side = v_pos and a.asset_type = 'Player') then
        raise exception using errcode = 'P0002', message = format('Trade #%s has no player %s.', p_trade_number, v_ref);
    end if;

    if p_roster_id is not null and not exists (
        select 1 from player_history h where h.league_id = v_league.id and h.roster_id = p_roster_id) then
        raise exception using errcode = 'P0002', message = format('No player with roster ID %s in this league''s exports.', p_roster_id);
    end if;

    delete from trade_ledger_links k
    where k.trade_id = v_trade.id and k.revision = v_trade.current_revision
      and k.side = v_side and k.position_in_side = v_pos;

    if p_roster_id is not null then
        insert into trade_ledger_links (trade_id, revision, side, position_in_side, roster_id,
            match_status, match_method, snapshot_id, set_by)
        values (v_trade.id, v_trade.current_revision, v_side, v_pos, p_roster_id,
            'MANUAL', 'OWNER', ledger_trade_snapshot(v_league.id, v_trade.accepted_at), 'site owner');
    end if;

    perform ledger_refresh(v_league.id);

    return query
    select l.trade_number, l.asset_ref, l.match_status,
           coalesce(l.matched_player, (select trim(h.first_name || ' ' || h.last_name) from player_history h
                                        where h.league_id = v_league.id and h.roster_id = l.roster_id
                                        order by h.received_at desc limit 1)),
           l.roster_id
    from trade_ledger l
    where l.trade_id = v_trade.id and l.asset_ref = v_ref;
end;
$$;

-- ============================================================
-- 7. Access: no browser access
-- ============================================================

alter table public.trade_ledger_links enable row level security;
revoke all on table public.trade_ledger_links from anon, authenticated;
revoke all on table public.trade_ledger, public.roster_moves from anon, authenticated;
grant select on table public.trade_ledger_links, public.trade_ledger, public.roster_moves to service_role;
grant insert, update, delete on table public.trade_ledger_links to service_role;

revoke all on function public.ledger_refresh(uuid) from public, anon, authenticated;
grant execute on function public.ledger_refresh(uuid) to service_role;
revoke all on function public.ledger_match_on_team(uuid, bigint, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.ledger_trade_snapshot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ledger_match_on_team(uuid, bigint, text, text, integer, integer) to service_role;
grant execute on function public.ledger_trade_snapshot(uuid, timestamptz) to service_role;

revoke all on function public.owner_trade_ledger(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_roster_moves(text) from public, anon, authenticated, service_role;
revoke all on function public.owner_link_trade_player(text, bigint, text, bigint) from public, anon, authenticated, service_role;
