-- Madden League Trade Calculator
-- Web Release v1.4.0 storage foundation
-- Ruleset v4.2 remains unchanged.

create extension if not exists pgcrypto;

-- ============================================================
-- Trade Records
-- ============================================================

create table public.trades (
    id uuid primary key default gen_random_uuid(),

    trade_number bigint generated always as identity unique not null,

    accepted_at timestamptz not null default now(),

    web_release text not null,
    ruleset_version text not null,

    user_team_assets jsonb not null default '[]'::jsonb,
    cpu_team_assets jsonb not null default '[]'::jsonb,

    user_raw_value double precision not null,
    cpu_raw_value double precision not null,

    user_adjusted_value double precision not null,
    cpu_adjusted_value double precision not null,

    adjusted_gap double precision not null,

    verdict text not null,

    evaluation_mode text not null,

    protection_tier text,

    required_target double precision,
    fair_maximum double precision,

    trade_intelligence jsonb not null default '[]'::jsonb,

    suggested_correction text,

    deleted_at timestamptz,

    created_at timestamptz not null default now(),

    constraint trades_trade_number_positive
        check (trade_number > 0),

    constraint trades_adjusted_gap_nonnegative
        check (adjusted_gap >= 0),

    constraint trades_verdict_allowed
        check (
            verdict in (
                'FAIR',
                'QUESTIONABLE',
                'UNFAIR',
                'LEAGUE-BREAKING'
            )
        ),

    constraint trades_evaluation_mode_allowed
        check (
            evaluation_mode in (
                'DRAFT_ONLY',
                'POSITIVE_PLAYER_TIE',
                'NO_ELIGIBLE_PLAYER',
                'DIRECTIONAL'
            )
        ),

    constraint trades_protection_tier_allowed
        check (
            protection_tier is null
            or protection_tier in (
                'STANDARD',
                'CORNERSTONE',
                'ELITE_QB'
            )
        )
);

-- Active history is queried most frequently by newest accepted trade.
create index trades_active_history_idx
    on public.trades (accepted_at desc)
    where deleted_at is null;

-- ============================================================
-- Audit Records
-- ============================================================

create table public.audit_events (
    id uuid primary key default gen_random_uuid(),

    trade_id uuid not null
        references public.trades(id),

    trade_number bigint not null,

    action text not null,

    occurred_at timestamptz not null default now(),

    administrator_name text not null,

    reason text,

    constraint audit_events_action_allowed
        check (
            action in (
                'TRADE_DELETED'
            )
        ),

    constraint audit_events_admin_name_not_blank
        check (
            length(trim(administrator_name)) > 0
        ),

    constraint audit_events_trade_number_positive
        check (
            trade_number > 0
        )
);

create index audit_events_trade_id_idx
    on public.audit_events (trade_id);

create index audit_events_occurred_at_idx
    on public.audit_events (occurred_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.trades enable row level security;
alter table public.audit_events enable row level security;

-- Start from an explicit deny-by-default permission model.
revoke all on table public.trades from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;

-- Public visitors need read-only access to active Trade History.
grant select on table public.trades to anon, authenticated;

create policy "Public can read active trades"
on public.trades
for select
to anon, authenticated
using (deleted_at is null);

-- No client-level access is granted to audit_events.
-- Audit access will be implemented later through protected
-- server-side administrative operations.

-- ============================================================
-- Identity sequence privileges
-- ============================================================

-- Client roles do not receive direct sequence privileges.
-- Future accepted-trade creation will use a controlled backend
-- operation rather than unrestricted browser inserts.