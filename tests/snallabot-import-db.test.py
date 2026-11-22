#!/usr/bin/env python3
"""Snallabot import receiver: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Creates a fresh database, applies supabase/migrations/*.sql in order, runs the
site-owner connect script, then replays the 40 requests of the main-league
capture (docs/roadmap/v5/capture-2026-11-21/) through record_snallabot_payload.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/snallabot-import-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "snallabot_test"

results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  {detail}"))


def psql(sql, db=DB, role=None, expect_error=False):
    if role:
        sql = f"set role {role};\n{sql}"
    proc = subprocess.run(
        ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db],
        input=sql, capture_output=True, text=True,
    )
    if expect_error:
        return proc.returncode != 0, proc.stderr
    if proc.returncode != 0:
        raise RuntimeError(f"SQL failed:\n{proc.stderr}\n--- SQL ---\n{sql[:600]}")
    return proc.stdout.strip()


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def record(secret, path_route, body_text, platform="pc", league_id=5481323, expect_error=False):
    body_tag = "$snb$"
    assert body_tag not in body_text
    sql = (
        "select snapshot_id || '|' || snapshot_status || '|' || is_duplicate || '|' || request_count "
        "from public.record_snallabot_payload("
        f"'{sha(secret)}', '{platform}', {league_id}, '{path_route}', "
        f"{body_tag}{body_text}{body_tag}::jsonb, '{sha(body_text)}', {len(body_text.encode('utf-8'))});"
    )
    return psql(sql, role="service_role", expect_error=expect_error)


def read(name):
    with open(os.path.join(CAPTURE, name), encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------- setup
psql(f"drop database if exists {DB};", db="postgres")
psql(f"create database {DB};", db="postgres")
psql("""
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;""")

migrations = sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations")))
for m in migrations:
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())
check("all migrations apply in order", "20261122060000_snallabot_import.sql" in migrations and "20261122070000_snallabot_retention_setting.sql" in migrations)

# Connect script. Supabase keeps pgcrypto in the "extensions" schema; a plain
# Postgres test server has it in public, so the prefix is dropped here only.
with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    connect = f.read().replace("extensions.", "").replace("<LEAGUE NAME>", "Test League")
out = psql(connect)
league_id, secret = out.split("|")
check("connect script returns a league and a 48-character secret", len(secret) == 48 and re.fullmatch(r"[0-9a-f]{48}", secret))
check("only the hash is stored", psql(f"select count(*) from leagues where import_secret_sha256 = '{sha(secret)}' and position('{secret}' in leagues::text) = 0;") == "1")

# ---------------------------------------------------------------- replay the capture
bodies = {
    "leagueteams": read("leagueteams.json"),
    "standings": read("standings.json"),
    "week/reg/4/schedules": read("week-reg-4-schedules.json"),
}
roster = read("team-roster-excerpt.json")
freeagents = json.dumps({"rosterInfoList": [], "message": "", "success": True})
small = json.dumps({"message": "", "success": True})

routes = [l.strip().split("/<secret>/pc/5481323/")[1] for l in read("request-paths.txt").splitlines() if l.strip()]
outputs = []
for r in routes:
    if r in bodies:
        body = bodies[r]
    elif r.endswith("/roster") and r.startswith("team/"):
        body = roster
    elif r == "freeagents/roster":
        body = freeagents
    else:
        body = small
    outputs.append(record(secret, r, body))

snap_ids = {o.split("|")[0] for o in outputs}
check("40 captured requests land in one snapshot", len(routes) == 40 and len(snap_ids) == 1, str(len(snap_ids)))
snap = snap_ids.pop()
check("request_count is 40", outputs[-1].split("|")[3] == "40")
check("40 payload rows stored", psql(f"select count(*) from import_payloads where snapshot_id = '{snap}';") == "40")
check("snapshot is RECEIVING while the burst is open", psql(f"select status from import_snapshots where id = '{snap}';") == "RECEIVING")

diag = json.loads(psql(f"select diagnostics from import_snapshots where id = '{snap}';"))
check("health check: 29 rosters received", diag["rosters_received"] == 29, diag)
check("health check: 32 teams in league", diag["teams_in_league"] == 32)
check("health check: missing TEN, HOU, MIN", diag["missing_roster_team_ids"] == [776994848, 776994849, 776994850], diag["missing_roster_team_ids"])
check("health check: league teams, standings, free agents present", diag["has_leagueteams"] and diag["has_standings"] and diag["has_freeagents"])
check("health check: 8 weekly routes", len(diag["weekly_routes"]) == 8)
check("health check: no unknown routes", diag["unknown_routes"] == [])
check("health check: not complete (rosters missing)", diag["complete"] is False)
check("season 2027, week 5, stage 1 from standings",
      psql(f"select season || ',' || week || ',' || stage_index from import_snapshots where id = '{snap}';") == "2027,5,1")
check("league picked up league ID and platform", psql(f"select external_league_id || ',' || platform_label from leagues where id = '{league_id}';") == "5481323,pc")
check("bytes counted", int(psql(f"select total_bytes from import_snapshots where id = '{snap}';")) > 100000)

# ---------------------------------------------------------------- duplicates and rejects
dup = record(secret, "standings", bodies["standings"])
check("same body again is a duplicate", dup.split("|")[2] == "true")
check("duplicate not stored twice", psql(f"select count(*) from import_payloads where snapshot_id = '{snap}';") == "40")
check("duplicate counted", psql(f"select duplicate_count from import_snapshots where id = '{snap}';") == "1")

failed, err = record("b" * 48, "standings", small, expect_error=True)
check("unknown secret rejected (P0002)", failed and "P0002" in err, err)
failed, err = record(secret, "standings", small, league_id=999, expect_error=True)
check("other league ID rejected (22023)", failed and "22023" in err, err)

# ---------------------------------------------------------------- next burst
psql("update import_snapshots set last_received_at = now() - interval '11 minutes' where status = 'RECEIVING';")
nxt = record(secret, "leagueteams", bodies["leagueteams"]).split("|")[0]
check("a request after a 10-minute gap opens a new snapshot", nxt != snap)
check("previous snapshot closed as RECEIVED", psql(f"select status from import_snapshots where id = '{snap}';") == "RECEIVED")
check("only one RECEIVING snapshot", psql("select count(*) from import_snapshots where status = 'RECEIVING';") == "1")

# A complete export: all 32 rosters plus standings and league teams.
team_ids = [t["teamId"] for t in json.loads(bodies["leagueteams"])["leagueTeamInfoList"]]
for t in team_ids:
    record(secret, f"team/{t}/roster", roster)
record(secret, "standings", bodies["standings"])
d2 = json.loads(psql(f"select diagnostics from import_snapshots where id = '{nxt}';"))
check("complete export: 32 rosters, nothing missing, complete", d2["rosters_received"] == 32 and d2["missing_roster_team_ids"] == [] and d2["complete"] is True, d2)

# ---------------------------------------------------------------- retention
for i in range(11):
    psql("update import_snapshots set last_received_at = now() - interval '11 minutes' where status = 'RECEIVING';")
    record(secret, "standings", bodies["standings"])
total = int(psql("select count(*) from import_snapshots;"))
with_bodies = int(psql("select count(distinct snapshot_id) from import_payloads where body is not null;"))
check("13 snapshots kept as rows", total == 13, total)
check("default retention setting is 5", psql(f"select import_keep_full_snapshots from leagues where id = '{league_id}';") == "5")
check("bodies kept for the newest 5 snapshots only", with_bodies == 5, with_bodies)
check("the first snapshot's payload rows survive without bodies",
      psql(f"select count(*) || ',' || count(body) from import_payloads where snapshot_id = '{snap}';") == "40,0")

# Changing the setting needs no migration: the next new snapshot trims to it.
psql(f"update leagues set import_keep_full_snapshots = 3 where id = '{league_id}';")
psql("update import_snapshots set last_received_at = now() - interval '11 minutes' where status = 'RECEIVING';")
record(secret, "standings", bodies["standings"])
check("setting changed to 3: bodies kept for the newest 3 snapshots",
      psql("select count(distinct snapshot_id) from import_payloads where body is not null;") == "3")
failed, err = psql(f"update leagues set import_keep_full_snapshots = 0 where id = '{league_id}';", expect_error=True)
check("setting below 1 rejected", failed and "23514" in err, err)

# ---------------------------------------------------------------- access
failed, err = psql(f"select * from public.record_snallabot_payload('{sha(secret)}', 'pc', 5481323, 'standings', '{{}}'::jsonb, '{sha('{}')}', 2);", role="anon", expect_error=True)
check("anon can't call the receiver function", failed and "42501" in err, err)
for t in ["leagues", "import_snapshots", "import_payloads", "import_snapshot_summary"]:
    failed, err = psql(f"select count(*) from public.{t};", role="anon", expect_error=True)
    check(f"anon can't read {t}", failed and "42501" in err, err)
check("service role can read the summary", psql("select count(*) from public.import_snapshot_summary;", role="service_role") == "14")

# ---------------------------------------------------------------- archived league and v1.4.0 tables
psql(f"update leagues set status = 'ARCHIVED' where id = '{league_id}';")
failed, err = record(secret, "standings", small, expect_error=True)
check("archived league's URL rejected", failed and "P0002" in err, err)
psql("""insert into trades (web_release, ruleset_version, user_raw_value, cpu_raw_value, user_adjusted_value,
        cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode)
        values ('v1.5.0','v4.4',1,1,1,1,0,'FAIR','DIRECTIONAL');""")
check("v1.4.0 delete_trade_with_audit still works",
      psql("select count(*) from delete_trade_with_audit((select id from trades limit 1), 'Admin', 'test');") == "1")

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
