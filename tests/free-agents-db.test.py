#!/usr/bin/env python3
"""Free agents and roster status: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Stores exports (with free-agent lists) under the migrations before
20261127020000_free_agents_and_roster_status.sql, applies it (backfill), then
checks roster status, signings, releases, the contract hint, check_this and
the owner commands, including a later export arriving through the receiver.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/free-agents-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "free_agents_test"
LEAGUE = "Test League"
A_EXT, B_EXT = 776994846, 776994845

results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  {detail}"))


def psql(sql, role=None, expect_error=False, db=DB):
    if role:
        sql = f"set role {role};\n{sql}"
    proc = subprocess.run(
        ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db],
        input=sql, capture_output=True, text=True,
    )
    if expect_error:
        return proc.returncode != 0, proc.stderr
    if proc.returncode != 0:
        raise RuntimeError(f"SQL failed:\n{proc.stderr}\n--- SQL ---\n{sql[:800]}")
    return proc.stdout.strip()


def q(text):
    return "'" + text.replace("'", "''") + "'"


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def record(route, body_text):
    tag = "$snb$"
    psql("select 1 from public.record_snallabot_payload("
         f"'{sha(SECRET)}', 'pc', 5481323, '{route}', {tag}{body_text}{tag}::jsonb, "
         f"'{sha(body_text)}', {len(body_text.encode('utf-8'))});", role="service_role")


def new_burst():
    psql("update import_snapshots set last_received_at = now() - interval '11 minutes' where status = 'RECEIVING';")


def player(rid, first, last, pos, ovr, age, team, ps=False, salary=10000000):
    return {"rosterId": rid, "teamId": team, "firstName": first, "lastName": last, "position": pos,
            "playerBestOvr": ovr, "age": age, "devTrait": 0, "capHit": 500, "contractYearsLeft": 2, "yearsPro": 3,
            "contractLength": 3, "contractSalary": salary, "contractBonus": 1000000,
            "isOnPracticeSquad": ps, "isOnIR": False, "isFreeAgent": False}


def export(a_players, b_players, fa_players=(), shift=0):
    """A full export: all 32 rosters (only A and B have players), standings, league
    teams. shift moves every Madden team ID (a new ID set, same teams)."""
    for t in TEAM_IDS:
        plist = a_players if t == A_EXT else b_players if t == B_EXT else []
        record(f"team/{t + shift}/roster", json.dumps({"rosterInfoList": [dict(p, teamId=t + shift) for p in plist], "success": True}))
    standings = json.loads(STANDINGS)
    for s in standings["teamStandingInfoList"]:
        s["teamId"] += shift
    record("standings", json.dumps(standings))
    teams = json.loads(LEAGUETEAMS)
    for t in teams["leagueTeamInfoList"]:
        t["teamId"] += shift
    record("leagueteams", json.dumps(teams))
    record("freeagents/roster", json.dumps({"rosterInfoList": [dict(p, teamId=0, isFreeAgent=True) for p in fa_players], "success": True}))


def asset(**kw):
    base = {"id": 1, "type": "Player", "name": "", "pick": "1.01", "timing": "Current draft",
            "ovr": "", "age": "", "pos": "", "dev": "Normal", "cap": "", "years": "",
            "league": "", "current": "Starter", "projected": "Starter", "value": 10.0}
    base.update(kw)
    return base


def trade(a_gets, b_gets):
    """A submits; a_gets = what A (submitting) receives, b_gets = what B receives."""
    return {
        "web_release": "v2.1", "ruleset_version": "v4.4",
        "user_team_assets": a_gets, "cpu_team_assets": b_gets,
        "user_raw_value": 50.0, "cpu_raw_value": 50.0,
        "user_adjusted_value": 50.0, "cpu_adjusted_value": 50.0, "adjusted_gap": 0,
        "verdict": "FAIR", "evaluation_mode": "DIRECTIONAL", "protection_tier": None,
        "required_target": None, "fair_maximum": None,
        "trade_intelligence": [], "suggested_correction": None,
    }


def submit(tr):
    out = psql("select trade_id || '|' || trade_number from public.submit_league_trade("
               f"'{LEAGUE_ID}', '{TEAM_A}', '{TEAM_B}', 'Tester', null, {q(json.dumps(tr))}::jsonb);",
               role="service_role")
    tid, num = out.split("|")
    return tid, int(num)


def review(tid, action, reason=None, tr=None):
    return psql("select review_status from public.review_league_trade("
                f"'{LEAGUE_ID}', '{tid}', {q(action)}, 'Commish', "
                f"{q(reason) if reason else 'null'}, {q(json.dumps(tr)) + '::jsonb' if tr else 'null'});",
                role="service_role")


def ledger_row(num, ref, cols="match_status"):
    return psql(f"select concat_ws(',', {cols}) from owner_trade_ledger('{LEAGUE}') "
                f"where trade_number = {num} and asset_ref = '{ref}';")


# ---------------------------------------------------------------- setup
psql(f"drop database if exists {DB};", db="postgres")
psql(f"create database {DB};", db="postgres")
psql("""
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;""")
FIX = "20261127020000_free_agents_and_roster_status.sql"
migrations = sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations")))
check("the migration exists", FIX in migrations)
for m in migrations:
    if m >= FIX:
        continue
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    LEAGUE_ID, SECRET = psql(f.read().replace("extensions.", "").replace("<LEAGUE NAME>", LEAGUE)).split("|")
with open(os.path.join(CAPTURE, "leagueteams.json"), encoding="utf-8") as f:
    LEAGUETEAMS = f.read()
with open(os.path.join(CAPTURE, "standings.json"), encoding="utf-8") as f:
    STANDINGS = f.read()
TEAM_IDS = [t["teamId"] for t in json.loads(LEAGUETEAMS)["leagueTeamInfoList"]]

record("leagueteams", LEAGUETEAMS)
psql(f"select * from owner_load_teams('{LEAGUE}');")
TEAM_A = psql(f"select id from league_teams where external_team_id = {A_EXT};")
TEAM_B = psql(f"select id from league_teams where external_team_id = {B_EXT};")
A_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_A}';")
B_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_B}';")
psql(f"update league_teams set controlled_by = 'USER' where id = '{TEAM_A}'; update league_teams set controlled_by = 'CPU' where id = '{TEAM_B}';")

MAHOMES = player(101, "Patrick", "Mahomes", "QB", 94, 25, A_EXT)
KELCE = player(102, "Travis", "Kelce", "TE", 90, 31, A_EXT, ps=True)
SMITH = player(103, "John", "Smith", "WR", 70, 27, A_EXT)
CHASE = player(201, "Ja'Marr", "Chase", "WR", 95, 24, B_EXT)
BURROW = player(202, "Joe", "Burrow", "QB", 92, 26, B_EXT)
JONES = player(301, "Aaron", "Jones", "HB", 78, 30, 0, salary=2000000)

new_burst()
export([MAHOMES, KELCE, SMITH], [CHASE, BURROW], [JONES])            # first export (capture standings: week 5)
new_burst()
# Next export: Kelce traded A (practice squad) -> B roster, same contract; Smith cut by A
# and picked up by B, new contract; Jones signed by A; Burrow released by B;
# Mahomes A roster -> A practice squad (same team: not a move).
export([dict(MAHOMES, isOnPracticeSquad=True), dict(JONES, salary=3000000, contractSalary=3000000)],
       [CHASE, dict(KELCE, isOnPracticeSquad=False), dict(SMITH, contractSalary=1500000)],
       [BURROW])

check("before: free-agent lists stored but not built",
      psql("select count(*) from import_payloads where route = 'freeagents/roster' and history_status is null;") == "2")

# ---------------------------------------------------------------- apply (backfill)
with open(os.path.join(ROOT, "supabase", "migrations", FIX), encoding="utf-8") as f:
    psql(f.read())

check("backfill: free-agent lists built", psql("select count(*) from import_payloads where route = 'freeagents/roster' and history_status = 'DONE';") == "2")
check("free agents saved with no team and the free-agent flag",
      psql("select concat_ws(',', count(*), count(team_id), bool_and(is_free_agent)) from player_history p join import_payloads x on x.id = p.payload_id where x.route = 'freeagents/roster';") == "2,0,t")
check("roster_status in the history view",
      psql("select string_agg(roster_id || ':' || roster_status, ',' order by roster_id) from player_history_view "
           "where snapshot_id = (select snapshot_id from player_history order by received_at limit 1);")
      == "101:ROSTER,102:PRACTICE SQUAD,103:ROSTER,201:ROSTER,202:ROSTER,301:FREE AGENT")
ih = psql(f"select concat_ws(',', week, roster_payloads, players, free_agents, teams, failed, not_built) from owner_import_history('{LEAGUE}') order by received desc;").splitlines()
check("owner check: team players and free agents counted apart", ih[:2] == ["5,32,5,1,32,0,0", "5,32,5,1,32,0,0"], ih)

def moves():
    return {r.split(",")[0]: r for r in psql(
        f"select concat_ws(',', player, coalesce(from_team, '-'), from_status, coalesce(from_control, '-'), coalesce(to_team, '-'), to_status, coalesce(to_control, '-'), "
        f"status, coalesce(check_this::text, '-'), coalesce(contract_changed::text, '-')) from owner_roster_moves('{LEAGUE}');").splitlines()}

mv = moves()
check("4 moves (a status change on the same team is not a move)", len(mv) == 4 and "Patrick Mahomes" not in mv, list(mv))
check("trade: practice squad -> roster, same contract, flagged (human team, not logged)",
      mv.get("Travis Kelce") == f"Travis Kelce,{A_ABBR},PRACTICE SQUAD,USER,{B_ABBR},ROSTER,CPU,NOT LOGGED,true,false", mv.get("Travis Kelce"))
check("cut and picked up between exports: still flagged, contract_changed true",
      mv.get("John Smith") == f"John Smith,{A_ABBR},ROSTER,USER,{B_ABBR},ROSTER,CPU,NOT LOGGED,true,true", mv.get("John Smith"))
check("signing: free agent -> team, not flagged",
      mv.get("Aaron Jones") == f"Aaron Jones,-,FREE AGENT,-,{A_ABBR},ROSTER,USER,SIGNING,false,-", mv.get("Aaron Jones"))
check("release: team -> free agent, not flagged",
      mv.get("Joe Burrow") == f"Joe Burrow,{B_ABBR},ROSTER,CPU,-,FREE AGENT,-,RELEASE,false,-", mv.get("Joe Burrow"))
check("flagged moves sort first, signings and releases last",
      psql(f"select string_agg(status, ',') from owner_roster_moves('{LEAGUE}');").startswith("NOT LOGGED,NOT LOGGED,"))

# ---------------------------------------------------------------- a later export through the receiver
_, T1 = submit(trade([asset(name="Joe Burrow", pos="QB")], [asset(id=2, type="Draft Pick", pick="7th")]))
new_burst()
export([dict(MAHOMES, isOnPracticeSquad=True), dict(JONES, salary=3000000, contractSalary=3000000), dict(BURROW, salary=5000000, contractSalary=5000000)],
       [CHASE, dict(KELCE, isOnPracticeSquad=False), dict(SMITH, contractSalary=1500000)], [])
check("new free-agent list built on arrival",
      psql("select count(*) from import_payloads where route = 'freeagents/roster' and history_status = 'DONE';") == "3")
mv = moves()
check("free agent signed by a team shows as a signing",
      mv.get("Joe Burrow", "").startswith(f"Joe Burrow,-,FREE AGENT,-,{A_ABBR},ROSTER,USER,SIGNING,false") or
      any(r.startswith(f"Joe Burrow,-,FREE AGENT,-,{A_ABBR}") for r in psql(f"select concat_ws(',', player, coalesce(from_team, '-'), from_status, coalesce(from_control, '-'), coalesce(to_team, '-')) from owner_roster_moves('{LEAGUE}');").splitlines()))
check("ledger ignores free-agent rows when matching (trade logged for a free agent: UNMATCHED)",
      psql(f"select match_status from owner_trade_ledger('{LEAGUE}') where trade_number = {T1} and asset_ref = 'S1';") == "UNMATCHED")
check("free agents never count as a team for 'seen in game'",
      psql(f"select count(*) from trade_ledger where league_id = '{LEAGUE_ID}' and seen_in_game = 'YES';") == "0")

# ---------------------------------------------------------------- odd payloads
record("team/776994850/roster", json.dumps({"success": True}))
check("team roster with no player list: FAILED, export still stored",
      psql("select history_status from import_payloads where route = 'team/776994850/roster' order by received_at desc limit 1;") == "FAILED")

# ---------------------------------------------------------------- access
failed, err = psql(f"select * from owner_roster_moves('{LEAGUE}');", role="service_role", expect_error=True)
check("service role can't run owner_roster_moves", failed and "42501" in err, err)
failed, err = psql(f"select * from owner_import_history('{LEAGUE}');", role="service_role", expect_error=True)
check("service role can't run owner_import_history", failed and "42501" in err, err)
failed, err = psql("select player_status(1, false, false, false);", role="anon", expect_error=True)
check("anon can't call player_status", failed and "42501" in err, err)

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
