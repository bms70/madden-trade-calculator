-- Madden League Trade Calculator
-- Snallabot connection: retention setting per league (backend only; Web Release v1.5.0 maintenance)
-- Ruleset v4.4 remains unchanged.
--
-- Full payload bodies are kept for each league's newest N snapshots, where N
-- is leagues.import_keep_full_snapshots (default 5, decided 2026-11-22; was a
-- fixed 10). Older payloads keep their row, route, size and hash. To change N
-- later, no migration is needed:
--   update public.leagues set import_keep_full_snapshots = <N> where ...;

alter table public.leagues
    add column import_keep_full_snapshots integer not null default 5,
    add constraint leagues_import_keep_range check (import_keep_full_snapshots between 1 and 100);

-- Same receiver as 20261122060000_snallabot_import.sql; the only change is that
-- it trims to the league's own setting instead of a fixed 10.
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
        perform trim_import_payloads(v_league.id, v_league.import_keep_full_snapshots);
    end if;

    return query
    select s.id, s.status, v_inserted = 0, s.request_count
    from import_snapshots s
    where s.id = v_snapshot_id;
end;
$$;

revoke all on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    from public, anon, authenticated;
grant execute on function public.record_snallabot_payload(text, text, bigint, text, jsonb, text, integer)
    to service_role;

-- Apply the new setting to what's already stored.
select public.trim_import_payloads(l.id, l.import_keep_full_snapshots)
from public.leagues l;
