# V5_WEB_V2.0_SPEC

Web Release v2.0 (League mode) design spec. Ruleset v5.0 roadmap, Phase 2. Drafted 2026-11-21. **Ruleset stays v4.4.** This is the plan the v2.0 build follows. It turns the decisions in `V5_IDENTITY_AND_ACCESS.md` and `V5_PHASE_PLAN.md` into screens, flows, an API, a snapshot contract, a migration and a release order. The database design comes from `V5_SAMPLE_SCHEMA.sql` (sections 1–3, 6 and 7). **`leagues` already exists** from the Snallabot connection (`V5_SNALLABOT_CONNECTION.md`, migration `20261122060000`), so v2.0 extends it rather than creating it.

Decisions taken on this spec are logged in `V5_OPEN_QUESTIONS.md` (Q25–Q28, all decided 2026-11-21): practice mode stops logging; team editing in v2.1; login throttling; the main league's name is decided and the site owner sets its password. **The league name is deliberately not written in this public repo** (knowing it is the access); scripts take it as a parameter.

## 1. Scope

**In v2.0**

- A **League / Practice switch**. League mode: type the league name, pick your team and the other team, build the trade, submit it.
- League trades are **logged immediately as Unreviewed** and appear in that league's Trade History with their review status.
- A **commissioner area per league**, behind that league's commissioner password: a review queue, plus Mark reviewed / Correct / Reverse, and the league's audit log.
- Existing trade history moves into the main league as **pre-league**.
- The shared Admin password is retired.
- League creation by the **site owner**, through a documented SQL script.

**Not in v2.0**

- Imports, players, standings, calendar, draft picks (Web v3.0+).
- Pre-filled assets (`trade_assets.edited_fields` stays empty).
- Commissioner team editing on screen: human / CPU and owner label (**Decided: v2.1**, Q26; SQL fixes until then).
- Any change to `valuation.js` or the v4.4 verdicts.

## 2. Governed-file rules for this release

- **`valuation.js` stays byte-for-byte at its baseline hash** (`V5_BASELINE_MANIFEST_v4.4.md`).
- `calculator-ui.js` and `accept-trade` change (snapshot contract), so the release PR records new hashes as a manifest addendum and re-runs `node tests/ruleset-v4.4.test.js` (64 / 64).
- **Team names in result text.** `valuation.js` writes "User Team" / "CPU Team" into the suggested-correction and read text. In league mode, `calculator-ui.js` substitutes the chosen team names **for display only**. The stored snapshot keeps the engine's text unchanged, so the frozen evaluation stays exactly what v4.4 produced.

## 3. Screens

### 3.1 Mode switch (header)

- A two-option control in the header: **Practice** | **League**. Default is **Practice**. Choosing League shows the league bar.
- **League bar:** a league-name field and **Enter**. The name is matched case-insensitively with spaces collapsed (`league_lookup`). An unknown name shows "No league with that name." Nothing is created and no other names are revealed.
- Once entered, the bar shows the league name and **Leave league**. The name is remembered in this browser (`localStorage`, wrapped in try/catch) so members don't retype it.

### 3.2 Calculator, league mode

- Above side A: **Your team** picker. Above side B: **Other team** picker. Both come from `league_team_list`, show `City Nickname (ABBR)` and mark Human / CPU. The two can't be the same team.
- Side headings and the result labels show the team names instead of "User Team" / "CPU Team" (display only, see §2).
- Everything else is the v1.5.0 calculator, unchanged: same fields, same validation, same verdict, Fairness Score and Trade Analysis.
- **Accept & Log Trade** becomes **Submit to league** (enabled when both teams are chosen and the trade is complete). The confirm dialog asks for:
  - **Your name** (required, 1–60 characters, free text; there are no accounts).
  - **Note** (optional, up to 500 characters).
  - A summary line: "This trade is logged now as **Unreviewed**. The commissioner reviews it afterwards."
  - If the verdict isn't FAIR: "This trade is rated *UNFAIR*. You can still submit it; it'll be flagged for the commissioner."
- After submit: "Logged as trade #N, Unreviewed." The same duplicate guard as today applies (an identical snapshot can't be logged twice in a row).

### 3.3 Calculator, practice mode

- Exactly the v1.5.0 calculator with no team pickers. **Decided (Q25, 2026-11-21): practice mode doesn't log trades.** The Accept & Log button is replaced by a line: "Practice mode doesn't log trades. Switch to League to submit one."

### 3.4 Trade History

- **League mode:** that league's trades, newest first (`league_trade_history`). Each card shows trade number, date, the two teams, verdict, Fairness Score and a **status badge**: Unreviewed (amber), Reviewed (green), Corrected (green, "corrected"), Pre-league (grey). Reversed trades aren't listed.
- Trade detail shows the current evaluation, the submitter and note, and, for corrected trades, an **Original submission** section with revision 0.
- **Practice mode:** "Enter a league to see its trade history." (No public list of all trades: see §6.)

### 3.5 Commissioner area (replaces Admin)

- Tab label: **Commissioner**. It requires league mode, then the **commissioner password** for that league. Session: 30 minutes, as today.
- **Review queue:** Unreviewed trades, oldest first, with flags: verdict not FAIR, a human-to-human trade, or a duplicate-looking trade (same teams and assets within 24 hours).
- **Trade actions:**
  - **Mark reviewed:** one click, optional comment.
  - **Correct:** opens the trade in the calculator in correction mode, with assets loaded from the current revision. The commissioner edits values, v4.4 re-runs as usual, and **Save correction** asks for a required reason. Both the original and the corrected snapshot are kept, and the trade becomes Reviewed.
  - **Reverse:** a required reason. The trade leaves active history (logical removal), with an audit record. Like today's Delete Trade, nothing is erased.
- **All trades:** the league's full list, including reviewed ones, with the same actions (a reviewed trade can still be corrected or reversed).
- **Audit log:** this league's audit events, newest first, read-only.

## 4. Flows

| Flow | Steps | Result |
|---|---|---|
| Enter league | Type name → `league_lookup` | League bar set; team list loaded |
| Submit trade | Pick teams → build → Submit → name, note → `accept-trade` (v2.0) | `trades` row (UNREVIEWED), revision 0, assets; trade number returned |
| Commissioner sign-in | Commissioner tab → password → `commissioner-login` | Signed session token for this league |
| Mark reviewed | Queue → Mark reviewed → `review-trade` (`REVIEW`) | Status REVIEWED, audit `TRADE_REVIEWED` |
| Correct | Queue → Correct → edit → Save correction + reason → `review-trade` (`CORRECT`) | New revision, trade row shows corrected values, status REVIEWED, audit `TRADE_CORRECTED` |
| Reverse | Queue or All trades → Reverse + reason → `review-trade` (`REVERSE`) | Status REVERSED, `deleted_at` set, audit `TRADE_REVERSED` |
| Create league (site owner) | Run `docs/roadmap/v5/sql/create-league.sql` in the Supabase SQL editor with the name, password and team list | League + 32 teams, audit `LEAGUE_CREATED` |

## 5. API

All writes go through Edge Functions using the service role. Multi-row writes run inside one database function, so they succeed or fail together (as `delete_trade_with_audit` does today).

### 5.1 Read functions (browser, publishable key)

| Function | Input | Output |
|---|---|---|
| `league_lookup(p_name)` | league name | `league_id`, `league_name` (none if unknown) |
| `league_team_list(p_name)` | league name | teams: id, abbreviation, city, nickname, division, controlled_by |
| `league_trade_history(p_name)` | league name | active trades with review status, newest first |
| `league_trade_revisions(p_name, p_trade_id)` | league name, trade id | revisions of one trade (for the Original submission view) |

### 5.2 Edge Functions

| Function | Status | Auth | Body | Does |
|---|---|---|---|---|
| `accept-trade` | Changed | publishable | v2.0 snapshot (§7) | Validates as today, plus the league fields; calls `submit_league_trade()` |
| `commissioner-login` | New (replaces `admin-login`) | publishable | `league_name`, `password` | Checks `verify_commissioner_password`; returns a token `{version: 2, leagueId, role: "COMMISSIONER", issuedAt, expiresAt}` signed with `ADMIN_SESSION_SECRET` |
| `commissioner-session-check` | New (replaces `admin-session-check`) | token | — | Valid / expired, plus league |
| `review-trade` | New (replaces `delete-trade`) | token | `trade_id`, `action` (`REVIEW` / `CORRECT` / `REVERSE`), `commissioner_name`, `reason`, and for CORRECT a v2.0 snapshot | Checks that the trade belongs to the token's league; calls `review_league_trade()` |
| `commissioner-audit-log` | New (replaces `admin-audit-log`) | token | — | This league's audit events |

- **Retired at launch:** `admin-login`, `admin-session-check`, `delete-trade`, `admin-audit-log`, and the `ADMIN_PASSWORD` secret. `ADMIN_SESSION_SECRET` stays as the signing key. v1 tokens (no `leagueId`) are rejected.
- **Login throttling (Decided, Q27):** after 5 wrong passwords for a league within 15 minutes, `commissioner-login` refuses for 15 minutes (counted in a small `login_attempts` table). Today's admin login has no throttle; a per-league password guessed by brute force would expose corrections and reversals.

### 5.3 Database functions (service role only)

- `submit_league_trade(p_league_id, p_snapshot jsonb, p_submitter_name, p_submitter_note) returns (trade_id, trade_number, accepted_at)`. Inserts the `trades` row (UNREVIEWED) with league and team fields, revision 0, and `trade_assets` rows. It checks that both teams belong to the league; the foreign keys enforce it too.
- `review_league_trade(p_league_id, p_trade_id, p_action, p_commissioner_name, p_reason, p_snapshot jsonb) returns (...)`.
  - **REVIEW:** sets REVIEWED.
  - **CORRECT:** inserts the next revision and its assets, copies the corrected values onto the `trades` row, and sets REVIEWED and `current_revision`.
  - **REVERSE:** sets REVERSED, `deleted_at` and `reversal_reason`.
  - Every action writes the audit event.

## 6. Data access change

The `trades` table's **"Public can read active trades"** policy is dropped in v2.0. Otherwise anyone could read every league's trades directly, without knowing a league name. Trade History reads `league_trade_history()` instead. Browser roles get no direct table access to league data (`V5_SAMPLE_SCHEMA.sql` §6).

## 7. Snapshot contract v2

`buildTradeSnapshot()` keeps **every v1.5.0 field with the same name and meaning**, and adds:

| Field | Type | Notes |
|---|---|---|
| `web_release` | `"v2.0"` | Ruleset stays `"v4.4"` |
| `mode` | `"LEAGUE"` | Practice doesn't submit (§3.3) |
| `league_name` | string | Resolved server-side to `league_id`; unknown → 404 |
| `submitting_team_id` | uuid | "Your team"; side A (`user_team_*`) |
| `other_team_id` | uuid | Side B (`cpu_team_*`); may be a human team |
| `submitter_name` | string | 1–60 characters |
| `submitter_note` | string or null | Up to 500 characters |

- Asset objects (`snapshotAsset`) are unchanged. The server copies them into `trade_assets` (side A → SUBMITTING, side B → OTHER).
- **Column names stay** `user_team_*` / `cpu_team_*` (no rename), with the meaning "submitting team" / "other team" in league mode.
- Corrections send the same shape, with the commissioner's edited assets and re-run results.

### Accepted Web Release / Ruleset pairs in `accept-trade`

| Pair | When |
|---|---|
| `v2.0` / `v4.4` | From the function deploy onwards (requires the league fields) |
| `v1.5.0` / `v4.4` | Accepted only during the switchover window, so open v1.5.0 tabs don't fail. Logged without a league, then swept into the main league as pre-league (§8 step 6). Removed in a v2.0 maintenance update about a week after launch |
| `v1.4.0` / `v4.2` | **Removed** in v2.0 |

## 8. Migration and release order

The baseline rule: deploy backend first, merge the site last, and keep every step reversible until the merge.

| Step | What | Reversible by |
|---|---|---|
| 0 | **Backup:** export `trades` and `audit_events` (CSV) to `backups/`; record row counts | — |
| 1 | Apply migration `…_league_mode.sql`: `league_teams`, `trade_revisions`, `trade_assets`, additive columns on `trades` and `audit_events`, read functions, write functions (`leagues` already exists). The public read policy on `trades` **stays for now** | A down migration that drops the new objects (no existing data touched) |
| 2 | The site owner sets the main league's commissioner password and seeds its 32 teams (from the latest `leagueteams` import, or the captured payload), entering the password at run time (never committed). The league row already exists from the Snallabot connection. Then `commissioner_password_hash` becomes required | Clear the password; delete the team rows |
| 3 | Deploy `accept-trade` (accepts v2.0 and v1.5.0) and the four commissioner functions | Redeploy the v1.5.0 `accept-trade` |
| 4 | Migrate history (schema §7): every existing trade → main league, pre-league; revision 0 for each; one `PRE_LEAGUE_MIGRATION` audit event. Check counts against step 0 | Clear the league fields on pre-league trades; delete revisions |
| 5 | **Merge the v2.0 site** (`release/web-v2.0` → `main`); GitHub Pages deploys. Then apply migration `…_drop_public_trade_read.sql` | Revert the merge; re-create the policy |
| 6 | Re-run the step 4 sweep for any v1.5.0 trades logged during the window | — |
| 7 | Smoke test on the live site (§10). Retire the old Admin functions and the `ADMIN_PASSWORD` secret | Redeploy the old functions |
| 8 | About a week later: maintenance update removing `v1.5.0` from `accept-trade` | — |

## 9. Files touched

| File | Change |
|---|---|
| `index.html` | Mode switch, league bar, team pickers, submit dialog fields, Commissioner tab (replaces Admin), history badges |
| `calculator-ui.js` | League state, team pickers, display-name substitution, v2.0 snapshot fields, correction mode. **Baseline file:** manifest addendum |
| `trade-history.js` | Read via `league_trade_history`; status badges; Original submission view |
| `admin.js` → `commissioner.js` | League sign-in, review queue, Mark reviewed / Correct / Reverse, audit log |
| `storage.js` | `leagueLookup`, `leagueTeams`, `leagueHistory`, `submitLeagueTrade`, `commissionerLogin`, `reviewTrade`, `commissionerAuditLog` |
| `styles.css` | Switch, badges, queue |
| `supabase/migrations/` | `league_mode`, `drop_public_trade_read`, `login_attempts` |
| `supabase/functions/` | `accept-trade` changed; four new commissioner functions; four old ones removed after launch |
| `docs/roadmap/v5/sql/create-league.sql` | Site-owner script: set the commissioner password and seed teams on the existing league row (or create a new league) |
| `valuation.js` | **No change** |

## 10. Tests and acceptance

**Automated**

- `node tests/ruleset-v4.4.test.js`: 64 / 64 (v4.4 unchanged); `valuation.js` hash equals the baseline.
- `tests/web-v2.0-snapshot.test.js` (new): the v2.0 snapshot has every v1.5.0 field unchanged plus the league fields; display-name substitution never changes stored text.
- Database tests extending `V5_SAMPLE_SCHEMA_TESTS.sql` for `submit_league_trade` and `review_league_trade`: wrong league, teams from another league, correction without reason, reverse twice, a token for league X acting on league Y, history hides reversed trades.

**Smoke test (live, after step 5)**

1. Practice mode looks and values exactly as v1.5.0 (spot-check three parity scenarios).
2. An unknown league name shows "No league with that name."
3. Enter the main league: 32 teams with the correct names (OMH, AZ), and the 6 human teams marked.
4. Submit a FAIR trade and an UNFAIR one. Both appear in history as Unreviewed; the UNFAIR one is flagged in the queue.
5. Mark one reviewed, correct the other (both revisions visible), reverse a test trade (gone from history, present in the audit log).
6. A wrong password is refused, and the throttle triggers after 5 tries.
7. Pre-league trades are present with the Pre-league badge; the count matches the backup.
8. Light and dark mode, desktop and mobile.

**Exit (phase plan):** a real trade can be submitted, logged, reviewed, corrected and reversed in league mode, and practice mode is unchanged apart from no longer logging trades (Q25).

## 11. Docs at release

`docs/releases/RELEASE_NOTES_v2.0.md`; a `docs/validation/` record (regression, snapshot tests, smoke, migration counts); manifest addendum (new hashes for `calculator-ui.js` and `accept-trade`); README; the in-app How to Use and Rules tabs (league mode, review statuses); the wiki pages Releases, Web Release v2.0 (new), Using the Calculator, Development and Ruleset v5.0 Roadmap; a GitHub tag `v2.0` and Release.

## 12. Build breakdown

Branch `release/web-v2.0`, one `feature/web-v2.0-<topic>` branch per item, in this order:

1. `db`: migration, database functions, database tests.
2. `functions`: `accept-trade` v2.0 and the commissioner functions.
3. `league-switch`: mode switch, league bar, team pickers, display names, submit.
4. `history`: league history and badges.
5. `commissioner`: sign-in, queue, review actions, audit log.
6. `migration-script`: `create-league.sql`, history migration, runbook.
7. `release`: docs, manifest addendum, smoke test, then the release PR.

## 13. Risks specific to v2.0

- **History disappears for anyone who doesn't know the league name** once the public read policy is dropped. That's intended (§6), but members need the league name before launch.
- **The league name is the access key.** Keep it out of the public repo, wiki, commit messages and PR text; share it with members privately (for example in the league Discord).
- **Values are computed in the browser,** as in v1.5.0. A tampered request could log made-up values. The commissioner review is the check; a later option is re-running `valuation.js` inside `accept-trade` to verify.
- **The switchover window** (steps 3–6) can log v1.5.0 trades without a league; step 6 sweeps them.
- **Migration risk to existing history (R4):** covered by the step 0 backup, count checks, and reversible steps until the merge.
