#!/usr/bin/env python3
"""Web v3.0 draft-pick ownership and snapshot review: database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Sets up picks, submits league trades with and without pick choices, corrects
and reverses them (including a pick that moved again), checks the commissioner
pick and snapshot functions, the draft rollover, the owner replay of trades
logged before tracking, and access.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/web-v3.0-picks-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "web_v3_picks_test"
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
check("v3.0 migration present", "20261127040000_web_v3_picks_and_snapshots.sql" in migrations)
for m in migrations:
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    LEAGUE_ID, SECRET = psql(f.read().replace("extensions.", "").replace("<LEAGUE NAME>", LEAGUE)).split("|")
with open(os.path.join(CAPTURE, "leagueteams.json"), encoding="utf-8") as f:
    LEAGUETEAMS = f.read()
with open(os.path.join(CAPTURE, "standings.json"), encoding="utf-8") as f:
    STANDINGS = f.read()
record("leagueteams", LEAGUETEAMS)
psql(f"select * from owner_load_teams('{LEAGUE}');")
TEAM_A = psql(f"select id from league_teams where external_team_id = {A_EXT};")
TEAM_B = psql(f"select id from league_teams where external_team_id = {B_EXT};")
TEAM_C = psql(f"select id from league_teams where league_id = '{LEAGUE_ID}' and id not in ('{TEAM_A}', '{TEAM_B}') order by abbreviation limit 1;")
ABBR = {t: psql(f"select abbreviation from league_teams where id = '{t}';") for t in (TEAM_A, TEAM_B, TEAM_C)}


def submit_teams(tr, a, b):
    out = psql("select trade_id || '|' || trade_number from public.submit_league_trade("
               f"'{LEAGUE_ID}', '{a}', '{b}', 'Tester', null, {q(json.dumps(tr))}::jsonb);", role="service_role")
    tid, num = out.split("|")
    return tid, int(num)


def submit_err(tr, a=None, b=None):
    return psql("select 1 from public.submit_league_trade("
                f"'{LEAGUE_ID}', '{a or TEAM_A}', '{b or TEAM_B}', 'Tester', null, {q(json.dumps(tr))}::jsonb);",
                role="service_role", expect_error=True)


def pick_id(year, rnd, original):
    return psql(f"select id from draft_picks where league_id = '{LEAGUE_ID}' and draft_year = {year} and round = {rnd} and original_team_id = '{original}';")


def owner(pid):
    return psql(f"select t.abbreviation from draft_picks p join league_teams t on t.id = p.owner_team_id where p.id = '{pid}';")


def review_err(tid, action, reason=None, tr=None):
    return psql("select 1 from public.review_league_trade("
                f"'{LEAGUE_ID}', '{tid}', {q(action)}, 'Commish', "
                f"{q(reason) if reason else 'null'}, {q(json.dumps(tr)) + '::jsonb' if tr else 'null'});",
                role="service_role", expect_error=True)


def pk(label, timing, pid=None, i=2):
    a = asset(id=i, type="Draft Pick", pick=label, timing=timing)
    if pid:
        a["pick_id"] = pid
    return a


PLAYER = asset(name="Some Player", pos="WR", ovr="80")

# ---------------------------------------------------------------- before setup
check("league_lookup: no draft year before setup",
      psql(f"select coalesce(current_draft_year::text, 'none') from league_lookup('{LEAGUE}');", role="anon") == "none")
T0_ID, T0 = submit_teams(trade([PLAYER], [pk("Mid 2nd", "Next year")]), TEAM_A, TEAM_B)
check("tracking off: a pick without a choice is accepted", T0 > 0)
check("tracking off: no pick choices", psql(f"select count(*) from league_pick_choices('{LEAGUE}', '{TEAM_A}', '{TEAM_B}');", role="anon") == "0")

# ---------------------------------------------------------------- setup
rows = psql(f"select string_agg(draft_year || ':' || picks, ',') from owner_setup_draft_picks('{LEAGUE}', 2028);")
check("setup: 3 draft years x 32 teams x 7 rounds", rows == "2028:224,2029:224,2030:224", rows)
failed, err = psql(f"select * from owner_setup_draft_picks('{LEAGUE}', 2028);", expect_error=True)
check("setup twice is refused", failed and "already set up" in err, err)
check("league_lookup shows the draft year", psql(f"select current_draft_year from league_lookup('{LEAGUE}');", role="anon") == "2028")
check("pick choices: both teams' picks (2 x 21)",
      psql(f"select count(*) || ',' || min(current_draft_year) from league_pick_choices('{LEAGUE}', '{TEAM_A}', '{TEAM_B}');", role="anon") == "42,2028")
check("pick_round / pick_year_offset",
      psql("select string_agg(coalesce(pick_round(x)::text, '-'), ',') from unnest(array['1.05','Future Mid 1st','Early 2nd','Late 3rd','4th','7th','8th']) x;") == "1,1,2,3,4,7,-"
      and psql("select string_agg(coalesce(pick_year_offset(x)::text, '-'), ',') from unnest(array['Current draft','Next year','Two years away','Soon']) x;") == "0,1,2,-")

# ---------------------------------------------------------------- submit
B29R2 = pick_id(2029, 2, TEAM_B)
B29R3 = pick_id(2029, 3, TEAM_B)
A28R1 = pick_id(2028, 1, TEAM_A)
trades_before = psql("select count(*) from trades;")
failed, err = submit_err(trade([PLAYER], [pk("Mid 2nd", "Next year")]))
check("tracking on: a pick needs a choice", failed and "Choose whose" in err, err)
check("refused trade leaves nothing behind", psql("select count(*) from trades;") == trades_before and psql("select count(*) from pick_moves;") == "0")
failed, err = submit_err(trade([pk("Mid 3rd", "Next year", B29R2)], [PLAYER]))
check("round must match the label", failed and "doesn't match" in err, err)
failed, err = submit_err(trade([pk("Mid 2nd", "Current draft", B29R2)], [PLAYER]))
check("year must match the timing", failed and "doesn't match" in err, err)
failed, err = submit_err(trade([pk("Mid 2nd", "Next year", B29R2), pk("Mid 2nd", "Next year", B29R2, 3)], [PLAYER]))
check("same pick twice refused", failed and "twice" in err, err)
failed, err = submit_err(trade([PLAYER], [pk("Mid 2nd", "Next year", B29R2)]))
check("giving team must own the pick", failed and "belongs to" in err, err)
failed, err = submit_err(trade([pk("Mid 2nd", "Next year", "00000000-0000-0000-0000-000000000000")], [PLAYER]))
check("unknown pick refused", failed and "isn't in this league" in err, err)

# T1: A receives B's 2029 2nd; B receives A's 2028 1st (slot label).
T1_ID, T1 = submit_teams(trade([pk("Mid 2nd", "Next year", B29R2)], [pk("1.12", "Current draft", A28R1)]), TEAM_A, TEAM_B)
check("submit moves picks both ways", owner(B29R2) == ABBR[TEAM_A] and owner(A28R1) == ABBR[TEAM_B])
check("moves recorded with the trade", psql(f"select count(*) from pick_moves where trade_id = '{T1_ID}' and reason = 'TRADE';") == "2")
check("trade assets keep the pick", psql(f"select count(pick_id) from trade_assets where trade_id = '{T1_ID}';") == "2")
check("a trade without picks is unaffected", submit_teams(trade([PLAYER], [asset(id=2, name="Other", pos="QB", ovr="70")]), TEAM_A, TEAM_B)[1] > T1)
check("choices: A now owns B's 2029 2nd",
      psql(f"select count(*) from league_pick_choices('{LEAGUE}', '{TEAM_A}', '{TEAM_C}') where pick_id = '{B29R2}' and owner_team_id = '{TEAM_A}';", role="anon") == "1")

# ---------------------------------------------------------------- correction
ch = psql(f"select owner_team_id || ',' || in_this_trade from league_pick_choices('{LEAGUE}', '{TEAM_A}', '{TEAM_B}', '{T1_ID}') where pick_id = '{B29R2}';", role="anon")
check("correction choices show the trade's pick with the team that gave it", ch == f"{TEAM_B},true", ch)
psql("select 1 from public.review_league_trade("
     f"'{LEAGUE_ID}', '{T1_ID}', 'CORRECT', 'Commish', 'wrong round', "
     f"{q(json.dumps(trade([pk('Mid 3rd', 'Next year', B29R3)], [pk('1.12', 'Current draft', A28R1)])))}::jsonb);", role="service_role")
check("correction: the old pick goes back, the new one moves",
      owner(B29R2) == ABBR[TEAM_B] and owner(B29R3) == ABBR[TEAM_A] and owner(A28R1) == ABBR[TEAM_B])
check("correction: old moves marked undone",
      psql(f"select count(*) from pick_moves where trade_id = '{T1_ID}' and revision = 0 and undone_at is not null;") == "2")
failed, err = review_err(T1_ID, "CORRECT", "bad", trade([PLAYER], [pk("Mid 2nd", "Next year", B29R2)]))
check("a refused correction changes nothing", failed and owner(B29R3) == ABBR[TEAM_A] and owner(A28R1) == ABBR[TEAM_B] and
      psql(f"select current_revision from trades where id = '{T1_ID}';") == "1", err)

# ---------------------------------------------------------------- reverse with a later move
T2_ID, T2 = submit_teams(trade([PLAYER], [pk("Late 3rd", "Next year", B29R3)]), TEAM_A, TEAM_C)
check("A passes the acquired pick on to C", owner(B29R3) == ABBR[TEAM_C])
failed, err = review_err(T1_ID, "REVERSE", "oops")
check("reversal refused while the pick has moved again", failed and f"trade #{T2}" in err, err)
check("refused reversal leaves the trade active", psql(f"select review_status from trades where id = '{T1_ID}';") == "REVIEWED")
psql(f"select 1 from public.review_league_trade('{LEAGUE_ID}', '{T2_ID}', 'REVERSE', 'Commish', 'undo', null);", role="service_role")
psql(f"select 1 from public.review_league_trade('{LEAGUE_ID}', '{T1_ID}', 'REVERSE', 'Commish', 'undo', null);", role="service_role")
check("reversing both puts every pick back", owner(B29R3) == ABBR[TEAM_B] and owner(A28R1) == ABBR[TEAM_A])

# ---------------------------------------------------------------- commissioner picks
rows = psql(f"select count(*) || ',' || min(current_draft_year) || ',' || bool_or(rollover_due) from commissioner_draft_picks('{LEAGUE_ID}');", role="service_role")
check("commissioner pick list: all active picks", rows == "672,2028,false", rows)
out = psql(f"select owner_abbreviation || ',' || changed from commissioner_set_pick_owner('{LEAGUE_ID}', '{B29R2}', '{TEAM_C}', 'Commish');", role="service_role")
check("commissioner moves a pick", out == f"{ABBR[TEAM_C]},true" and owner(B29R2) == ABBR[TEAM_C], out)
check("same owner again: nothing changes",
      psql(f"select changed from commissioner_set_pick_owner('{LEAGUE_ID}', '{B29R2}', '{TEAM_C}', 'Commish');", role="service_role") == "f")
check("pick move audited", psql(f"select details ->> 'pick' from audit_events where action = 'PICK_OWNERSHIP_CHANGED' and actor_role = 'COMMISSIONER';") == f"2029 2nd ({ABBR[TEAM_B]})")
failed, err = psql(f"select * from commissioner_set_pick_owner('{LEAGUE_ID}', '{B29R2}', gen_random_uuid(), 'Commish');", role="service_role", expect_error=True)
check("unknown team refused", failed and "P0002" in err, err)

# ---------------------------------------------------------------- owner commands
out = psql(f"select concat_ws(',', pick, owner_team, changed) from owner_set_pick_owner('{LEAGUE}', 2029, 2, '{ABBR[TEAM_B]}', '{ABBR[TEAM_A]}');")
check("owner sets a pick's owner", out == f"2029 2nd ({ABBR[TEAM_B]}),{ABBR[TEAM_A]},t", out)
check("owner list: moved picks only", psql(f"select count(*) from owner_draft_picks('{LEAGUE}');") == "1")
check("owner list: one year", psql(f"select count(*) from owner_draft_picks('{LEAGUE}', 2030);") == "224")
psql(f"select * from owner_set_pick_owner('{LEAGUE}', 2029, 2, '{ABBR[TEAM_B]}', '{ABBR[TEAM_B]}');")

# Replay: T0 was logged before setup (A receives a player, B receives "Mid 2nd, Next year" from A).
rows = psql(f"select concat_ws('|', trade_number, asset, result) from owner_replay_pick_trades('{LEAGUE}');").splitlines()
check("replay moves the pick of a trade logged before tracking",
      rows == [f"{T0}|O1|MOVED 2029 2nd ({ABBR[TEAM_A]}): {ABBR[TEAM_A]} -> {ABBR[TEAM_B]}"], rows)
check("replay is safe to run again", psql(f"select count(*) from owner_replay_pick_trades('{LEAGUE}');") == "0")
check("a replayed trade's reversal moves the pick back",
      psql(f"select 1 from public.review_league_trade('{LEAGUE_ID}', '{T0_ID}', 'REVERSE', 'Commish', 'undo', null);", role="service_role") == "1"
      and owner(pick_id(2029, 2, TEAM_A)) == ABBR[TEAM_A])
psql(f"update leagues set current_draft_year = null where id = '{LEAGUE_ID}';")
_, T9 = submit_teams(trade([pk("5th", "Two years away")], [PLAYER]), TEAM_C, TEAM_B)
psql(f"select * from owner_set_pick_owner('{LEAGUE}', 2030, 5, '{ABBR[TEAM_B]}', '{ABBR[TEAM_A]}');") if False else None
psql(f"update leagues set current_draft_year = 2028 where id = '{LEAGUE_ID}';")
psql(f"update draft_picks set owner_team_id = '{TEAM_A}' where id = '{pick_id(2030, 5, TEAM_B)}';")
rows = psql(f"select result from owner_replay_pick_trades('{LEAGUE}');").splitlines()
check("replay skips what it can't resolve, with the reason", len(rows) == 1 and rows[0].startswith(f"SKIPPED: {ABBR[TEAM_B]} owns no 2030 round 5"), rows)
psql(f"update draft_picks set owner_team_id = '{TEAM_B}' where id = '{pick_id(2030, 5, TEAM_B)}';")

# ---------------------------------------------------------------- snapshots
new_burst()
record("standings", STANDINGS)
SNAP = psql(f"select id from import_snapshots where league_id = '{LEAGUE_ID}' order by first_received_at desc limit 1;")
rows = psql(f"select count(*) || ',' || bool_or(is_current) from commissioner_snapshots('{LEAGUE_ID}');", role="service_role")
check("snapshot list (none current yet)", rows == "2,false", rows)
failed, err = psql(f"select * from commissioner_mark_snapshot_current('{LEAGUE_ID}', '{SNAP}', 'Commish');", role="service_role", expect_error=True)
check("an export still arriving can't be marked current", failed and "still arriving" in err, err)
psql(f"update import_snapshots set last_received_at = now() - interval '11 minutes' where id = '{SNAP}';")
out = psql(f"select concat_ws(',', season, week, changed) from commissioner_mark_snapshot_current('{LEAGUE_ID}', '{SNAP}', 'Commish');", role="service_role")
check("mark current", out == "2027,5,t", out)
check("mark current again: no change", psql(f"select changed from commissioner_mark_snapshot_current('{LEAGUE_ID}', '{SNAP}', 'Commish');", role="service_role") == "f")
check("snapshot list shows the current one", psql(f"select count(*) from commissioner_snapshots('{LEAGUE_ID}') where is_current;", role="service_role") == "1")
check("mark current audited", psql("select details ->> 'season' from audit_events where action = 'SNAPSHOT_MARKED_CURRENT';") == "2027")
failed, err = psql(f"select * from commissioner_mark_snapshot_current('{LEAGUE_ID}', gen_random_uuid(), 'Commish');", role="service_role", expect_error=True)
check("unknown export refused", failed and "P0002" in err, err)

# ---------------------------------------------------------------- draft rollover
check("rollover not due (season 2027, draft 2028)", psql(f"select draft_rollover_due('{LEAGUE_ID}');") == "f")
psql(f"update import_snapshots set season = 2028 where id = '{SNAP}';")
check("rollover due once the current export shows season 2028", psql(f"select draft_rollover_due('{LEAGUE_ID}');") == "t")
failed, err = psql(f"select * from commissioner_draft_complete('{LEAGUE_ID}', 2027, 'Commish');", role="service_role", expect_error=True)
check("draft complete with the wrong year refused (double click)", failed and "already 2028" in err, err)
out = psql(f"select concat_ws(',', current_draft_year, picks_retired, picks_created) from commissioner_draft_complete('{LEAGUE_ID}', 2028, 'Commish');", role="service_role")
check("draft complete: 2028 used, 2029 current, 2031 created", out == "2029,224,224", out)
check("only three active years remain",
      psql(f"select string_agg(distinct draft_year::text, ',') from draft_picks where league_id = '{LEAGUE_ID}' and status = 'ACTIVE';") == "2029,2030,2031")
check("used picks can't be traded",
      submit_err(trade([pk("1.05", "Current draft", pick_id(2028, 1, TEAM_B))], [PLAYER]))[0])
B29R1 = pick_id(2029, 1, TEAM_B)
_, T3 = submit_teams(trade([pk("1.20", "Current draft", B29R1)], [PLAYER]), TEAM_A, TEAM_B)
check("after rollover 'Current draft' means 2029", owner(B29R1) == ABBR[TEAM_A])
check("rollover audited", psql("select details ->> 'new_current_draft_year' from audit_events where action = 'DRAFT_COMPLETED';") == "2029")

# ---------------------------------------------------------------- access
for sql in [f"select * from commissioner_draft_picks('{LEAGUE_ID}')", f"select * from commissioner_snapshots('{LEAGUE_ID}')",
            "select count(*) from draft_picks", "select count(*) from pick_moves"]:
    failed, err = psql(sql + ";", role="anon", expect_error=True)
    check(f"anon refused: {sql[:40]}", failed and "42501" in err, err)
for fn in [f"owner_setup_draft_picks('{LEAGUE}', 2028)", f"owner_draft_picks('{LEAGUE}')",
           f"owner_set_pick_owner('{LEAGUE}', 2029, 1, 'X', 'Y')", f"owner_replay_pick_trades('{LEAGUE}')"]:
    failed, err = psql(f"select * from {fn};", role="service_role", expect_error=True)
    check(f"service role can't run {fn.split('(')[0]}", failed and "42501" in err, err)

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
