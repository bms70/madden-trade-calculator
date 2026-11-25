#!/usr/bin/env python3
"""Import history (backend only): database tests.

Runs against a SCRATCH Postgres 15+ server, never the live Supabase project.
Applies every migration, connects a test league, replays the 2026-11-21
capture through record_snallabot_payload, and checks player_history,
team_history, the *_latest views, failure handling, backfill and access.

Usage (from the repo root):
    PGHOST=/tmp PGPORT=5544 PGUSER=postgres python3 tests/import-history-db.test.py

Expected last line: N / N PASS
"""

import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURE = os.path.join(ROOT, "docs", "roadmap", "v5", "capture-2026-11-21")
DB = "import_history_test"
LEAGUE = "Test League"

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
        raise RuntimeError(f"SQL failed:\n{proc.stderr}\n--- SQL ---\n{sql[:600]}")
    return proc.stdout.strip()


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def record(route, body_text, expect_error=False):
    tag = "$snb$"
    assert tag not in body_text
    sql = (
        "select snapshot_id || '|' || is_duplicate from public.record_snallabot_payload("
        f"'{sha(SECRET)}', 'pc', 5481323, '{route}', {tag}{body_text}{tag}::jsonb, "
        f"'{sha(body_text)}', {len(body_text.encode('utf-8'))});"
    )
    return psql(sql, role="service_role", expect_error=expect_error)


def new_burst():
    psql("update import_snapshots set last_received_at = now() - interval '11 minutes' where status = 'RECEIVING';")


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
check("all migrations apply, including import history", "20261124020000_import_history.sql" in migrations)

with open(os.path.join(ROOT, "docs", "roadmap", "v5", "sql", "connect-snallabot.sql"), encoding="utf-8") as f:
    connect = f.read().replace("extensions.", "").replace("<LEAGUE NAME>", LEAGUE)
LEAGUE_ID, SECRET = psql(connect).split("|")

# ---------------------------------------------------------------- replay the capture
leagueteams = read("leagueteams.json")
standings = read("standings.json")
roster = read("team-roster-excerpt.json")
small = json.dumps({"message": "", "success": True})
routes = [l.strip().split("/<secret>/pc/5481323/")[1] for l in read("request-paths.txt").splitlines() if l.strip()]
for r in routes:
    body = {"leagueteams": leagueteams, "standings": standings}.get(r)
    if body is None:
        body = roster if (r.startswith("team/") and r.endswith("/roster")) else small
    out = record(r, body)
SNAP = out.split("|")[0]

check("29 roster payloads built (DONE)",
      psql(f"select count(*) from import_payloads where snapshot_id = '{SNAP}' and route like 'team/%/roster' and history_status = 'DONE';") == "29")
check("standings payload built (DONE)",
      psql(f"select history_status from import_payloads where snapshot_id = '{SNAP}' and route = 'standings';") == "DONE")
check("other routes untouched (no history status)",
      psql(f"select count(*) from import_payloads where snapshot_id = '{SNAP}' and route !~ '^(team/[0-9]+/roster|standings)$' and history_status is not null;") == "0")
check("player rows: 29 payloads x 8 players", psql(f"select count(*) from player_history where snapshot_id = '{SNAP}';") == "232")
check("team rows: 32 teams", psql(f"select count(*) from team_history where snapshot_id = '{SNAP}';") == "32")

qb = psql("""select concat_ws(',', team_id, position, v44_position, ovr, age, dev_trait, years_pro, cap_hit, cap_hit_m,
             contract_years_left, injury_rating, experience_points, contract_salary, contract_length, speed is not null,
             season, stage_index, week)
             from player_history_view where roster_id = 555222703 limit 1;""")
check("QB fields mapped (team, position, OVR, age, dev, pro, cap, years, injury, XP, salary, length, ratings, week)",
      qb == "776994846,QB,QB,94,25,3,3,2000,20.00,4,92,2875,50000000,5,t,2027,1,5", qb)
check("positions mapped: LT->OT, LEDG/REDG->EDGE, MIKE->LB, RG->IOL, LS none",
      psql("select string_agg(position || '>' || coalesce(v44_position, '-'), ' ' order by position) from (select distinct position, v44_position from player_history_view) x;")
      == "LEDG>EDGE LS>- LT>OT MIKE>LB QB>QB REDG>EDGE RG>IOL WR>WR")
check("contract_years_left 0 reads as blank for v4.4",
      psql("select coalesce(v44_years_left::text, 'blank') from player_history_view where roster_id = 555221114 limit 1;") == "blank")
check("practice squad flag kept", psql("select bool_and(is_on_practice_squad) from player_history where roster_id = 555221114;") == "t")
check("v44_position covers every v4.4 label",
      psql("select string_agg(coalesce(v44_position(x), '-'), ',') from unnest(array['RT','LG','C','WILL','SAM','FS','SS','HB','FB','TE','DT','CB','K','P','ls','XYZ']) x;")
      == "OT,IOL,IOL,LB,LB,S,S,HB,FB,TE,DT,CB,K,P,-,-")

ravens = psql("""select concat_ws(',', team_name, season, stage_index, week, wins, losses, ties, rank, seed, streak_raw, streak, cap_spent)
                 from team_history where team_id = 776994844;""")
check("standings mapped (Ravens: 2027 week 5, 2-2, rank 19, seed 10, streak 255 -> -1)",
      ravens == "Ravens,2027,1,5,2,2,0,19,10,255,-1,207560000", ravens)
check("streak decoding: 0, 3, 127, 252, 255",
      psql("select string_agg(decode_streak(x)::text, ',') from unnest(array[0,3,127,252,255]) x;") == "0,3,127,-4,-1")

# ---------------------------------------------------------------- duplicates and failures
before = psql("select count(*) from player_history;")
record("team/776994846/roster", roster)
check("same body again: no new history rows", psql("select count(*) from player_history;") == before)

bad = json.dumps({"rosterInfoList": {"oops": 1}, "success": True})
out = record("team/776994848/roster", bad)
check("bad roster payload: receiver still answers", out.split("|")[1] == "false", out)
check("bad roster payload: stored", psql(f"select count(*) from import_payloads where route = 'team/776994848/roster' and body is not null;") == "1")
st = psql("select history_status || '|' || history_error from import_payloads where route = 'team/776994848/roster';")
check("bad roster payload: marked FAILED with the reason", st.startswith("FAILED|") and "rosterInfoList" in st, st)
check("bad roster payload: snapshot diagnostics still updated",
      psql(f"select diagnostics ->> 'rosters_received' from import_snapshots where id = '{SNAP}';") == "30")
bad2 = json.dumps({"rosterInfoList": [{"rosterId": 1, "firstName": "X", "playerBestOvr": "ninety"}, {"rosterId": "nope"}, 5]})
record("team/776994849/roster", bad2)
check("odd values become blanks, rows without rosterId skipped",
      psql("select count(*) || ',' || coalesce(max(ovr)::text, 'null') from player_history p join import_payloads x on x.id = p.payload_id where x.route = 'team/776994849/roster';") == "1,null")

# ---------------------------------------------------------------- same week, second export: keep both, use latest
new_burst()
roster2 = json.loads(roster)
roster2["rosterInfoList"][0]["playerBestOvr"] = 95
roster2 = json.dumps(roster2)
SNAP2 = record("team/776994846/roster", roster2).split("|")[0]
record("standings", standings)
check("second export of the same week is a new snapshot", SNAP2 != SNAP)
check("both exports kept in player_history", psql("select count(distinct snapshot_id) from player_history where roster_id = 555222703;") == "2")
check("latest view: newest export wins (OVR 95)",
      psql("select ovr from player_history_latest where roster_id = 555222703 and team_id = 776994846;") == "95")
check("latest view: one row per player per week",
      psql("select count(*) from player_history_latest where roster_id = 555222703;") == "1")
check("team latest view: one row per team per week", psql("select count(*) from team_history_latest;") == "32")

# ---------------------------------------------------------------- backfill
psql(f"delete from player_history where snapshot_id = '{SNAP}'; delete from team_history where snapshot_id = '{SNAP}';"
     f"update import_payloads set history_status = null, history_built_at = null where snapshot_id = '{SNAP}' and history_status = 'DONE';")
bf = psql(f"select concat_ws(',', payloads_built, payloads_failed, players, teams, skipped_trimmed) from owner_build_import_history('{LEAGUE}');")
# 30 roster payloads (29 + the odd one) + 1 standings rebuilt; the bad one fails again.
check("backfill rebuilds stored payloads; the bad one stays FAILED", bf.startswith("31,1,"), bf)
check("backfill restores player rows", psql(f"select count(*) from player_history where snapshot_id = '{SNAP}';") == "233")
check("backfill is safe to run again (nothing new)",
      psql(f"select payloads_built || ',' || payloads_failed from owner_build_import_history('{LEAGUE}');") == "0,1")

rows = psql(f"select concat_ws(',', season, week, roster_payloads, players, teams, failed, not_built) from owner_import_history('{LEAGUE}');").splitlines()
check("owner check: one row per export, newest first", rows == ["2027,5,1,8,32,0,0", "2027,5,31,233,32,1,0"], rows)
check("owner check: league name ignores case/spacing",
      psql("select count(*) from owner_import_history('  test   LEAGUE ');") == "2")
failed, err = psql("select * from owner_import_history('Nope');", expect_error=True)
check("owner check: unknown league rejected", failed and "P0002" in err, err)

# ---------------------------------------------------------------- retention keeps history
psql(f"update leagues set import_keep_full_snapshots = 1 where id = '{LEAGUE_ID}';")
new_burst()
record("leagueteams", leagueteams)
check("retention trimmed the first export's bodies",
      psql(f"select count(body) from import_payloads where snapshot_id = '{SNAP}';") == "0")
check("history rows survive the trim", psql(f"select count(*) from player_history where snapshot_id = '{SNAP}';") == "233")
failed, err = psql(f"select build_payload_history((select id from import_payloads where snapshot_id = '{SNAP}' and route = 'standings'));", expect_error=True)
check("rebuilding a trimmed payload is refused", failed and "trimmed" in err, err)
check("backfill reports trimmed payloads it can't build",
      psql(f"select skipped_trimmed from owner_build_import_history('{LEAGUE}');") == "1")

# ---------------------------------------------------------------- access
for t in ["player_history", "team_history", "player_history_view", "player_history_latest", "team_history_latest"]:
    failed, err = psql(f"select count(*) from public.{t};", role="anon", expect_error=True)
    check(f"anon can't read {t}", failed and "42501" in err, err)
check("service role can read history", int(psql("select count(*) from public.player_history_latest;", role="service_role")) > 0)
failed, err = psql("select build_payload_history(gen_random_uuid());", role="anon", expect_error=True)
check("anon can't build history", failed and "42501" in err, err)
for fn in [f"owner_build_import_history('{LEAGUE}')", f"owner_import_history('{LEAGUE}')"]:
    failed, err = psql(f"select * from {fn};", role="service_role", expect_error=True)
    check(f"service role (Edge Functions) can't run {fn.split('(')[0]}", failed and "42501" in err, err)

passed = sum(results)
print(f"\n{passed} / {len(results)} PASS")
sys.exit(0 if passed == len(results) else 1)
