#!/usr/bin/env python3
"""Team ID changes: database tests (import history and the transaction ledger).

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Replays what happened on 2026-11-24: exports under one set of Madden team IDs,
then an export where every team has a new ID. Applies every migration except
20261125010000_team_id_changes.sql, shows the problem, applies it, and checks
that teams, history views, the ledger and roster moves follow the teams.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/team-id-changes-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "team_id_changes_test"
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


def player(rid, first, last, pos, ovr, age, team):
    return {"rosterId": rid, "teamId": team, "firstName": first, "lastName": last, "position": pos,
            "playerBestOvr": ovr, "age": age, "devTrait": 0, "capHit": 500, "contractYearsLeft": 2, "yearsPro": 3}


def export(a_players, b_players, shift=0):
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
FIX = "20261125010000_team_id_changes.sql"
migrations = sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations")))
check("the fix migration exists", FIX in migrations)
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
SHIFT1, SHIFT2 = -131102, -262204          # two later ID sets (week 8 began with 7768637xx)

record("leagueteams", LEAGUETEAMS)
psql(f"select * from owner_load_teams('{LEAGUE}');")
TEAM_A = psql(f"select id from league_teams where external_team_id = {A_EXT};")
TEAM_B = psql(f"select id from league_teams where external_team_id = {B_EXT};")
A_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_A}';")
B_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_B}';")

A1 = [player(101, "Patrick", "Mahomes", "QB", 94, 25, A_EXT), player(102, "Travis", "Kelce", "TE", 90, 31, A_EXT)]
B1 = [player(201, "Ja'Marr", "Chase", "WR", 95, 24, B_EXT), player(202, "Joe", "Burrow", "QB", 92, 26, B_EXT)]
new_burst()
export(A1, B1)                                      # week 6, original IDs
T1_ID, T1 = submit(trade([asset(name="Ja'Marr Chase", pos="WR")], [asset(id=2, name="Travis Kelce", pos="TE")]))
new_burst()
export(A1, B1, SHIFT1)                              # week 8, every team ID new, nobody moved

check("before the fix: every player looks moved", psql(f"select count(*) from owner_roster_moves('{LEAGUE}');") == "4")
failed, err = psql(f"select * from owner_load_teams('{LEAGUE}');", expect_error=True)
check("before the fix: owner_load_teams fails on the new IDs", failed and "23505" in err, err[-300:])

# ---------------------------------------------------------------- apply the fix
with open(os.path.join(ROOT, "supabase", "migrations", FIX), encoding="utf-8") as f:
    psql(f.read())

check("both ID sets recorded for all 32 teams",
      psql(f"select count(distinct league_team_id) || ',' || count(*) from league_team_external_ids where league_id = '{LEAGUE_ID}';") == "32,64")
check("league teams now carry the newest IDs",
      psql(f"select external_team_id from league_teams where id = '{TEAM_A}';") == str(A_EXT + SHIFT1))
check("team list payloads marked built",
      psql("select count(*) from import_payloads where route = 'leagueteams' and history_status = 'DONE';") == "3")
check("after the fix: no roster moves (same teams, new IDs)", psql(f"select count(*) from owner_roster_moves('{LEAGUE}');") == "0")
check("history view: same team before and after the ID change",
      psql("select count(distinct team_abbr) || ',' || count(distinct team_id) from player_history_view where roster_id = 101;") == f"1,2")
check("history view: team abbreviation shown", psql("select distinct team_abbr from player_history_view where roster_id = 201;") == B_ABBR)
check("team history: league team shown for every week",
      psql(f"select count(*) from team_history_latest where league_team_id = '{TEAM_A}';") == "2")
out = psql(f"select string_agg(change, ',' order by change) from (select distinct change from owner_load_teams('{LEAGUE}')) x;")
check("owner_load_teams works again and adds nothing", "added" not in out, out)
check("still 32 teams", psql(f"select count(*) from league_teams where league_id = '{LEAGUE_ID}';") == "32")
check("ledger: players still linked", psql(f"select string_agg(match_status, ',' order by asset_ref) from owner_trade_ledger('{LEAGUE}') where trade_number = {T1};") == "EXACT,EXACT")
check("ledger: not seen in game yet (nobody moved)", psql(f"select string_agg(seen_in_game, ',') from owner_trade_ledger('{LEAGUE}') where trade_number = {T1};") == "NO,NO")

# ---------------------------------------------------------------- after the fix: a real move, then another ID change
A3 = [A1[0], dict(B1[0])]
B3 = [B1[1], dict(A1[1])]
new_burst()
export(A3, B3, SHIFT1)                              # Chase and Kelce traded in game
moves = psql(f"select concat_ws(',', player, from_team, to_team, status, logged_trade_number) from owner_roster_moves('{LEAGUE}') order by player;").splitlines()
check("real moves show the right teams and the logged trade",
      moves == [f"Ja'Marr Chase,{B_ABBR},{A_ABBR},LOGGED,{T1}", f"Travis Kelce,{A_ABBR},{B_ABBR},LOGGED,{T1}"], moves)
check("ledger: seen in game once the new-ID export shows them",
      psql(f"select string_agg(seen_in_game, ',') from owner_trade_ledger('{LEAGUE}') where trade_number = {T1};") == "YES,YES")

new_burst()
export(A3, B3, SHIFT2)                              # yet another ID set, arriving through the receiver
check("a later ID change is recorded on arrival",
      psql(f"select count(*) from league_team_external_ids where league_id = '{LEAGUE_ID}';") == "96")
check("still just the 2 real moves", psql(f"select count(*) from owner_roster_moves('{LEAGUE}');") == "2")
_, T2 = submit(trade([asset(name="Joe Burrow", pos="QB")], [asset(id=2, type="Draft Pick", pick="7th")]))
check("a trade after the change matches on the newest roster",
      psql(f"select match_status from owner_trade_ledger('{LEAGUE}') where trade_number = {T2} and asset_ref = 'S1';") == "EXACT")

# ---------------------------------------------------------------- access
failed, err = psql("select count(*) from public.league_team_external_ids;", role="anon", expect_error=True)
check("anon can't read team IDs", failed and "42501" in err, err)
failed, err = psql(f"select league_team_of('{LEAGUE_ID}', 1);", role="anon", expect_error=True)
check("anon can't call league_team_of", failed and "42501" in err, err)
check("service role can read the history views", int(psql("select count(*) from player_history_view;", role="service_role")) > 0)

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
