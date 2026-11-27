-- Madden League Trade Calculator
-- Roster moves: practice-squad moves and a reliable contract hint
-- (backend only; no Web Release). Ruleset v4.4, valuation.js and stored trades unchanged.
--
-- Checked on live data 2026-11-27 (week 8 -> 9): cap hit changed for all 5 players
-- who moved and none of the 2,048 who stayed, and bonus for 4 of 5 movers, because
-- a traded player's bonus stays with the old team. Salary, length and years left
-- changed for 6 of 2,048 stayers and 2 of 5 movers. So contract_changed now uses
-- salary, length and years left only.
--
-- An unlogged move to or from a practice squad on another team (signed off a
-- practice squad, or cut and signed to one) gets status PRACTICE SQUAD and is not
-- flagged by check_this. A logged trade still shows LOGGED.

-- ============================================================
-- 1. Roster moves
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
        h.contract_length, h.contract_salary, h.contract_years_left
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
             -- Bonus and cap hit change with every trade (the bonus stays with the
             -- old team), so only salary, length and years left signal a new contract.
             else (a.contract_length, a.contract_salary, a.contract_years_left)
                  is distinct from (b.contract_length, b.contract_salary, b.contract_years_left) end as contract_changed
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
         then 'LOGGED'
         -- Signed off another team's practice squad, or cut and signed to one.
         when 'PRACTICE SQUAD' in (m.from_status, m.to_status) then 'PRACTICE SQUAD'
         else 'NOT LOGGED' end as status,
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
-- 2. Owner: practice-squad moves sort with signings and releases
-- ============================================================

create or replace function public.owner_roster_moves(p_name text)
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
             (m.status in ('SIGNING', 'RELEASE', 'PRACTICE SQUAD')), m.status desc, m.player;
end;
$$;
