-- Madden League Trade Calculator
-- Web Release v1.4.0
-- Atomic logical Trade deletion and Audit Event creation
-- Ruleset v4.2 remains unchanged.

-- Prevent more than one successful deletion Audit Event
-- from being recorded for the same Trade.
create unique index if not exists
    audit_events_one_trade_deleted_idx
on public.audit_events (trade_id)
where action = 'TRADE_DELETED';

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

    -- Treat a blank or whitespace-only optional reason as absent.
    v_reason :=
        nullif(trim(coalesce(p_reason, '')), '');

    -- Only an active Trade may be logically deleted.
    -- The row update and Audit Event insert occur in the same
    -- database function call and therefore succeed or fail together.
    update public.trades
    set deleted_at = now()
    where id = p_trade_id
      and deleted_at is null
    returning
        public.trades.trade_number,
        public.trades.deleted_at
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

-- The operation is backend-only.
-- Public browser roles cannot execute it directly.
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