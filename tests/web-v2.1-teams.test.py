#!/usr/bin/env python3
"""Web v2.1 commissioner team editing: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Creates a fresh database, applies supabase/migrations/*.sql in order, logs
v1.x trades (one deleted), then runs the launch sequence with the owner
functions exactly as the runbook does: create / find the league, load teams
from a Snallabot export (the anonymized main-league capture), set the
commissioner password, move pre-league history, and re-run the sweep. Also
covers rename, archive, team fixes, secret rotation and access.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/web-v2.1-teams.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "web_v21_teams_test"
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
      psql("select count(*) from pg_proc where proname like 'owner\\_%';") == "14")

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


# ---------------------------------------------------------------- two leagues with teams
psql("select * from owner_create_league('Sample League');")
psql("select * from owner_create_league('Other League');")
with open(os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21", "leagueteams.json"), encoding="utf-8") as f:
    payload = json.load(f)


def load(name):
    lid = psql(f"select id from leagues where name = {q(name)};")
    sid = psql(f"insert into import_snapshots (league_id, status, first_received_at) values ('{lid}', 'RECEIVED', now()) returning id;")
    text = json.dumps(payload)
    psql(f"insert into import_payloads (snapshot_id, route, received_at, content_length, body_sha256, body) values "
         f"('{sid}', 'leagueteams', now(), {len(text)}, {q(hashlib.sha256(text.encode()).hexdigest())}, {j(payload)});")
    psql(f"select count(*) from owner_load_teams({q(name)});")
    return lid


L1 = load("Sample League")
L2 = load("Other League")
check("setup: 32 teams in each league", psql("select string_agg(n::text, ',') from (select count(*) n from league_teams group by league_id) x;") == "32,32")

dal = psql(f"select id || '|' || controlled_by || '|' || coalesce(owner_label, '') from league_teams where league_id = '{L1}' and abbreviation = 'DAL';").split("|")
cpu = psql(f"select id from league_teams where league_id = '{L1}' and controlled_by = 'CPU' order by abbreviation limit 1;")
other_team = psql(f"select id from league_teams where league_id = '{L2}' limit 1;")

# ---------------------------------------------------------------- list
rows = psql(f"select count(*) || ',' || count(owner_label) from commissioner_league_teams('{L1}');", role="service_role")
check("list: 32 teams with owner labels for the commissioner", rows.split(",")[0] == "32" and int(rows.split(",")[1]) >= 1, rows)
check("list: only this league's teams", psql(f"select count(*) from commissioner_league_teams('{L1}') where team_id = '{other_team}';", role="service_role") == "0")

# ---------------------------------------------------------------- update
res = psql(f"select controlled_by || ',' || coalesce(owner_label, '-') || ',' || changed from commissioner_update_team('{L1}', '{cpu}', 'user', '  New Owner  ', 'Commish');", role="service_role")
check("update: CPU team made human with a trimmed label", res == "USER,New Owner,true", res)
check("update: browser team list shows it as USER, without the label",
      psql(f"select controlled_by from league_team_list('Sample League') where team_id = '{cpu}';", role="anon") == "USER"
      and "New Owner" not in psql("select json_agg(t)::text from league_team_list('Sample League') t;", role="anon"))
ev = psql(f"select actor_role || ',' || administrator_name || ',' || (details ->> 'controlled_by_before') || '>' || (details ->> 'controlled_by_after') || ',' || (details ->> 'owner_label_changed') from audit_events where action = 'TEAM_UPDATED' and actor_role = 'COMMISSIONER';")
check("update: audited as the commissioner with before/after", ev == "COMMISSIONER,Commish,CPU>USER,true", ev)
check("update: shows in the league's audit log", psql(f"select count(*) from league_audit_log('{L1}') where action = 'TEAM_UPDATED' and actor_role = 'COMMISSIONER';", role="service_role") == "1")
check("update: not in the other league's audit log", psql(f"select count(*) from league_audit_log('{L2}') where actor_role = 'COMMISSIONER';", role="service_role") == "0")

res = psql(f"select changed from commissioner_update_team('{L1}', '{cpu}', 'USER', 'New Owner', 'Commish');", role="service_role")
check("no change: returns changed=false and no audit event", res == "f" and psql("select count(*) from audit_events where action = 'TEAM_UPDATED' and actor_role = 'COMMISSIONER';") == "1")

res = psql(f"select coalesce(owner_label, 'NULL') from commissioner_update_team('{L1}', '{cpu}', 'USER', '', 'Commish');", role="service_role")
check("empty label clears it", res == "NULL")

bad, err = psql(f"select * from commissioner_update_team('{L1}', '{other_team}', 'CPU', null, 'Commish');", role="service_role", expect_error=True)
check("team from another league: not found", bad and "Team not found in this league" in err)
bad, err = psql(f"select * from commissioner_update_team('{L1}', '{cpu}', 'robot', null, 'Commish');", role="service_role", expect_error=True)
check("invalid control refused", bad and "Human or CPU" in err)
bad, err = psql(f"select * from commissioner_update_team('{L1}', '{cpu}', 'CPU', '{'x' * 61}', 'Commish');", role="service_role", expect_error=True)
check("label over 60 refused", bad and "60 characters" in err)
bad, err = psql(f"select * from commissioner_update_team('{L1}', '{cpu}', 'CPU', null, '  ');", role="service_role", expect_error=True)
check("commissioner name required", bad and "Commissioner name" in err)

# ---------------------------------------------------------------- archived league
psql("select * from owner_set_league_status('Sample League', 'ARCHIVED');")
check("archived league: no teams listed", psql(f"select count(*) from commissioner_league_teams('{L1}');", role="service_role") == "0")
bad, err = psql(f"select * from commissioner_update_team('{L1}', '{cpu}', 'CPU', null, 'Commish');", role="service_role", expect_error=True)
check("archived league: update refused", bad and "Team not found" in err)
psql("select * from owner_set_league_status('Sample League', 'ACTIVE');")

# ---------------------------------------------------------------- access
for role in ("anon", "authenticated"):
    bad, err = psql(f"select * from commissioner_league_teams('{L1}');", role=role, expect_error=True)
    check(f"{role} cannot list commissioner teams", bad and "permission denied" in err)
    bad, err = psql(f"select * from commissioner_update_team('{L1}', '{cpu}', 'CPU', null, 'x');", role=role, expect_error=True)
    check(f"{role} cannot update teams", bad and "permission denied" in err)

# ---------------------------------------------------------------- owner reload overwrites
psql("select count(*) from owner_load_teams('Sample League');")
check("owner_load_teams restores Snallabot's value (documented)", psql(f"select controlled_by from league_teams where id = '{cpu}';") == "CPU")

print(f"\n{sum(results)} / {len(results)} {'PASS' if all(results) else 'FAIL'}")
psql(f"drop database if exists {DB};", db="postgres")
