#!/usr/bin/env python3
"""Web v2.0 site-owner toolkit: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Creates a fresh database, applies supabase/migrations/*.sql in order, logs
v1.x trades (one deleted), then runs the launch sequence with the owner
functions exactly as the runbook does: create / find the league, load teams
from a Snallabot export (the anonymized main-league capture), set the
commissioner password, move pre-league history, and re-run the sweep. Also
covers rename, archive, team fixes, secret rotation and access.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/web-v2.0-owner-toolkit.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "web_v2_owner_test"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  {detail}"))


def psql(sql, role=None, expect_error=False, db=DB):
    if role:
        sql = f"set role {role};\n{sql}"
    proc = subprocess.run(
        ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db],
        input=sql, capture_output=True, text=True,
    )
    if expect_error:
        return proc.returncode != 0, proc.stderr
    if proc.returncode != 0:
        raise RuntimeError(f"SQL failed:\n{proc.stderr}\n--- SQL ---\n{sql[:800]}")
    return proc.stdout.strip()


def q(text):
    return "'" + text.replace("'", "''") + "'"


def j(obj):
    return q(json.dumps(obj)) + "::jsonb"


# ---------------------------------------------------------------- setup
psql(f"drop database if exists {DB};", db="postgres")
psql(f"create database {DB};", db="postgres")
psql("""
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;""", db="postgres")

for m in sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations"))):
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())
check("all migrations apply, including the owner toolkit",
      psql("select count(*) from pg_proc where proname like 'owner\\_%';") == "17")

# v1.x history: two v1.4.0/v4.2 trades and one v1.5.0/v4.4, one of them deleted.
def legacy(release, ruleset, verdict, ovr):
    assets_a = [{"id": 1, "type": "Draft Pick", "name": "", "pick": "1.10", "timing": "Current draft",
                 "ovr": "", "age": "", "pos": "QB", "dev": "Normal", "cap": "", "years": "", "league": "",
                 "current": "", "projected": "", "value": 88.0}]
    assets_b = [{"id": 2, "type": "Player", "name": "Old Player", "pick": "1.01", "timing": "Current draft",
                 "ovr": ovr, "age": "27", "pos": "WR", "dev": "Star", "cap": "5", "years": "2", "league": "5",
                 "current": "Starter", "projected": "Starter", "value": 80.0}]
    return psql(
        "insert into trades (web_release, ruleset_version, user_team_assets, cpu_team_assets, user_raw_value, "
        "cpu_raw_value, user_adjusted_value, cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode, "
        "protection_tier, required_target, fair_maximum, trade_intelligence, suggested_correction) values ("
        f"{q(release)}, {q(ruleset)}, {j(assets_a)}, {j(assets_b)}, 88, 80, 88, 80, 0.09, {q(verdict)}, "
        f"'DIRECTIONAL', null, null, null, {j([{'label': 'PRIMARY READ', 'value': 'User Team leads.'}])}, 'None') "
        "returning id;", role="service_role")


old1 = legacy("v1.4.0", "v4.2", "FAIR", "84")
old2 = legacy("v1.4.0", "v4.2", "UNFAIR", "90")
old3 = legacy("v1.5.0", "v4.4", "QUESTIONABLE", "82")
psql(f"select delete_trade_with_audit('{old2}', 'Admin', 'Duplicate');", role="service_role")
check("setup: 3 v1.x trades, 1 deleted", psql("select count(*) || ',' || count(deleted_at) from trades;") == "3,1")

# ---------------------------------------------------------------- overview and create
check("owner_leagues: empty to start", psql("select count(*) from owner_leagues();") == "0")

created = psql("select league_name || '|' || import_secret from owner_create_league('Sample League');")
name, secret = created.split("|")
check("create: returns the name and a 48-character secret", name == "Sample League" and len(secret) == 48)
check("create: only the secret's hash is stored",
      psql("select import_secret_sha256 from leagues;") == hashlib.sha256(secret.encode()).hexdigest()
      and secret not in psql("select row_to_json(l)::text from leagues l;"))
check("create: audited as site owner",
      psql("select action || ',' || actor_role || ',' || administrator_name from audit_events where action = 'LEAGUE_CREATED';")
      == "LEAGUE_CREATED,SITE_OWNER,site owner")
bad, err = psql("select * from owner_create_league('  sample   LEAGUE ');", expect_error=True)
check("create: same name (any case or spacing) refused", bad and "already exists" in err)
bad, err = psql("select * from owner_create_league('   ');", expect_error=True)
check("create: blank name refused", bad and "1 to 100" in err)

row = psql("select status || ',' || password_set || ',' || teams || ',' || snallabot_connected from owner_leagues();")
check("owner_leagues: new league active, no password, no teams, connected", row == "ACTIVE,false,0,true")

bad, err = psql("select * from owner_teams('Nope');", expect_error=True)
check("unknown league: clear message", bad and "No league named 'Nope'" in err and "owner_leagues()" in err)

# ---------------------------------------------------------------- teams from a Snallabot export
bad, err = psql("select * from owner_load_teams('sample league');", expect_error=True)
check("load teams before any export: clear message", bad and "Run an export from Snallabot first" in err)

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21", "leagueteams.json"), encoding="utf-8") as f:
    payload = json.load(f)
humans = sum(1 for t in payload["leagueTeamInfoList"] if t.get("userName"))
lid = psql("select id from leagues;")


def export(body, minutes_ago):
    sid = psql(f"insert into import_snapshots (league_id, status, first_received_at) values ('{lid}', 'RECEIVED', "
               f"now() - interval '{minutes_ago} minutes') returning id;")
    text = json.dumps(body)
    psql(f"insert into import_payloads (snapshot_id, route, received_at, content_length, body_sha256, body) values "
         f"('{sid}', 'leagueteams', now() - interval '{minutes_ago} minutes', {len(text)}, "
         f"{q(hashlib.sha256(text.encode()).hexdigest())}, {j(body)});")


export(payload, 60)
loaded = psql("select count(*) || ',' || count(*) filter (where change = 'added') || ',' || "
              "count(*) filter (where controlled_by = 'USER') from owner_load_teams('Sample League');")
check(f"load teams: 32 added, {humans} human", loaded == f"32,32,{humans}", loaded)
check("load teams: OMH and AZ present with names and divisions",
      psql("select string_agg(abbreviation || ':' || team || ':' || coalesce(division, '?'), ';' order by abbreviation) "
           "from owner_teams('Sample League') where abbreviation in ('OMH', 'AZ');").count(":") == 4)
check("browser team list now has 32 (owner_label not exposed)",
      psql("select count(*) from league_team_list('Sample League');", role="anon") == "32"
      and "owner_label" not in psql("select row_to_json(t)::text from league_team_list('Sample League') t limit 1;", role="anon"))

again = psql("select count(*) filter (where change = 'unchanged') from owner_load_teams('Sample League');")
check("load teams again: all unchanged", again == "32")

# A newer export: one CPU team taken over by a human, one relocation renamed.
newer = json.loads(json.dumps(payload))
cpu_team = next(t for t in newer["leagueTeamInfoList"] if not t.get("userName"))
cpu_team["userName"] = "NewOwner"
omh = next(t for t in newer["leagueTeamInfoList"] if t["abbrName"] == "OMH")
omh["displayName"] = omh["nickName"] = "Renamed"
export(newer, 5)
ids_before = psql("select string_agg(id::text, ',' order by external_team_id) from league_teams;")
changes = psql("select string_agg(abbreviation || ':' || change, ',' order by abbreviation) "
               "from owner_load_teams('Sample League') where change <> 'unchanged';")
check("refresh: only the two changed teams updated", changes == ",".join(sorted([f"{cpu_team['abbrName']}:updated", "OMH:updated"])), changes)
check("refresh: team ids kept (trades stay linked)", psql("select string_agg(id::text, ',' order by external_team_id) from league_teams;") == ids_before)
check("refresh: new human team and new nickname", psql(
    f"select controlled_by || ',' || (select nickname from league_teams where abbreviation = 'OMH') "
    f"from league_teams where abbreviation = {q(cpu_team['abbrName'])};") == "USER,Renamed")
check("team loads audited with counts",
      psql("select count(*) from audit_events where action = 'TEAM_UPDATED' and details ->> 'source' = 'snallabot';") == "3")

# ---------------------------------------------------------------- manual team fix
fixed = psql(f"select controlled_by || ',' || owner_label from owner_set_team('Sample League', {q(cpu_team['abbrName'].lower())}, 'cpu', 'Vacant');")
check("set team: CPU and label (abbreviation any case)", fixed == "CPU,Vacant")
fixed = psql(f"select controlled_by || ',' || owner_label from owner_set_team('Sample League', {q(cpu_team['abbrName'])}, 'human');")
check("set team: 'human' means USER, label kept", fixed == "USER,Vacant")
bad, err = psql("select * from owner_set_team('Sample League', 'OMH', 'robot');", expect_error=True)
check("set team: bad value refused", bad and "USER (human) or CPU" in err)
bad, err = psql("select * from owner_set_team('Sample League', 'XYZ', 'CPU');", expect_error=True)
check("set team: unknown team named", bad and "No team 'XYZ'" in err)

# ---------------------------------------------------------------- commissioner password
check("login before a password: NOT_SET", psql("select status from commissioner_login('Sample League', 'whatever');", role="service_role") == "NOT_SET")
bad, err = psql("select * from owner_set_commissioner_password('Sample League', 'short');", expect_error=True)
check("password under 8 characters refused", bad and "8 to 200" in err)
res = psql("select result from owner_set_commissioner_password('Sample League', 'correct horse battery');")
check("password set", res == "Password set.")
check("password stored as bcrypt, not plain", psql("select commissioner_password_hash like '$2a$10$%' from leagues;") == "t"
      and "correct horse" not in psql("select row_to_json(l)::text from leagues l;"))
check("login with it: OK", psql("select status from commissioner_login('Sample League', 'correct horse battery');", role="service_role") == "OK")
for _ in range(5):
    psql("select status from commissioner_login('Sample League', 'wrong');", role="service_role")
check("5 wrong passwords: LOCKED", psql("select status from commissioner_login('Sample League', 'correct horse battery');", role="service_role") == "LOCKED")
res = psql("select result from owner_set_commissioner_password('Sample League', 'new password 2');")
check("reset: changed and lockout cleared", res == "Password changed. Any lockout is cleared."
      and psql("select status from commissioner_login('Sample League', 'new password 2');", role="service_role") == "OK"
      and psql("select status from commissioner_login('Sample League', 'correct horse battery');", role="service_role") == "BAD")
check("password changes audited (reset flagged)",
      psql("select string_agg(details ->> 'reset', ',' order by occurred_at) from audit_events where action = 'COMMISSIONER_PASSWORD_SET';") == "false,true")

# ---------------------------------------------------------------- pre-league history
moved = psql("select moved || ',' || moved_active || ',' || moved_deleted || ',' || league_active_trades || ',' || trades_without_league "
             "from owner_move_pre_league_history('Sample League');")
check("move: 3 moved (2 active, 1 deleted), none left without a league", moved == "3,2,1,2,0", moved)
check("moved trades are pre-league with revision 0 from MIGRATION",
      psql("select count(*) from trades t join trade_revisions r on r.trade_id = t.id and r.revision = 0 "
           "where t.is_pre_league and r.created_by_role = 'MIGRATION' and r.created_at = t.accepted_at;") == "3")
check("revision 0 snapshot matches the stored trade",
      psql(f"select (snapshot ->> 'verdict') || ',' || (snapshot ->> 'web_release') || ',' || jsonb_array_length(snapshot -> 'cpu_team_assets') "
           f"from trade_revisions where trade_id = '{old1}';") == "FAIR,v1.4.0,1")
check("assets copied for each moved trade", psql("select count(distinct trade_id) from trade_assets;") == "3")
check("history shows the 2 active pre-league trades (deleted one hidden)",
      psql("select count(*) || ',' || bool_and(is_pre_league) from league_trade_history('Sample League');", role="anon") == "2,true")
check("pre-league trades stay out of the review queue",
      psql("select count(*) from owner_leagues() where unreviewed = 0 and pre_league = 3;") == "1")
check("the old Admin deletion now shows in the league's audit log",
      psql(f"select count(*) from league_audit_log('{lid}') where action = 'TRADE_DELETED';", role="service_role") == "1")
check("one PRE_LEAGUE_MIGRATION event with counts",
      psql("select details::text from audit_events where action = 'PRE_LEAGUE_MIGRATION';") == '{"moved": 3, "active": 2, "deleted": 0}'.replace('"deleted": 0', '"deleted": 1'))

# Switchover sweep: a v1.5.0 trade logged after the move, then the re-run.
late = legacy("v1.5.0", "v4.4", "FAIR", "85")
sweep = psql("select moved || ',' || trades_without_league from owner_move_pre_league_history('Sample League');")
check("sweep re-run: moves only the late trade", sweep == "1,0")
nothing = psql("select moved from owner_move_pre_league_history('Sample League');")
check("re-run with nothing to move: 0 and no extra audit event",
      nothing == "0" and psql("select count(*) from audit_events where action = 'PRE_LEAGUE_MIGRATION';") == "2")

check("Q22: active pre-league trades Reviewed, deleted ones Reversed with their reason",
      psql(f"select string_agg(review_status || ':' || coalesce(reversal_reason, '-'), ',' order by trade_number) from trades;")
      == "REVIEWED:-,REVERSED:Duplicate,REVIEWED:-,REVIEWED:-")
st = psql(f"select review_status || ',' || current_revision from review_league_trade('{lid}', '{old1}', 'REVERSE', 'Commish', 'Test', null);", role="service_role")
check("a commissioner can still reverse a pre-league trade", st == "REVERSED,0")

# ---------------------------------------------------------------- rename, archive, secret
res = psql("select old_name || '>' || new_name from owner_rename_league('Sample League', 'Renamed League');")
check("rename: old name stops working, new one works",
      res == "Sample League>Renamed League"
      and psql("select count(*) from league_lookup('Sample League');", role="anon") == "0"
      and psql("select count(*) from league_lookup('renamed league');", role="anon") == "1")
psql("select * from owner_create_league('Other League');")
bad, err = psql("select * from owner_rename_league('Renamed League', 'OTHER league');", expect_error=True)
check("rename onto an existing name refused", bad and "already exists" in err)

psql("select * from owner_set_league_status('Renamed League', 'archived');")
check("archive: hidden from members and sign-in",
      psql("select count(*) from league_lookup('Renamed League');", role="anon") == "0"
      and psql("select status from commissioner_login('Renamed League', 'new password 2');", role="service_role") == "UNKNOWN")
check("archive: still listed for the owner", psql("select status from owner_leagues() where league_name = 'Renamed League';") == "ARCHIVED")
psql("select * from owner_set_league_status('Renamed League', 'ACTIVE');")
check("reactivate: back for members", psql("select count(*) from league_lookup('Renamed League');", role="anon") == "1")
bad, err = psql("select * from owner_set_league_status('Renamed League', 'deleted');", expect_error=True)
check("status other than ACTIVE / ARCHIVED refused", bad and "ACTIVE or ARCHIVED" in err)

new_secret = psql("select import_secret from owner_rotate_import_secret('Renamed League');")
check("rotate secret: new hash stored, old one gone",
      len(new_secret) == 48 and new_secret != secret
      and psql("select import_secret_sha256 from leagues where name = 'Renamed League';") == hashlib.sha256(new_secret.encode()).hexdigest())

# ---------------------------------------------------------------- access
for role in ("anon", "authenticated", "service_role"):
    bad, err = psql("select * from owner_leagues();", role=role, expect_error=True)
    check(f"{role} cannot call owner functions", bad and "permission denied" in err)
bad, err = psql("select * from owner_set_commissioner_password('Renamed League', 'hijack attempt');", role="service_role", expect_error=True)
check("service_role (Edge Functions) cannot set passwords", bad and "permission denied" in err)

print(f"\n{sum(results)} / {len(results)} {'PASS' if all(results) else 'FAIL'}")
psql(f"drop database if exists {DB};", db="postgres")
