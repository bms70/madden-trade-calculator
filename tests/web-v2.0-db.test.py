#!/usr/bin/env python3
"""Web v2.0 (league mode): database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Creates a fresh database, applies supabase/migrations/*.sql in order, creates a
test league with the site-owner connect script, sets a commissioner password,
seeds the 32 teams from the main-league capture (league teams only, gamertags
already removed), then exercises every league-mode database function. Finally
applies the staged release-step-5 migration and checks its effect.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/web-v2.0-db.test.py

Expected last line: N / N PASS
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "web_v2_test"
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


def j(obj):
    return q(json.dumps(obj)) + "::jsonb"


def asset(**kw):
    base = {"id": 1, "type": "Player", "name": "", "pick": "1.01", "timing": "Current draft",
            "ovr": "", "age": "", "pos": "", "dev": "Normal", "cap": "", "years": "",
            "league": "", "current": "Starter", "projected": "Starter", "value": 0}
    base.update(kw)
    return base


def trade(verdict="FAIR", user_adj=80.0, cpu_adj=80.0, user_assets=None, cpu_assets=None, release="v2.0"):
    return {
        "web_release": release, "ruleset_version": "v4.4",
        "user_team_assets": user_assets or [asset(id=1, type="Draft Pick", pick="1.16", timing="Current draft", value=80.0)],
        "cpu_team_assets": cpu_assets or [asset(id=2, ovr="84", age="25", pos="WR", dev="Star", cap="3.5",
                                                years="3", league="3", value=80.0)],
        "user_raw_value": user_adj, "cpu_raw_value": cpu_adj,
        "user_adjusted_value": user_adj, "cpu_adjusted_value": cpu_adj,
        "adjusted_gap": abs(user_adj - cpu_adj) / max(user_adj, cpu_adj),
        "verdict": verdict, "evaluation_mode": "DIRECTIONAL", "protection_tier": None,
        "required_target": None, "fair_maximum": None,
        "trade_intelligence": [], "suggested_correction": None,
    }


def submit(league, st, ot, name, note, tr, expect_error=False):
    sql = (f"select trade_id || '|' || trade_number from public.submit_league_trade("
           f"{league}, {st}, {ot}, {q(name) if name is not None else 'null'}, "
           f"{q(note) if note is not None else 'null'}, {j(tr)});")
    return psql(sql, role="service_role", expect_error=expect_error)


def review(league, trade_id, action, name="Commish", reason=None, tr=None, expect_error=False):
    sql = (f"select review_status || '|' || current_revision from public.review_league_trade("
           f"{league}, '{trade_id}', {q(action)}, {q(name)}, "
           f"{q(reason) if reason is not None else 'null'}, {j(tr) if tr is not None else 'null'});")
    return psql(sql, role="service_role", expect_error=expect_error)


def login(name, password):
    return psql(f"select status || '|' || coalesce(league_id::text, '') || '|' || coalesce(retry_after_seconds::text, '') "
                f"from public.commissioner_login({q(name)}, {q(password)});", role="service_role")


# ---------------------------------------------------------------- setup
psql(f"drop database if exists {DB};", db="postgres")
psql(f"create database {DB};", db="postgres")
psql("""
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;""", db="postgres")

migrations = sorted(os.listdir(os.path.join(ROOT, "supabase", "migrations")))
for m in migrations:
    with open(os.path.join(ROOT, "supabase", "migrations", m), encoding="utf-8") as f:
        psql(f.read())
check("all migrations apply in order", "20261122160000_league_mode.sql" in migrations)

# v1.5.0 behaviour: accept-trade's plain insert and the v1.4.0 Admin delete
legacy = trade(release="v1.5.0")
cols = ["web_release", "ruleset_version", "user_team_assets", "cpu_team_assets", "user_raw_value", "cpu_raw_value",
        "user_adjusted_value", "cpu_adjusted_value", "adjusted_gap", "verdict", "evaluation_mode", "protection_tier",
        "required_target", "fair_maximum", "trade_intelligence", "suggested_correction"]
vals = []
for c in cols:
    v = legacy[c]
    vals.append("null" if v is None else (j(v) if isinstance(v, (list, dict)) else (str(v) if isinstance(v, (int, float)) else q(v))))
legacy_id = psql(f"insert into trades ({', '.join(cols)}) values ({', '.join(vals)}) returning id;", role="service_role")
check("v1.5.0 accept-trade insert still works (no league)", len(legacy_id) == 36)
psql(f"insert into trades ({', '.join(cols)}) values ({', '.join(vals)});", role="service_role")
deleted = psql("select count(*) from delete_trade_with_audit((select id from trades order by trade_number desc limit 1), 'Admin', 'test');", role="service_role")
check("v1.4.0 Admin delete still works and audits TRADE_DELETED",
      deleted == "1" and psql("select count(*) from audit_events where action = 'TRADE_DELETED';") == "1")

# League via the connect script (pgcrypto prefix dropped for plain Postgres), password, teams
with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    connect = f.read().replace("extensions.", "")
league_id = psql(connect.replace("<LEAGUE NAME>", "Test League")).split("|")[0]
L = f"'{league_id}'"
psql(f"update leagues set commissioner_password_hash = crypt('correct horse', gen_salt('bf', 6)) where id = {L};")
other_id = psql(connect.replace("<LEAGUE NAME>", "Other League")).split("|")[0]
O = f"'{other_id}'"
psql(f"update leagues set commissioner_password_hash = crypt('other pw', gen_salt('bf', 6)) where id = {O};")

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21", "leagueteams.json"), encoding="utf-8") as f:
    teams = json.load(f)["leagueTeamInfoList"]
rows = ", ".join(
    f"({L}, {t['teamId']}, {q(t['abbrName'])}, {q(t['cityName'])}, {q(t['displayName'])}, {q(t['divName'])}, "
    f"{q('USER' if t['userName'] else 'CPU')})" for t in teams)
psql(f"insert into league_teams (league_id, external_team_id, abbreviation, city_name, nickname, division, controlled_by) values {rows};")
psql(f"insert into league_teams (league_id, abbreviation, city_name, nickname) values ({O}, 'NYG', 'New York', 'Giants'), ({O}, 'DAL', 'Dallas', 'Cowboys');")


def team(abbr, league=L):
    return "'" + psql(f"select id from league_teams where league_id = {league} and abbreviation = '{abbr}';") + "'"


OMH, AZ, SEA = team("OMH"), team("AZ"), team("SEA")
NYG, DAL = team("NYG", O), team("DAL", O)

# ---------------------------------------------------------------- read functions (browser)
check("anon: league_lookup ignores case and spacing", psql("select count(*) from league_lookup('  test   LEAGUE ');", role="anon") == "1")
check("anon: unknown league returns nothing", psql("select count(*) from league_lookup('nope');", role="anon") == "0")
check("anon: team list has 32 teams incl. OMH and AZ",
      psql("select count(*) || ',' || count(*) filter (where abbreviation in ('OMH','AZ')) from league_team_list('test league');", role="anon") == "32,2")
check("anon: 6 human teams", psql("select count(*) from league_team_list('test league') where controlled_by = 'USER';", role="anon") == "6")

# ---------------------------------------------------------------- submit
odd_assets = [asset(id=3, ovr="84.5", age="17", pos="QB", cap="abc", years="0", league="41", value=12.5),
              asset(id=4, type="Draft Pick", pick="Future Early 1st", timing="Next year", ovr="99", value=40.0)]
out = submit(L, OMH, AZ, " Brandon ", "First test", trade(cpu_assets=odd_assets))
t1, n1 = out.split("|")
check("submit returns a trade id and number", len(t1) == 36 and int(n1) > 0)
check("new trade is UNREVIEWED with league, teams, submitter",
      psql(f"select review_status || ',' || (league_id = {L}) || ',' || submitter_name || ',' || current_revision from trades where id = '{t1}';") == "UNREVIEWED,true,Brandon,0")
check("revision 0 stored by MEMBER", psql(f"select created_by_role || ',' || created_by_name from trade_revisions where trade_id = '{t1}' and revision = 0;") == "MEMBER,Brandon")
check("3 asset rows (1 + 2)", psql(f"select count(*) from trade_assets where trade_id = '{t1}';") == "3")
check("odd values stored as null, not rejected",
      psql(f"select coalesce(ovr::text,'-') || ',' || coalesce(age::text,'-') || ',' || coalesce(cap_hit_m::text,'-') || ',' || coalesce(years_remaining::text,'-') || ',' || coalesce(years_in_league::text,'-') "
           f"from trade_assets where trade_id = '{t1}' and side = 'OTHER' and position_in_side = 1;") == "-,-,-,-,-")
check("pick asset keeps pick and timing, no player fields",
      psql(f"select pick || ',' || timing || ',' || coalesce(ovr::text,'-') from trade_assets where trade_id = '{t1}' and side = 'OTHER' and position_in_side = 2;") == "Future Early 1st,Next year,-")

out2 = submit(L, SEA, OMH, "Domo", None, trade(verdict="UNFAIR", user_adj=60.0, cpu_adj=90.0))
t2 = out2.split("|")[0]
check("second trade parses a normal player (84, 25, 3.50, 3)",
      psql(f"select ovr || ',' || age || ',' || cap_hit_m || ',' || years_remaining from trade_assets where trade_id = '{t2}' and side = 'OTHER';") == "84,25,3.50,3")
submit(O, NYG, DAL, "Someone", None, trade())

for name, args in [
    ("same team twice", (L, OMH, OMH, "X", None)),
    ("team from another league", (L, OMH, NYG, "X", None)),
    ("blank name", (L, OMH, AZ, "   ", None)),
    ("name over 60 characters", (L, OMH, AZ, "x" * 61, None)),
    ("note over 500 characters", (L, OMH, AZ, "X", "n" * 501)),
]:
    failed, err = submit(*args, trade(), expect_error=True)
    check(f"submit rejects {name} (22023)", failed and "22023" in err, err[-200:])
failed, err = submit("'00000000-0000-0000-0000-000000000000'", OMH, AZ, "X", None, trade(), expect_error=True)
check("submit rejects an unknown league (P0002)", failed and "P0002" in err, err[-200:])

# ---------------------------------------------------------------- history (browser)
hist = psql("select trade_number || '|' || submitting_team || '|' || other_team || '|' || review_status from league_trade_history('Test League');", role="anon").splitlines()
check("history lists this league's 2 trades only", len(hist) == 2, hist)
check("history shows team names (Omaha Bulls vs Arizona Cardinals)", any("Omaha Bulls|Arizona Cardinals|UNREVIEWED" in h for h in hist), hist)
check("history excludes the v1.5.0 no-league trade", psql("select count(*) from league_trade_history('Test League') where web_release = 'v1.5.0';", role="anon") == "0")

# ---------------------------------------------------------------- review actions
check("REVIEW marks Reviewed", review(L, t2, "REVIEW", reason="Looks right") == "REVIEWED|0")
check("REVIEW audited as COMMISSIONER",
      psql(f"select actor_role || ',' || administrator_name || ',' || (league_id = {L}) from audit_events where action = 'TRADE_REVIEWED';") == "COMMISSIONER,Commish,true")

failed, err = review(L, t1, "CORRECT", reason=None, tr=trade(verdict="UNFAIR"), expect_error=True)
check("CORRECT without a reason rejected (22023)", failed and "22023" in err, err[-200:])
failed, err = review(L, t1, "CORRECT", reason="fix", tr=None, expect_error=True)
check("CORRECT without a trade rejected (22023)", failed and "22023" in err, err[-200:])
corrected = trade(verdict="UNFAIR", user_adj=80.0, cpu_adj=70.0,
                  cpu_assets=[asset(id=2, ovr="82", age="25", pos="WR", dev="Star", cap="3.5", years="3", league="3", value=70.0)])
check("CORRECT adds revision 1 and marks Reviewed", review(L, t1, "CORRECT", reason="OVR was 82, not 84", tr=corrected) == "REVIEWED|1")
check("trade row now shows the corrected verdict and values",
      psql(f"select verdict || ',' || cpu_adjusted_value from trades where id = '{t1}';") == "UNFAIR,70")
check("both revisions kept", psql(f"select string_agg(revision || ':' || verdict, ',' order by revision) from trade_revisions where trade_id = '{t1}';") == "0:FAIR,1:UNFAIR")
check("revision 1 assets stored", psql(f"select count(*) from trade_assets where trade_id = '{t1}' and revision = 1;") == "2")
check("anon: revisions view returns both", psql(f"select count(*) from league_trade_revisions('test league', '{t1}');", role="anon") == "2")
check("CORRECT audited with verdict before/after",
      psql("select details ->> 'verdict_before' || '>' || (details ->> 'verdict_after') || ',' || reason from audit_events where action = 'TRADE_CORRECTED';") == "FAIR>UNFAIR,OVR was 82, not 84")

failed, err = review(O, t1, "REVIEW", expect_error=True)
check("another league can't act on this trade (P0002)", failed and "P0002" in err, err[-200:])
failed, err = review(L, t1, "APPROVE", expect_error=True)
check("unknown action rejected (22023)", failed and "22023" in err, err[-200:])
failed, err = review(L, t1, "REVIEW", name="  ", expect_error=True)
check("blank commissioner name rejected (22023)", failed and "22023" in err, err[-200:])

failed, err = review(L, t2, "REVERSE", reason=None, expect_error=True)
check("REVERSE without a reason rejected (22023)", failed and "22023" in err, err[-200:])
check("REVERSE marks Reversed", review(L, t2, "REVERSE", reason="Test trade").startswith("REVERSED|"))
check("reversed trade logically removed with reason",
      psql(f"select (deleted_at is not null) || ',' || reversal_reason from trades where id = '{t2}';") == "true,Test trade")
check("reversed trade gone from history", psql("select count(*) from league_trade_history('test league');", role="anon") == "1")
check("reversed trade's revisions hidden from browser", psql(f"select count(*) from league_trade_revisions('test league', '{t2}');", role="anon") == "0")
failed, err = review(L, t2, "REVIEW", expect_error=True)
check("no actions on a reversed trade (22023)", failed and "22023" in err, err[-200:])
check("reversal audited", psql("select count(*) from audit_events where action = 'TRADE_REVERSED';") == "1")

audit = psql(f"select string_agg(action, ',' order by occurred_at) from league_audit_log({L});", role="service_role")
check("league audit log has this league's events only", audit == "TRADE_REVIEWED,TRADE_CORRECTED,TRADE_REVERSED", audit)

# ---------------------------------------------------------------- commissioner login and lockout
check("correct password: OK with league id", login("TEST league", "correct horse") == f"OK|{league_id}|")
for i in range(5):
    r = login("test league", "wrong")
check("wrong password: BAD", r.startswith("BAD|"))
locked = login("test league", "correct horse")
secs = int(locked.split("|")[2]) if locked.startswith("LOCKED") else -1
check("6th try after 5 wrong is LOCKED, even with the right password", locked.startswith("LOCKED|"), locked)
check("retry-after is within 15 minutes", 0 < secs <= 900, secs)
check("lockout is per league (other league still works)", login("other league", "other pw").startswith("OK|"))
psql(f"update commissioner_login_attempts set attempted_at = attempted_at - interval '16 minutes' where league_id = {L};")
check("after 15 minutes the right password works again", login("test league", "correct horse").startswith("OK|"))
for i in range(4):
    login("test league", "wrong")
check("a success resets the count (4 new failures, not locked)", login("test league", "correct horse").startswith("OK|"))
psql(f"update leagues set commissioner_password_hash = null where id = {O};")
check("league without a password: NOT_SET", login("other league", "x").startswith("NOT_SET|"))
check("unknown league: UNKNOWN", login("nope", "x").startswith("UNKNOWN|"))

# ---------------------------------------------------------------- access
for fn in ["submit_league_trade(null, null, null, 'x', null, '{}'::jsonb)",
           "review_league_trade(null, null, 'REVIEW', 'x')",
           "commissioner_login('test league', 'x')",
           f"league_audit_log({L})"]:
    failed, err = psql(f"select * from public.{fn};", role="anon", expect_error=True)
    check(f"anon can't call {fn.split('(')[0]}", failed and "42501" in err, err[-200:])
for t in ["league_teams", "trade_revisions", "trade_assets", "commissioner_login_attempts"]:
    failed, err = psql(f"select count(*) from public.{t};", role="anon", expect_error=True)
    check(f"anon can't read {t}", failed and "42501" in err, err[-200:])
check("public trades policy still in place until the site merge (anon can read trades)",
      int(psql("select count(*) from public.trades;", role="anon")) >= 1)

# ---------------------------------------------------------------- integrity
failed, err = psql(f"insert into trades (web_release, ruleset_version, user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode, league_id) "
                   f"values ('v2.0','v4.4',1,1,1,1,0,'FAIR','DIRECTIONAL',{L});", expect_error=True)
check("a league trade can't skip teams/status/submitter", failed and "23514" in err, err[-200:])
psql(f"insert into trades (web_release, ruleset_version, user_raw_value, cpu_raw_value, user_adjusted_value, cpu_adjusted_value, adjusted_gap, verdict, evaluation_mode, league_id, is_pre_league, review_status) "
     f"values ('v1.5.0','v4.4',1,1,1,1,0,'FAIR','DIRECTIONAL',{L}, true, 'REVIEWED');")
check("a pre-league trade may have no teams", psql("select count(*) from trades where is_pre_league;") == "1")
check("Snallabot receiver still present after league mode",
      psql("select count(*) from pg_proc where proname = 'record_snallabot_payload';") == "1")

# ---------------------------------------------------------------- staged post-merge migration (release step 5)
with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "web-v2.0-drop-public-trade-read.sql"), encoding="utf-8") as f:
    psql(f.read())
failed, err = psql("select count(*) from public.trades;", role="anon", expect_error=True)
check("after the staged step-5 migration, anon can't read trades directly", failed and "42501" in err, err[-200:])
check("after it, league history still works through the function (corrected + pre-league trade)",
      psql("select count(*) || ',' || count(*) filter (where is_pre_league) from league_trade_history('test league');", role="anon") == "2,1")

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
