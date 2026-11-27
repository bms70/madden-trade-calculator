-- Madden League Trade Calculator
-- Roster moves: show whether each team is human or CPU (backend only; no Web Release).
-- Ruleset v4.4, valuation.js and stored trades are unchanged.
--
-- A NOT LOGGED move between two CPU teams is usually Madden's own CPU trade,
-- which nobody submits. A NOT LOGGED move involving a human team is a trade
-- that probably should have gone through the calculator: check_this = true.
-- Uses each team's current setting in league_teams (USER or CPU).

drop function public.owner_roster_moves(text);

create function public.owner_roster_moves(p_name text)
returns table (
    to_season integer, from_week integer, to_week integer, player text, pos text, ovr integer,
    from_team text, from_control text, to_team text, to_control text,
    status text, check_this boolean, logged_trade_number bigint, roster_id bigint
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
           m.from_team, ft.controlled_by, m.to_team, tt.controlled_by,
           m.status,
           m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER'),
           m.logged_trade_number, m.roster_id
    from roster_moves m
    left join league_teams ft on ft.league_id = m.league_id and ft.abbreviation = m.from_team
    left join league_teams tt on tt.league_id = m.league_id and tt.abbreviation = m.to_team
    where m.league_id = v_league.id
    order by m.received_at desc,
             (m.status = 'NOT LOGGED' and (ft.controlled_by = 'USER' or tt.controlled_by = 'USER')) desc,
             m.status desc, m.player;
end;
$$;

revoke all on function public.owner_roster_moves(text) from public, anon, authenticated, service_role;
