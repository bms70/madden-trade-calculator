-- Restore protected backend access for Trade and Audit persistence.
-- Browser roles remain restricted by the original migration.

grant select, insert, update, delete
on table public.trades
to service_role;

grant select, insert, update, delete
on table public.audit_events
to service_role;

do $$
declare
  trade_number_sequence text;
begin
  trade_number_sequence :=
    pg_get_serial_sequence('public.trades', 'trade_number');

  if trade_number_sequence is null then
    raise exception
      'No sequence is associated with public.trades.trade_number';
  end if;

  execute format(
    'grant usage, select on sequence %s to service_role',
    trade_number_sequence
  );
end
$$;