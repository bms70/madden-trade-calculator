-- Madden League Trade Calculator
-- Web Release v1.4.0
-- Correct ambiguous deleted_at reference in atomic Trade deletion.
-- Ruleset v4.2 remains unchanged.

create or replace function public.delete_trade_with_audit(
    p_trade_id uuid,
    p_administrator_name text,
    p_reason text default null
)
returns table (
    trade_id uuid,
    trade_number bigint,
    deleted_at timestamptz,
    audit_event_id uuid,
    audit_occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_trade_number bigint;
    v_deleted_at timestamptz;
    v_audit_event_id uuid;
    v_audit_occurred_at timestamptz;
    v_administrator_name text;
    v_reason text;
begin
    v_administrator_name :=
        trim(coalesce(p_administrator_name, ''));

    if length(v_administrator_name) = 0 then
        raise exception
            using
                errcode = '22023',
                message = 'Administrator Name is required.';
    end if;

    v_reason :=
        nullif(trim(coalesce(p_reason, '')), '');

    update public.trades as t
    set deleted_at = now()
    where t.id = p_trade_id
      and t.deleted_at is null
    returning
        t.trade_number,
        t.deleted_at
    into
        v_trade_number,
        v_deleted_at;

    if not found then
        raise exception
            using
                errcode = 'P0002',
                message =
                    'The Trade was not found or is already deleted.';
    end if;

    insert into public.audit_events (
        trade_id,
        trade_number,
        action,
        administrator_name,
        reason
    )
    values (
        p_trade_id,
        v_trade_number,
        'TRADE_DELETED',
        v_administrator_name,
        v_reason
    )
    returning
        id,
        occurred_at
    into
        v_audit_event_id,
        v_audit_occurred_at;

    return query
    select
        p_trade_id,
        v_trade_number,
        v_deleted_at,
        v_audit_event_id,
        v_audit_occurred_at;
end;
$$;

revoke all
on function public.delete_trade_with_audit(
    uuid,
    text,
    text
)
from public, anon, authenticated;

grant execute
on function public.delete_trade_with_audit(
    uuid,
    text,
    text
)
to service_role;