#!/usr/bin/env python3
"""Web v4.0 League activity and trade posture: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Checks the posture stored with a submission, the posture inputs read, the
commissioner roster moves with the handled mark, trades to check, player
candidates and linking, and access.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/web-v4.0-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "web_v4_test"
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
migrations = sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations")))
check("v4.0 migration present", "20261127050000_web_v4_activity_and_posture.sql" in migrations)
for m in migrations:
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
KELCE = player(102, "Travis", "Kelce", "TE", 90, 31, A_EXT)
SMITH = player(103, "John", "Smith", "WR", 70, 27, A_EXT)
CHASE = player(201, "Ja'Marr", "Chase", "WR", 95, 24, B_EXT)
JONES = player(301, "Aaron", "Jones", "HB", 78, 30, 0)

new_burst()
export([MAHOMES, KELCE, SMITH], [CHASE], [JONES])
SNAP1 = psql(f"select id from import_snapshots where league_id = '{LEAGUE_ID}' and season is not null order by first_received_at limit 1;")

# ---------------------------------------------------------------- posture inputs
rows = psql(f"select count(*) || ',' || min(week) || ',' || bool_or(is_current) from league_posture_inputs('{LEAGUE}');", role="anon")
check("posture inputs: every team, week of the newest export, none current", rows == "32,5,false", rows)
RAVENS = psql("select abbreviation from league_teams where external_team_id = 776994844;")
rec = psql(f"select concat_ws('-', wins, losses, ties) from league_posture_inputs('{LEAGUE}') where abbreviation = '{RAVENS}';", role="anon")
check("posture inputs: a team's record (Ravens 2-2-0)", rec == "2-2-0", rec)
check("posture inputs: unknown league -> none", psql("select count(*) from league_posture_inputs('Nope');", role="anon") == "0")

# ---------------------------------------------------------------- posture stored with a submission
POSTURE = {"version": 1, "as_of": {"season": 2027, "week": 5, "stage_index": 1}, "teams": [
    {"side": "A", "team": A_ABBR, "wins": 7, "losses": 1, "ties": 0, "label": "WIN_NOW", "strength": 0.6, "weight": 0.11, "edited": False},
    {"side": "B", "team": B_ABBR, "wins": 2, "losses": 6, "ties": 0, "label": "REBUILDING", "strength": 0.5, "weight": 0.11, "edited": True}],
    "warnings": [{"team": A_ABBR, "code": "SELLING_WHILE_WINNING"}]}


def submit_p(tr, posture):
    sql = ("select trade_id || '|' || trade_number from public.submit_league_trade("
           f"'{LEAGUE_ID}', '{TEAM_A}', '{TEAM_B}', 'Tester', null, {q(json.dumps(tr))}::jsonb"
           + (f", {q(json.dumps(posture)) if not isinstance(posture, str) else posture}::jsonb" if posture is not None else "") + ");")
    return psql(sql, role="service_role")


PLAYER_A = asset(name="Patrick Mahomes", pos="QB", ovr="94")
T1_ID, T1 = submit_p(trade([asset(type="Draft Pick", pick="4th")], [PLAYER_A]), POSTURE).split("|")
check("posture stored on the trade", psql(f"select posture -> 'warnings' -> 0 ->> 'code' from trades where id = '{T1_ID}';") == "SELLING_WHILE_WINNING")
check("league history returns the posture", psql(f"select posture -> 'teams' -> 1 ->> 'label' from league_trade_history('{LEAGUE}') where trade_number = {T1};", role="anon") == "REBUILDING")
T0 = submit_p(trade([asset(type="Draft Pick", pick="5th")], [asset(id=2, name="Nobody Real", pos="WR")]), None)
check("no posture (older page): stored as null", psql(f"select coalesce(posture::text, 'null') from trades where trade_number = {T0.split('|')[1]};") == "null")
failed, err = psql("select 1 from public.submit_league_trade("
                   f"'{LEAGUE_ID}', '{TEAM_A}', '{TEAM_B}', 'Tester', null, {q(json.dumps(trade([PLAYER_A], [asset(id=2, type='Draft Pick', pick='6th')])))}::jsonb, '[1,2]'::jsonb);",
                   role="service_role", expect_error=True)
check("posture must be an object", failed and "posture information is invalid" in err, err)
big = {"teams": [], "pad": "x" * 4100}
failed, err = psql("select 1 from public.submit_league_trade("
                   f"'{LEAGUE_ID}', '{TEAM_A}', '{TEAM_B}', 'Tester', null, {q(json.dumps(trade([PLAYER_A], [asset(id=2, type='Draft Pick', pick='6th')])))}::jsonb, {q(json.dumps(big))}::jsonb);",
                   role="service_role", expect_error=True)
check("posture over 4000 characters refused", failed and "posture information is invalid" in err, err)
psql("select 1 from public.review_league_trade("
     f"'{LEAGUE_ID}', '{T1_ID}', 'CORRECT', 'Commish', 'fix', {q(json.dumps(trade([asset(type='Draft Pick', pick='4th')], [PLAYER_A])))}::jsonb);", role="service_role")
check("a correction keeps the posture from submission", psql(f"select posture -> 'teams' -> 0 ->> 'wins' from trades where id = '{T1_ID}';") == "7")

# ---------------------------------------------------------------- roster moves (next export)
new_burst()
export([MAHOMES, dict(JONES, contractSalary=3000000)],
       [CHASE, dict(KELCE, isOnPracticeSquad=True), dict(SMITH, contractSalary=1500000)], [])
SNAP2 = psql(f"select id from import_snapshots where league_id = '{LEAGUE_ID}' and season is not null order by first_received_at desc limit 1;")
moves = {r.split("|")[0]: r for r in psql(
    f"select concat_ws('|', player, status, check_this, coalesce(handled_by, '-')) from commissioner_roster_moves('{LEAGUE_ID}');",
    role="service_role").splitlines()}
check("activity: moves listed with status and check_this",
      moves.get("John Smith") == "John Smith|NOT LOGGED|t|-" and moves.get("Travis Kelce") == "Travis Kelce|PRACTICE SQUAD|f|-" and moves.get("Aaron Jones") == "Aaron Jones|SIGNING|f|-", moves)
check("activity: moves needing a look come first",
      psql(f"select player from commissioner_roster_moves('{LEAGUE_ID}') limit 1;", role="service_role") == "John Smith")
check("activity: limited to recent exports (1 export -> its moves only)",
      psql(f"select count(*) from commissioner_roster_moves('{LEAGUE_ID}', 1);", role="service_role") == "3")

out = psql(f"select concat_ws(',', handled, changed) from commissioner_mark_move_handled('{LEAGUE_ID}', 103, '{SNAP2}', true, '  Cut and claimed, not a trade ', 'Commish');", role="service_role")
check("mark handled", out == "t,t", out)
check("handled mark and trimmed note shown",
      psql(f"select concat_ws('|', handled_by, handled_note) from commissioner_roster_moves('{LEAGUE_ID}') where roster_id = 103;", role="service_role") == "Commish|Cut and claimed, not a trade")
check("handled audited with the player", psql("select details ->> 'player' from audit_events where action = 'ROSTER_MOVE_HANDLED';") == "John Smith")
out = psql(f"select concat_ws(',', handled, changed) from commissioner_mark_move_handled('{LEAGUE_ID}', 103, '{SNAP2}', false, null, 'Commish');", role="service_role")
check("clear the mark", out == "f,t" and psql(f"select coalesce(handled_by, '-') from commissioner_roster_moves('{LEAGUE_ID}') where roster_id = 103;", role="service_role") == "-")
check("clearing again changes nothing", psql(f"select changed from commissioner_mark_move_handled('{LEAGUE_ID}', 103, '{SNAP2}', false, null, 'Commish');", role="service_role") == "f")
failed, err = psql(f"select * from commissioner_mark_move_handled('{LEAGUE_ID}', 999, '{SNAP2}', true, null, 'Commish');", role="service_role", expect_error=True)
check("unknown move refused", failed and "P0002" in err, err)
failed, err = psql(f"select * from commissioner_mark_move_handled('{LEAGUE_ID}', 103, '{SNAP2}', true, '{'x' * 301}', 'Commish');", role="service_role", expect_error=True)
check("note over 300 characters refused", failed and "300 characters" in err, err)

# ---------------------------------------------------------------- trades to check
issues = psql(f"select concat_ws('|', trade_number, asset_ref, issue) from commissioner_ledger_issues('{LEAGUE_ID}');", role="service_role").splitlines()
T0_NUM = T0.split("|")[1]
check("trades to check: an unlinked player", f"{T0_NUM}|O1|NOT LINKED" in issues, issues)
check("trades to check: a linked player not seen on the new team", f"{T1}|O1|NOT SEEN IN GAME" in issues, issues)
cands = psql(f"select string_agg(player || ':' || team, ',' order by roster_id) from commissioner_player_candidates('{LEAGUE_ID}', '{T0.split('|')[0]}');", role="service_role")
check("player candidates: both teams' rosters at the trade's export", cands == f"Patrick Mahomes:{A_ABBR},Travis Kelce:{A_ABBR},John Smith:{A_ABBR},Ja'Marr Chase:{B_ABBR}", cands)
out = psql(f"select concat_ws(',', match_status, matched_player, roster_id) from commissioner_link_trade_player('{LEAGUE_ID}', '{T0.split('|')[0]}', 'o1', 103, 'Commish');", role="service_role")
check("link a player", out == "MANUAL,John Smith,103", out)
check("link audited", psql("select details ->> 'asset' from audit_events where action = 'TRADE_PLAYER_LINKED';") == "O1")
check("linked player leaves 'not linked'", f"{T0_NUM}|O1|NOT LINKED" not in psql(f"select concat_ws('|', trade_number, asset_ref, issue) from commissioner_ledger_issues('{LEAGUE_ID}');", role="service_role").splitlines())
out = psql(f"select match_status from commissioner_link_trade_player('{LEAGUE_ID}', '{T0.split('|')[0]}', 'O1', null, 'Commish');", role="service_role")
check("null returns the player to automatic matching", out == "UNMATCHED", out)
failed, err = psql(f"select * from commissioner_link_trade_player('{LEAGUE_ID}', '{T0.split('|')[0]}', 'S1', 103, 'Commish');", role="service_role", expect_error=True)
check("a pick can't be linked", failed and "P0002" in err, err)
failed, err = psql(f"select * from commissioner_link_trade_player('{LEAGUE_ID}', gen_random_uuid(), 'O1', 103, 'Commish');", role="service_role", expect_error=True)
check("unknown trade refused", failed and "P0002" in err, err)

# ---------------------------------------------------------------- current export drives posture inputs
psql(f"update import_snapshots set last_received_at = now() - interval '11 minutes' where id = '{SNAP1}';")
psql(f"select * from commissioner_mark_snapshot_current('{LEAGUE_ID}', '{SNAP1}', 'Commish');", role="service_role")
check("posture inputs follow the current export", psql(f"select bool_and(is_current) || ',' || count(*) from league_posture_inputs('{LEAGUE}');", role="anon") == "true,32")

# ---------------------------------------------------------------- access
for fn in [f"commissioner_roster_moves('{LEAGUE_ID}')", f"commissioner_ledger_issues('{LEAGUE_ID}')",
           f"commissioner_player_candidates('{LEAGUE_ID}', gen_random_uuid())",
           f"commissioner_mark_move_handled('{LEAGUE_ID}', 1, gen_random_uuid(), true, null, 'x')",
           f"commissioner_link_trade_player('{LEAGUE_ID}', gen_random_uuid(), 'O1', 1, 'x')"]:
    failed, err = psql(f"select * from {fn};", role="anon", expect_error=True)
    check(f"anon refused: {fn.split('(')[0]}", failed and "42501" in err, err)
failed, err = psql("select count(*) from roster_move_reviews;", role="anon", expect_error=True)
check("anon can't read handled marks", failed and "42501" in err, err)
failed, err = psql("select 1 from public.submit_league_trade(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x', null, '{}'::jsonb, null);", role="anon", expect_error=True)
check("anon can't submit directly", failed and "42501" in err, err)

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
