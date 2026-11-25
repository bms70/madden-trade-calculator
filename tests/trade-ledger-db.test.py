#!/usr/bin/env python3
"""Transaction ledger (backend only): database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Builds a test league with two small team rosters, logs league trades, sends a
second export where players have moved, and checks trade_ledger,
trade_ledger_links, roster_moves and the owner commands.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/trade-ledger-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "trade_ledger_test"
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


def export(a_players, b_players):
    """A full export: all 32 rosters (only A and B have players), standings, league teams."""
    for t in TEAM_IDS:
        plist = a_players if t == A_EXT else b_players if t == B_EXT else []
        record(f"team/{t}/roster", json.dumps({"rosterInfoList": [dict(p, teamId=t) for p in plist], "success": True}))
    record("standings", STANDINGS)
    record("leagueteams", LEAGUETEAMS)


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
for m in migrations:
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())
check("all migrations apply, trade ledger last", migrations[-1] == "20261124030000_trade_ledger.sql", migrations[-1])

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    LEAGUE_ID, SECRET = psql(f.read().replace("extensions.", "").replace("<LEAGUE NAME>", LEAGUE)).split("|")
with open(os.path.join(CAPTURE, "leagueteams.json"), encoding="utf-8") as f:
    LEAGUETEAMS = f.read()
with open(os.path.join(CAPTURE, "standings.json"), encoding="utf-8") as f:
    STANDINGS = f.read()
TEAM_IDS = [t["teamId"] for t in json.loads(LEAGUETEAMS)["leagueTeamInfoList"]]

# League teams only (no rosters yet), then load teams.
record("leagueteams", LEAGUETEAMS)
psql(f"select * from owner_load_teams('{LEAGUE}');")
psql(f"select * from owner_set_commissioner_password('{LEAGUE}', 'pw-for-tests');")
TEAM_A = psql(f"select id from league_teams where external_team_id = {A_EXT};")
TEAM_B = psql(f"select id from league_teams where external_team_id = {B_EXT};")
A_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_A}';")
B_ABBR = psql(f"select abbreviation from league_teams where id = '{TEAM_B}';")

# A trade before any roster export: no data to match against.
_, T0 = submit(trade([asset(name="Joe Burrow", pos="QB", ovr="92")], [asset(type="Draft Pick", pick="4th", timing="Next year")]))
check("trade before any export: NO_DATA", ledger_row(T0, "S1") == "NO_DATA", ledger_row(T0, "S1"))
check("no league week before any export", ledger_row(T0, "S1", "coalesce(week::text, 'none')") == "none")

# ---------------------------------------------------------------- export 1 (week 5)
A1 = [player(101, "Patrick", "Mahomes", "QB", 94, 25, A_EXT), player(102, "Travis", "Kelce", "TE", 90, 31, A_EXT),
      player(103, "John", "Smith", "WR", 80, 26, A_EXT), player(104, "Jake", "Smith", "WR", 75, 24, A_EXT)]
B1 = [player(201, "Ja'Marr", "Chase", "WR", 95, 24, B_EXT), player(202, "Joe", "Burrow", "QB", 92, 26, B_EXT),
      player(203, "Trey", "Hendrickson", "REDG", 91, 29, B_EXT)]
new_burst()
export(A1, B1)
check("export 1 built into history", psql("select count(*) from player_history_latest;") == "7")

# T1: A gets Chase (exact, despite the apostrophe); B gets Kelce (last name only) and a pick.
t1_tr = trade([asset(name="Ja'Marr Chase", pos="WR", ovr="95")],
              [asset(id=2, name="Kelce", pos="TE", ovr="90"), asset(id=3, type="Draft Pick", pick="Mid 2nd", timing="Current draft")])
T1_ID, T1 = submit(t1_tr)
# T2: A gets an unnamed EDGE 91 age 29; B gets "Smith" (two WR Smiths on A).
T2_ID, T2 = submit(trade([asset(pos="EDGE", ovr="91", age="29")], [asset(id=2, name="Smith", pos="WR")]))
# T3: the same as T1 again (a duplicate submission).
T3_ID, T3 = submit(t1_tr)
# T4: a name nobody has; T6: a typo.
_, T4 = submit(trade([asset(name="Nobody Here", pos="QB")], [asset(id=2, type="Draft Pick", pick="7th")]))
_, T6 = submit(trade([asset(type="Draft Pick", pick="6th")], [asset(id=2, name="Patrik Mahomes", pos="QB")]))

check("direction: S1 moves from the other team to the submitting team",
      ledger_row(T1, "S1", "from_team, to_team") == f"{B_ABBR},{A_ABBR}")
check("direction: O1 moves from the submitting team to the other team",
      ledger_row(T1, "O1", "from_team, to_team") == f"{A_ABBR},{B_ABBR}")
check("league week from the export before the trade (2027 week 5)", ledger_row(T1, "S1", "season, week") == "2027,5")
check("exact name match (punctuation ignored)", ledger_row(T1, "S1", "match_status, roster_id, matched_player") == "EXACT,201,Ja'Marr Chase")
check("close match: last name only", ledger_row(T1, "O1", "match_status, roster_id") == "CLOSE,102")
check("draft picks listed, not linked", ledger_row(T1, "O2", "asset, coalesce(match_status, '-')") == "Mid 2nd (Current draft),-")
check("close match: no name, position + OVR + age (REDG -> EDGE)", ledger_row(T2, "S1", "match_status, roster_id") == "CLOSE,203")
check("two players fit: AMBIGUOUS, unlinked", ledger_row(T2, "O1", "match_status, coalesce(roster_id::text, '-')") == "AMBIGUOUS,-")
check("no such player: UNMATCHED", ledger_row(T4, "S1") == "UNMATCHED")
check("small typo: close match", ledger_row(T6, "O1", "match_status, roster_id") == "CLOSE,101")
check("unreviewed trades included, with their status", ledger_row(T1, "S1", "review_status") == "UNREVIEWED")
check("duplicate flagged on the later trade", ledger_row(T3, "S1", "possible_duplicate_of") == str(T1))
check("the earlier trade isn't flagged", ledger_row(T1, "S1", "coalesce(possible_duplicate_of::text, '-')") == "-")
check("in game: PENDING before any later export", ledger_row(T1, "S1", "seen_in_game") == "PENDING")

# Owner links the ambiguous Smith by hand.
out = psql(f"select concat_ws(',', match_status, matched_player, roster_id) from owner_link_trade_player('{LEAGUE}', {T2}, 'o1', 103);")
check("owner link: MANUAL", out == "MANUAL,John Smith,103", out)
check("owner link survives a refresh", ledger_row(T2, "O1", "match_status, roster_id") == "MANUAL,103")
failed, err = psql(f"select * from owner_link_trade_player('{LEAGUE}', {T2}, 'X9', 103);", expect_error=True)
check("owner link: bad asset reference rejected", failed and "22023" in err, err)
failed, err = psql(f"select * from owner_link_trade_player('{LEAGUE}', {T1}, 'O2', 103);", expect_error=True)
check("owner link: a draft pick can't be linked", failed and "P0002" in err, err)
failed, err = psql(f"select * from owner_link_trade_player('{LEAGUE}', {T2}, 'O1', 999);", expect_error=True)
check("owner link: unknown roster ID rejected", failed and "P0002" in err, err)

# Review, reverse and correct.
review(T1_ID, "REVIEW")
check("reviewed status shows", ledger_row(T1, "S1", "review_status") == "REVIEWED")
review(T3_ID, "REVERSE", reason="duplicate")
check("reversed trade leaves the ledger", psql(f"select count(*) from owner_trade_ledger('{LEAGUE}') where trade_number = {T3};") == "0")
check("reversed trade's links removed", psql(f"select count(*) from trade_ledger_links where trade_id = '{T3_ID}';") == "0")
review(T2_ID, "CORRECT", reason="fix OVR", tr=trade([asset(pos="EDGE", ovr="91", age="29")], [asset(id=2, name="Smith", pos="WR", ovr="80")]))
check("a correction uses the new revision", ledger_row(T2, "O1", "revision") == "1")
check("a correction restarts matching (owner link was for the old revision)",
      psql(f"select count(*) from trade_ledger_links where trade_id = '{T2_ID}' and set_by <> 'auto';") == "0")
check("ambiguous by name (both WR) after correction", ledger_row(T2, "O1") == "AMBIGUOUS")

# ---------------------------------------------------------------- export 2 (players moved)
A2 = [p for p in A1 if p["rosterId"] != 102] + [dict(B1[0], teamId=A_EXT), dict(B1[1], teamId=A_EXT)]
B2 = [B1[2], dict(A1[1], teamId=B_EXT)]
new_burst()
export(A2, B2)

check("in game: YES once the player shows on the receiving team", ledger_row(T1, "S1", "seen_in_game") == "YES")
check("in game: YES for the other direction too", ledger_row(T1, "O1", "seen_in_game") == "YES")
check("in game: NO when a later export still has him on the old team", ledger_row(T2, "S1", "seen_in_game") == "NO")

moves = psql(f"select concat_ws(',', player, from_team, to_team, status, coalesce(logged_trade_number::text, '-')) "
             f"from owner_roster_moves('{LEAGUE}') order by player;").splitlines()
check("roster moves: 3 players changed teams", len(moves) == 3, moves)
check("roster move explained by the logged trade (Chase)", f"Ja'Marr Chase,{B_ABBR},{A_ABBR},LOGGED,{T1}" in moves, moves)
check("roster move explained by the logged trade (Kelce)", f"Travis Kelce,{A_ABBR},{B_ABBR},LOGGED,{T1}" in moves, moves)
burrow = [m for m in moves if m.startswith("Joe Burrow")]
check("move with no logged trade: NOT LOGGED (Burrow)", len(burrow) == 1 and burrow[0].endswith(",NOT LOGGED,-"), burrow)

# Burrow was traded in Madden first and logged afterwards.
_, T5 = submit(trade([asset(name="Joe Burrow", pos="QB")], [asset(id=2, type="Draft Pick", pick="Late 3rd")]))
check("trade logged after the move: matched on the receiving roster",
      ledger_row(T5, "S1", "match_status, matched_from, seen_in_game") == "EXACT,RECEIVING,YES")
check("trade logged shortly after the move explains it",
      psql(f"select status || ',' || logged_trade_number from owner_roster_moves('{LEAGUE}') where roster_id = 202;") == f"LOGGED,{T5}")
check("a trade older than every export stays NO_DATA",
      ledger_row(T0, "S1") == "NO_DATA")

# ---------------------------------------------------------------- access
for t in ["trade_ledger", "trade_ledger_links", "roster_moves"]:
    failed, err = psql(f"select count(*) from public.{t};", role="anon", expect_error=True)
    check(f"anon can't read {t}", failed and "42501" in err, err)
check("service role can read the ledger", int(psql("select count(*) from public.trade_ledger;", role="service_role")) > 0)
failed, err = psql(f"select ledger_refresh('{LEAGUE_ID}');", role="anon", expect_error=True)
check("anon can't refresh links", failed and "42501" in err, err)
for fn in [f"owner_trade_ledger('{LEAGUE}')", f"owner_roster_moves('{LEAGUE}')",
           f"owner_link_trade_player('{LEAGUE}', {T2}, 'O1', 103)"]:
    failed, err = psql(f"select * from {fn};", role="service_role", expect_error=True)
    check(f"service role can't run {fn.split('(')[0]}", failed and "42501" in err, err)
check("stored trades untouched (no ledger columns on trades)",
      psql("select count(*) from information_schema.columns where table_name = 'trades' and column_name like '%ledger%';") == "0")

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
