-- ============================================================================
-- V5_SAMPLE_SCHEMA.sql
-- Madden League Trade Calculator - Ruleset v5.0 roadmap, Phase 1
--
-- SAMPLE NORMALIZED SCHEMA. A design draft, NOT a migration.
--   - Do not copy into supabase/migrations/ as is. Web v2.0 and v3.0 turn the
--     relevant parts into real, reviewed migrations (V5_PHASE_PLAN.md).
--   - Written to run on top of the four existing v1.4.0 migrations, so it can be
--     tested against a scratch database. It never drops or rewrites existing
--     data; it only adds tables and additive columns.
--   - Ruleset v4.4 is unchanged. Every asset column here maps one-for-one to an
--     existing calculator input with the same validation (V5_LEAGUE_DATA_SPEC.md).
--   - Fields still to confirm on the main-league capture are marked "CAPTURE".
--
-- Sections
--   0. Conventions
--   1. Leagues and teams                       (Web v2.0)
--   2. League trades: trades + revisions + assets (Web v2.0)
--   3. Audit records                            (Web v2.0)
--   4. Calendar and draft-pick ownership        (Web v2.0 calendar, v3.0 picks)
--   5. Imports: snapshots, payloads, players, standings (Web v3.0)
--   6. Access: row-level security and RPCs      (Web v2.0)
--   7. Pre-league history migration sketch      (Web v2.0)
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. Conventions
-- ============================================================================
-- * Every league-owned row carries league_id (A17). One league now, several later.
-- * Upper-case text codes with CHECK constraints, matching the existing tables
--   (verdict, evaluation_mode, protection_tier).
-- * Browser roles (anon, authenticated) get NO direct table access to league
--   data. Reads go through security-definer RPCs that take the league name;
--   writes go through Edge Functions using service_role. See section 6.
-- * Secrets are stored only as hashes: commissioner passwords with bcrypt
--   (pgcrypto crypt/gen_salt), import URL secrets with SHA-256.
-- * Money: cap_hit_m is $M, as the calculator's "Cap hit $M" input. Snallabot
--   capHit is in units of $10,000, so cap_hit_m = capHit / 100 (A11, P1-5).

-- ============================================================================
-- 1. Leagues and teams (Web v2.0)
-- ============================================================================

create table public.leagues (
    id uuid primary key default gen_random_uuid(),

    -- Members type this name to enter the league. name_key is what is matched:
    -- trimmed, lower-case, inner whitespace collapsed.
    name text not null,
    name_key text generated always as (
        lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
    ) stored,

    madden_version text not null default 'Madden 27',

    -- Opaque labels from the import path (/<secret>/<platform>/<leagueId>/...).
    -- CAPTURE: the main league's platform label is not yet known.
    platform_label text,
    external_league_id bigint,

    -- Commissioner password (bcrypt via pgcrypto). Set only by the site owner.
    commissioner_password_hash text not null,
    commissioner_password_set_at timestamptz not null default now(),

    -- Import receiver secret (SHA-256 hex of the URL segment). Rotatable.
    import_secret_sha256 text,
    import_secret_set_at timestamptz,

    status text not null default 'ACTIVE',

    created_at timestamptz not null default now(),
    created_by text not null default 'site owner',

    constraint leagues_name_not_blank check (length(trim(name)) > 0),
    constraint leagues_status_allowed check (status in ('ACTIVE', 'ARCHIVED')),
    constraint leagues_password_is_bcrypt check (commissioner_password_hash like '$2%'),
    constraint leagues_import_secret_hex check (
        import_secret_sha256 is null or import_secret_sha256 ~ '^[0-9a-f]{64}$'
    )
);

create unique index leagues_name_key_idx on public.leagues (name_key);
create unique index leagues_import_secret_idx
    on public.leagues (import_secret_sha256)
    where import_secret_sha256 is not null;

create table public.league_teams (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),

    -- Madden teamId once imported; null for the seeded 32 until matched.
    external_team_id bigint,

    abbreviation text not null,          -- LAR
    city_name text not null,             -- Los Angeles
    nickname text not null,              -- Rams
    division text,                       -- NFC West

    -- From leagueTeamInfoList.userName: empty = CPU, filled = human.
    -- Manual until imports exist; the commissioner can change it.
    controlled_by text not null default 'CPU',
    owner_label text,                    -- gamertag, display only

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint league_teams_controlled_by_allowed check (controlled_by in ('USER', 'CPU')),
    constraint league_teams_abbreviation_not_blank check (length(trim(abbreviation)) > 0),
    unique (league_id, abbreviation),
    unique (league_id, id)               -- lets other tables enforce same-league teams
);

create unique index league_teams_external_idx
    on public.league_teams (league_id, external_team_id)
    where external_team_id is not null;

-- ============================================================================
-- 2. League trades (Web v2.0)
-- ============================================================================
-- Design: keep public.trades as THE trade record (trade_number, history queries,
-- delete_trade_with_audit all keep working) and extend it additively.
--   * trades.* columns hold the CURRENT evaluation (original, or the latest
--     commissioner correction), so history reads stay one row per trade.
--   * trade_revisions holds every evaluation immutably: revision 0 is what the
--     member submitted; 1..n are commissioner corrections (both kept).
--   * trade_assets holds the assets per revision, normalized, with pre-fill
--     provenance for the audit view.
-- Column naming: the existing user_team_* / cpu_team_* columns become
-- "submitting team" / "other team" in league mode (the other team may be human).
-- Keeping the names avoids a snapshot-contract rename; V5_WEB_V2.0_SPEC.md
-- (V2-1) documents the mapping.

alter table public.trades
    add column league_id uuid references public.leagues(id),
    add column submitting_team_id uuid,
    add column other_team_id uuid,
    add column review_status text,
    add column submitter_name text,
    add column submitter_note text,
    add column is_pre_league boolean not null default false,
    add column current_revision integer not null default 0,
    add column reviewed_at timestamptz,
    add column reviewed_by text,
    add column reversal_reason text,

    add constraint trades_review_status_allowed check (
        review_status is null
        or review_status in ('UNREVIEWED', 'REVIEWED', 'REVERSED')
    ),
    -- A league trade names two different teams of that same league.
    add constraint trades_submitting_team_fk
        foreign key (league_id, submitting_team_id)
        references public.league_teams (league_id, id),
    add constraint trades_other_team_fk
        foreign key (league_id, other_team_id)
        references public.league_teams (league_id, id),
    add constraint trades_teams_differ check (
        submitting_team_id is null or other_team_id is null
        or submitting_team_id <> other_team_id
    ),
    -- New league trades must carry a league, both teams and a status.
    -- Pre-league rows (migrated history) are exempt from the team requirement.
    add constraint trades_league_fields_complete check (
        league_id is null
        or is_pre_league
        or (submitting_team_id is not null
            and other_team_id is not null
            and review_status is not null
            and submitter_name is not null
            and length(trim(submitter_name)) > 0)
    ),
    -- Reversed exactly when logically removed (deleted_at), with a reason.
    add constraint trades_reversal_consistent check (
        review_status is distinct from 'REVERSED'
        or (deleted_at is not null and reversal_reason is not null)
    );

create index trades_league_history_idx
    on public.trades (league_id, accepted_at desc)
    where deleted_at is null;

create index trades_review_queue_idx
    on public.trades (league_id, accepted_at)
    where review_status = 'UNREVIEWED' and deleted_at is null;

create table public.trade_revisions (
    trade_id uuid not null references public.trades(id),
    revision integer not null,

    -- The full buildTradeSnapshot() payload for this evaluation, frozen.
    snapshot jsonb not null,
    web_release text not null,
    ruleset_version text not null,
    verdict text not null,
    user_adjusted_value double precision not null,
    cpu_adjusted_value double precision not null,

    -- Revision 0: the member. Corrections: the commissioner, with a reason.
    created_by_role text not null,
    created_by_name text not null,
    reason text,
    created_at timestamptz not null default now(),

    primary key (trade_id, revision),

    constraint trade_revisions_revision_nonnegative check (revision >= 0),
    constraint trade_revisions_role_allowed check (
        created_by_role in ('MEMBER', 'COMMISSIONER', 'MIGRATION')
    ),
    constraint trade_revisions_correction_has_reason check (
        revision = 0 or (created_by_role = 'COMMISSIONER' and reason is not null)
    )
);

create table public.trade_assets (
    id uuid primary key default gen_random_uuid(),
    trade_id uuid not null,
    revision integer not null,
    side text not null,                  -- SUBMITTING (user_team) or OTHER (cpu_team)
    position_in_side integer not null,

    asset_type text not null,

    -- v4.4 calculator inputs, exactly as submitted (same names as snapshotAsset).
    name text,
    pick text,                           -- '1.01'..'1.32', 'Early 2nd', 'Future Early 1st', ...
    timing text,                         -- 'Current draft', 'Next year', 'Two years away'
    ovr integer,
    age integer,
    pos text,
    dev text,
    cap_hit_m numeric(6, 2),
    years_remaining integer,
    years_in_league integer,
    role_current text,
    role_projected text,
    value double precision not null,     -- v4.4 asset value at this revision

    -- Pre-fill provenance (Web v3.1+). Null when typed by hand.
    league_player_id uuid,
    draft_pick_id uuid,
    import_snapshot_id uuid,
    imported_values jsonb,               -- the values as imported, before any edit
    edited_fields text[] not null default '{}',  -- e.g. {ovr,cap_hit_m}: flagged for review

    foreign key (trade_id, revision) references public.trade_revisions (trade_id, revision),
    unique (trade_id, revision, side, position_in_side),

    constraint trade_assets_side_allowed check (side in ('SUBMITTING', 'OTHER')),
    constraint trade_assets_type_allowed check (asset_type in ('Player', 'Draft Pick')),
    -- Same ranges as the calculator inputs.
    constraint trade_assets_ovr_range check (ovr is null or ovr between 0 and 99),
    constraint trade_assets_age_range check (age is null or age between 18 and 60),
    constraint trade_assets_years_range check (years_remaining is null or years_remaining between 1 and 10),
    constraint trade_assets_league_range check (years_in_league is null or years_in_league between 0 and 40),
    constraint trade_assets_cap_nonnegative check (cap_hit_m is null or cap_hit_m >= 0),
    constraint trade_assets_pos_allowed check (
        pos is null or pos in ('QB','EDGE','CB','WR','OT','DT','TE','S','LB','HB','IOL','FB','K','P')
    ),
    constraint trade_assets_dev_allowed check (
        dev is null or dev in ('Normal', 'Star', 'Superstar', 'X-Factor')
    ),
    constraint trade_assets_roles_allowed check (
        (role_current is null or role_current in ('Starter', 'Backup'))
        and (role_projected is null or role_projected in ('Starter', 'Backup'))
    ),
    constraint trade_assets_pick_fields check (
        (asset_type = 'Draft Pick' and pick is not null)
        or (asset_type = 'Player' and pick is null and timing is null)
    ),
    constraint trade_assets_edits_need_import check (
        cardinality(edited_fields) = 0 or imported_values is not null
    )
);

create index trade_assets_trade_idx on public.trade_assets (trade_id, revision);

-- ============================================================================
-- 3. Audit records (Web v2.0)
-- ============================================================================
-- Extend the existing audit_events so there is one audit trail. Trade actions
-- keep trade_id/trade_number; league-level actions (imports, picks, password)
-- carry league_id and details instead.

alter table public.audit_events
    alter column trade_id drop not null,
    alter column trade_number drop not null,
    add column league_id uuid references public.leagues(id),
    add column actor_role text not null default 'ADMIN',
    add column details jsonb not null default '{}'::jsonb,
    drop constraint audit_events_action_allowed,
    drop constraint audit_events_trade_number_positive,
    add constraint audit_events_action_allowed check (
        action in (
            'TRADE_DELETED',                 -- v1.4.0 Admin delete (kept)
            'TRADE_REVIEWED',
            'TRADE_CORRECTED',
            'TRADE_REVERSED',
            'LEAGUE_CREATED',
            'COMMISSIONER_PASSWORD_SET',
            'IMPORT_SECRET_ROTATED',
            'TEAM_UPDATED',
            'CALENDAR_UPDATED',
            'PICK_OWNERSHIP_CHANGED',
            'SNAPSHOT_MARKED_CURRENT',
            'SNAPSHOT_REJECTED',
            'PRE_LEAGUE_MIGRATION'
        )
    ),
    add constraint audit_events_trade_number_positive check (
        trade_number is null or trade_number > 0
    ),
    add constraint audit_events_trade_actions_have_trade check (
        action not like 'TRADE_%' or (trade_id is not null and trade_number is not null)
    ),
    add constraint audit_events_league_actions_have_league check (
        action like 'TRADE_%' or league_id is not null
    ),
    add constraint audit_events_actor_role_allowed check (
        actor_role in ('ADMIN', 'COMMISSIONER', 'SITE_OWNER', 'SYSTEM')
    );

create index audit_events_league_idx
    on public.audit_events (league_id, occurred_at desc)
    where league_id is not null;

-- ============================================================================
-- 4. Calendar and draft-pick ownership
-- ============================================================================

-- Current week / offseason stage for trade posture (Phase 5).
-- Manual field, pre-filled from the import when it carries one (A3, Q18).
create table public.league_calendar (
    league_id uuid primary key references public.leagues(id),
    season integer not null,
    phase text not null,                 -- PRESEASON / REGULAR / POSTSEASON / OFFSEASON
    week integer,                        -- preseason 1-3 (CAPTURE) or regular 1-18
    offseason_stage text,                -- RESIGNING / FREE_AGENCY / DRAFT (CAPTURE)
    source text not null default 'MANUAL',
    updated_at timestamptz not null default now(),
    updated_by text not null,

    constraint league_calendar_phase_allowed check (
        phase in ('PRESEASON', 'REGULAR', 'POSTSEASON', 'OFFSEASON')
    ),
    constraint league_calendar_week_range check (week is null or week between 1 and 18),
    constraint league_calendar_stage_allowed check (
        offseason_stage is null
        or offseason_stage in ('RESIGNING', 'FREE_AGENCY', 'DRAFT')
    ),
    constraint league_calendar_stage_only_offseason check (
        offseason_stage is null or phase = 'OFFSEASON'
    ),
    constraint league_calendar_source_allowed check (source in ('MANUAL', 'IMPORT'))
);

-- Picks aren't exported (A12), so the commissioner maintains ownership (Web v3.0).
-- The calculator's pick label ('1.07', 'Mid 3rd', 'Future Early 1st') is still
-- chosen at trade time and stays editable; this table only says who owns what.
create table public.draft_picks (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    draft_season integer not null,       -- the draft year the pick belongs to
    round integer not null,
    original_team_id uuid not null,
    owner_team_id uuid not null,
    slot integer,                        -- known draft position (1-32), once set
    is_used boolean not null default false,
    notes text,
    updated_at timestamptz not null default now(),
    updated_by text not null,

    foreign key (league_id, original_team_id) references public.league_teams (league_id, id),
    foreign key (league_id, owner_team_id) references public.league_teams (league_id, id),
    unique (league_id, draft_season, round, original_team_id),

    constraint draft_picks_round_range check (round between 1 and 7),
    constraint draft_picks_slot_range check (slot is null or slot between 1 and 32)
);

create index draft_picks_owner_idx
    on public.draft_picks (league_id, owner_team_id)
    where not is_used;

-- ============================================================================
-- 5. Imports (Web v3.0)
-- ============================================================================

-- One snapshot per export burst (30+ roster posts within about a minute).
create table public.import_snapshots (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    source text not null,
    platform_label text,                 -- CAPTURE
    external_league_id bigint,
    season integer,                      -- standings calendarYear (A10, CAPTURE)
    week integer,                        -- CAPTURE: may not be sent
    offseason_stage text,                -- CAPTURE: may not be sent
    first_received_at timestamptz not null default now(),
    last_received_at timestamptz not null default now(),
    status text not null default 'RECEIVING',
    diagnostics jsonb not null default '{}'::jsonb,
    reviewed_at timestamptz,
    reviewed_by text,

    constraint import_snapshots_source_allowed check (
        source in ('SNALLABOT', 'COMPANION', 'CSV')
    ),
    -- Auto update can deliver data; only the commissioner makes it CURRENT.
    constraint import_snapshots_status_allowed check (
        status in ('RECEIVING', 'RECEIVED', 'VALIDATED', 'CURRENT', 'SUPERSEDED', 'REJECTED')
    ),
    constraint import_snapshots_review_recorded check (
        status not in ('CURRENT', 'REJECTED') or reviewed_by is not null
    )
);

create unique index import_snapshots_one_current_idx
    on public.import_snapshots (league_id)
    where status = 'CURRENT';

-- Raw payloads, kept for reprocessing and debugging. Retention: keep the bodies
-- of the CURRENT snapshot and the last few; purge older bodies, keep the rows
-- and hashes. Sizes from the capture set the rule (A14, R19).
create table public.import_payloads (
    id uuid primary key default gen_random_uuid(),
    snapshot_id uuid not null references public.import_snapshots(id),
    route text not null,                 -- e.g. team/776994843/roster, standings (CAPTURE)
    received_at timestamptz not null default now(),
    content_length integer not null,
    body_sha256 text not null,
    body jsonb,                          -- null once purged

    constraint import_payloads_length_nonnegative check (content_length >= 0),
    constraint import_payloads_sha_hex check (body_sha256 ~ '^[0-9a-f]{64}$')
);

create index import_payloads_snapshot_idx on public.import_payloads (snapshot_id, route);

-- Normalized players per snapshot (V5_FIELD_MAPPING.md). Columns line up with
-- the v4.4 inputs so a picker can pre-fill the calculator directly.
create table public.league_players (
    id uuid primary key default gen_random_uuid(),
    league_id uuid not null references public.leagues(id),
    snapshot_id uuid not null references public.import_snapshots(id),
    external_player_id bigint not null,  -- rosterId
    team_id uuid,                        -- null = free agent
    first_name text not null,
    last_name text not null,

    madden_position text not null,       -- LT, MIKE, LEDG, LS, ...
    pos text,                            -- v4.4 position; null for LS until v5.0
    ovr integer not null,                -- playerBestOvr
    age integer not null,
    dev text not null,                   -- devTrait 0..3 mapped
    cap_hit_m numeric(6, 2),             -- capHit / 100
    years_remaining integer,             -- contractYearsLeft; 0 -> null
    years_in_league integer not null,    -- yearsPro (not rookieYear)
    is_free_agent boolean not null default false,
    is_practice_squad boolean not null default false,
    is_injured_reserve boolean not null default false,

    foreign key (league_id, team_id) references public.league_teams (league_id, id),
    unique (snapshot_id, external_player_id),

    constraint league_players_pos_mapped check (
        (madden_position = 'LS' and pos is null)
        or (madden_position <> 'LS' and pos is not null
            and pos in ('QB','EDGE','CB','WR','OT','DT','TE','S','LB','HB','IOL','FB','K','P'))
    ),
    constraint league_players_ovr_range check (ovr between 0 and 99),
    constraint league_players_age_range check (age between 18 and 60),
    constraint league_players_dev_allowed check (dev in ('Normal', 'Star', 'Superstar', 'X-Factor')),
    constraint league_players_years_range check (years_remaining is null or years_remaining between 1 and 10),
    constraint league_players_league_range check (years_in_league between 0 and 40),
    constraint league_players_cap_nonnegative check (cap_hit_m is null or cap_hit_m >= 0),
    constraint league_players_team_or_fa check (is_free_agent = (team_id is null))
);

create index league_players_team_idx on public.league_players (snapshot_id, team_id);

-- Standings per snapshot. Feeds the posture FYI (Phase 5) and the
-- future-first tier suggestion (Phase 3). Cap figures are raw dollars.
create table public.team_standings (
    snapshot_id uuid not null references public.import_snapshots(id),
    league_id uuid not null references public.leagues(id),
    team_id uuid not null,
    season integer,
    wins integer not null,
    losses integer not null,
    ties integer not null default 0,
    cap_room bigint,
    cap_spent bigint,
    cap_available bigint,

    primary key (snapshot_id, team_id),
    foreign key (league_id, team_id) references public.league_teams (league_id, id),

    constraint team_standings_record_nonnegative check (wins >= 0 and losses >= 0 and ties >= 0)
);

-- Now that the import tables exist, link pre-filled trade assets to them.
alter table public.trade_assets
    add constraint trade_assets_player_fk
        foreign key (league_player_id) references public.league_players(id),
    add constraint trade_assets_pick_fk
        foreign key (draft_pick_id) references public.draft_picks(id),
    add constraint trade_assets_snapshot_fk
        foreign key (import_snapshot_id) references public.import_snapshots(id);

-- ============================================================================
-- 6. Access (Web v2.0)
-- ============================================================================
-- Members have no accounts; knowing the league name is the access (R5).
-- If anon could SELECT leagues, every league name would be listable, so:
--   * no browser grants on any league table;
--   * reads go through security-definer RPCs that take the league name;
--   * writes (submit, review, correct, reverse, imports, picks) go through
--     Edge Functions with service_role, which check the commissioner session.
-- Commissioner sessions stay stateless signed tokens like today's admin
-- session (_shared/admin-session.ts), with league_id added to the payload.
--
-- CONTRACT NOTE (Web v2.0): the existing "Public can read active trades" policy
-- would expose every league's trades to a direct table read. v2.0 replaces it
-- with league_trade_history() below and updates trade-history.js accordingly.

alter table public.leagues enable row level security;
alter table public.league_teams enable row level security;
alter table public.trade_revisions enable row level security;
alter table public.trade_assets enable row level security;
alter table public.league_calendar enable row level security;
alter table public.draft_picks enable row level security;
alter table public.import_snapshots enable row level security;
alter table public.import_payloads enable row level security;
alter table public.league_players enable row level security;
alter table public.team_standings enable row level security;

revoke all on table
    public.leagues, public.league_teams, public.trade_revisions, public.trade_assets,
    public.league_calendar, public.draft_picks, public.import_snapshots,
    public.import_payloads, public.league_players, public.team_standings
from anon, authenticated;

grant select, insert, update, delete on table
    public.leagues, public.league_teams, public.trade_revisions, public.trade_assets,
    public.league_calendar, public.draft_picks, public.import_snapshots,
    public.import_payloads, public.league_players, public.team_standings
to service_role;

-- Resolve a typed league name. Returns nothing for an unknown name, so the
-- page can say "league not found" without listing others. Never creates one.
create or replace function public.league_lookup(p_name text)
returns table (league_id uuid, league_name text, madden_version text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select l.id, l.name, l.madden_version
    from public.leagues l
    where l.status = 'ACTIVE'
      and l.name_key = lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.league_team_list(p_name text)
returns table (team_id uuid, abbreviation text, city_name text, nickname text,
               division text, controlled_by text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select t.id, t.abbreviation, t.city_name, t.nickname, t.division, t.controlled_by
    from public.league_teams t
    join public.leagues l on l.id = t.league_id
    where l.status = 'ACTIVE'
      and l.name_key = lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
    order by t.city_name, t.nickname;
$$;

-- Active (not reversed) history for one league, newest first, with review status.
create or replace function public.league_trade_history(p_name text)
returns setof public.trades
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select tr.*
    from public.trades tr
    join public.leagues l on l.id = tr.league_id
    where l.status = 'ACTIVE'
      and l.name_key = lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
      and tr.deleted_at is null
    order by tr.accepted_at desc;
$$;

-- Password check for the commissioner-login Edge Function (service_role only).
create or replace function public.verify_commissioner_password(p_league_id uuid, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(
        (select l.commissioner_password_hash = crypt(coalesce(p_password, ''), l.commissioner_password_hash)
         from public.leagues l
         where l.id = p_league_id and l.status = 'ACTIVE'),
        false);
$$;

revoke all on function public.league_lookup(text) from public;
revoke all on function public.league_team_list(text) from public;
revoke all on function public.league_trade_history(text) from public;
revoke all on function public.verify_commissioner_password(uuid, text) from public, anon, authenticated;

grant execute on function public.league_lookup(text) to anon, authenticated, service_role;
grant execute on function public.league_team_list(text) to anon, authenticated, service_role;
grant execute on function public.league_trade_history(text) to anon, authenticated, service_role;
grant execute on function public.verify_commissioner_password(uuid, text) to service_role;

-- ============================================================================
-- 7. Pre-league history migration sketch (Web v2.0, V2-8)
-- ============================================================================
-- Run once, inside a transaction, after a backup (R4). Shown commented out
-- because the league name and password come from the site owner.
--
-- begin;
--   -- a) Create the main league (site owner sets name and password).
--   insert into public.leagues (name, commissioner_password_hash)
--   values ('<league name>', crypt('<commissioner password>', gen_salt('bf', 12)))
--   returning id;                                    -- -> :league_id
--
--   -- b) Seed the 32 teams (abbreviation, city, nickname, division).
--   insert into public.league_teams (league_id, abbreviation, city_name, nickname, division)
--   values (:league_id, 'ARI', 'Arizona', 'Cardinals', 'NFC West'), ... ;
--
--   -- c) Move existing history into the league as pre-league.
--   --    Active trades become REVIEWED; v1.4.0 Admin-deleted trades REVERSED.
--   update public.trades
--   set league_id = :league_id,
--       is_pre_league = true,
--       review_status = case when deleted_at is null then 'REVIEWED' else 'REVERSED' end,
--       reversal_reason = case when deleted_at is null then null else 'Deleted before league mode (v1.4.0 Admin delete)' end,
--       reviewed_by = 'pre-league migration',
--       reviewed_at = now()
--   where league_id is null;
--
--   -- d) Freeze each trade's existing evaluation as revision 0.
--   insert into public.trade_revisions (trade_id, revision, snapshot, web_release, ruleset_version,
--       verdict, user_adjusted_value, cpu_adjusted_value, created_by_role, created_by_name, created_at)
--   select id, 0, to_jsonb(t) - 'id', web_release, ruleset_version,
--          verdict, user_adjusted_value, cpu_adjusted_value, 'MIGRATION', 'pre-league migration', accepted_at
--   from public.trades t
--   where t.league_id = :league_id and t.is_pre_league;
--
--   -- e) One audit record for the migration.
--   insert into public.audit_events (action, league_id, actor_role, administrator_name, details)
--   values ('PRE_LEAGUE_MIGRATION', :league_id, 'SITE_OWNER', 'site owner',
--           jsonb_build_object('trades', (select count(*) from public.trades where league_id = :league_id)));
--
--   -- f) Check counts before committing: every trade has a league_id and one revision 0.
-- commit;
