-- Madden League Trade Calculator
-- Web Release v2.1: commissioner team editing
-- Ruleset v4.4 remains unchanged.
--
-- The commissioner sets each team's human / CPU control and owner label from
-- the Commissioner tab (Q26). Both functions are service-role only: the
-- commissioner-teams Edge Function calls them after checking the session
-- token, always with the token's league.
--
-- owner_label is shown only in the Commissioner area; the public team list
-- (league_team_list) still leaves it out. owner_load_teams (site owner)
-- overwrites these settings from Snallabot when it is run.

-- ============================================================
-- 1. The league's teams, with owner labels (Commissioner area)
-- ============================================================

create or replace function public.commissioner_league_teams(p_league_id uuid)
returns table (
    team_id uuid,
    abbreviation text,
    city_name text,
    nickname text,
    division text,
    controlled_by text,
    owner_label text,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select t.id, t.abbreviation, t.city_name, t.nickname, t.division,
           t.controlled_by, t.owner_label, t.updated_at
    from league_teams t
    join leagues l on l.id = t.league_id and l.status = 'ACTIVE'
    where t.league_id = p_league_id
    order by t.division nulls last, t.city_name, t.nickname;
$$;

-- ============================================================
-- 2. Update one team
-- ============================================================

-- p_controlled_by: 'USER' (human) or 'CPU'. p_owner_label: text up to 60
-- characters; empty or null clears it. Raises P0002 when the team isn't in
-- this league, 22023 for invalid input. Audited as TEAM_UPDATED by the
-- commissioner, with the before and after values. A save that changes
-- nothing returns the team without an audit event.
create or replace function public.commissioner_update_team(
    p_league_id uuid,
    p_team_id uuid,
    p_controlled_by text,
    p_owner_label text,
    p_commissioner_name text
)
returns table (
    team_id uuid,
    abbreviation text,
    controlled_by text,
    owner_label text,
    changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_team league_teams%rowtype;
    v_control text := upper(trim(coalesce(p_controlled_by, '')));
    v_label text := nullif(trim(coalesce(p_owner_label, '')), '');
    v_name text := trim(coalesce(p_commissioner_name, ''));
begin
    if v_control not in ('USER', 'CPU') then
        raise exception using errcode = '22023', message = 'Choose Human or CPU.';
    end if;

    if v_label is not null and length(v_label) > 60 then
        raise exception using errcode = '22023', message = 'The owner label must be 60 characters or fewer.';
    end if;

    if length(v_name) not between 1 and 60 then
        raise exception using errcode = '22023', message = 'Commissioner name must be 1 to 60 characters.';
    end if;

    select t.* into v_team
    from league_teams t
    join leagues l on l.id = t.league_id and l.status = 'ACTIVE'
    where t.id = p_team_id and t.league_id = p_league_id
    for update of t;

    if not found then
        raise exception using errcode = 'P0002', message = 'Team not found in this league.';
    end if;

    if v_team.controlled_by is not distinct from v_control
       and v_team.owner_label is not distinct from v_label then
        return query select v_team.id, v_team.abbreviation, v_team.controlled_by, v_team.owner_label, false;
        return;
    end if;

    update league_teams t
    set controlled_by = v_control,
        owner_label = v_label,
        updated_at = now()
    where t.id = v_team.id;

    insert into audit_events (trade_id, trade_number, action, administrator_name, reason, league_id, actor_role, details)
    values (null, null, 'TEAM_UPDATED', v_name, null, p_league_id, 'COMMISSIONER', jsonb_build_object(
        'source', 'commissioner',
        'team', v_team.abbreviation,
        'controlled_by_before', v_team.controlled_by,
        'controlled_by_after', v_control,
        'owner_label_changed', v_team.owner_label is distinct from v_label));

    return query select v_team.id, v_team.abbreviation, v_control, v_label, true;
end;
$$;

-- ============================================================
-- 3. Access: service role only
-- ============================================================

revoke all on function public.commissioner_league_teams(uuid) from public, anon, authenticated;
revoke all on function public.commissioner_update_team(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.commissioner_league_teams(uuid) to service_role;
grant execute on function public.commissioner_update_team(uuid, uuid, text, text, text) to service_role;
