# V5_WEB_V2.0_FUNCTIONS

Request and response contracts for the Web v2.0 Edge Functions (build step 2). Steps 3 (league switch) and 5 (Commissioner area) build `storage.js` against these. Design: [V5_WEB_V2.0_SPEC.md](V5_WEB_V2.0_SPEC.md) §5.2 and §7.

Nothing here is deployed yet. The functions are deployed at release step 3, after the step-1 migration is pushed (spec §8).

## Layout

| File | Holds |
|---|---|
| `supabase/functions/_shared/http.ts` | CORS, JSON responses, body parsing, database error → HTTP status |
| `supabase/functions/_shared/trade-validation.ts` | The trade checks (moved unchanged from `accept-trade` v1.5.0), accepted release pairs, the league fields |
| `supabase/functions/_shared/commissioner-session.ts` | Version 2 session tokens: sign and verify |
| `supabase/functions/_shared/commissioner-handlers.ts` | Request handling for the four commissioner functions |
| `supabase/functions/accept-trade/handler.ts` | Request handling for `accept-trade` |
| `supabase/functions/<name>/index.ts` | Thin wiring: Supabase client and `ADMIN_SESSION_SECRET` |

The handlers use no Deno or Supabase APIs, so `tests/web-functions.test.mjs` runs them in Node with a fake database.

All functions: `POST` only (`OPTIONS` answers the CORS preflight), JSON body, publishable key (`verify_jwt = false`, as today). Every response has `ok: true` or `ok: false` with an `error` message to show the user. A bad JSON body returns 400.

## Commissioner session token

`base64url(payload).base64url(HMAC-SHA256)`, signed with `ADMIN_SESSION_SECRET` (the same scheme as the v1 Admin token).

```json
{ "version": 2, "role": "COMMISSIONER", "leagueId": "<uuid>", "issuedAt": 0, "expiresAt": 0 }
```

- Lasts 30 minutes.
- A token works only for its league. Every commissioner action uses the league in the token. A request that also names a `league_id` must match it, or gets 403.
- v1 Admin tokens are refused here, and the old v1 Admin functions refuse version 2 tokens (both tested).
- 401 responses carry `reason`: `missing`, `malformed`, `invalid` or `expired`.

## `accept-trade` (changed)

**v2.0 / v4.4 league trade.** The body is the v2.0 snapshot (spec §7): every v1.5.0 field plus:

| Field | Rule |
|---|---|
| `mode` | `"LEAGUE"` |
| `league_name` | 1–100 characters; looked up with `league_lookup` |
| `submitting_team_id`, `other_team_id` | uuids, different, both in this league |
| `submitter_name` | 1–60 characters after trimming |
| `submitter_note` | optional, up to 500; blank becomes null |

Only the 16 trade fields are stored as the snapshot. The league fields go into their own columns.

| Result | Status | Body |
|---|---|---|
| Logged | 200 | `{ ok, trade: { id, tradeNumber, acceptedAt, leagueName } }` |
| Invalid snapshot or league fields | 400 | `error` says which |
| Team not in this league | 400 | "Both teams must belong to this league." |
| Unknown league | 404 | "League not found." |
| Database failure | 500 | "Trade could not be logged. No historical record was created." |

**v2.1 / v4.4** (from Web v2.1): the same body as v2.0, with `web_release: "v2.1"`. Both v2.0 and v2.1 are accepted.

**v1.5.0 / v4.4:** accepted during the v2.0 switchover only, as a plain insert with no league. **Refused from Web v2.1**, and the plain-insert path was removed.

**v1.4.0 / v4.2.** Refused (400).

## `commissioner-login` (new; replaces `admin-login`)

Body: `{ league_name, password }`. The password can be 1–512 characters.

| `commissioner_login()` result | Status | Body |
|---|---|---|
| OK | 200 | `{ ok, session: { token, expiresAt, leagueId, leagueName } }` |
| BAD | 401 | "Wrong password." |
| LOCKED | 429 | "Too many wrong passwords. Try again later." + `retryAfterSeconds` |
| NOT_SET | 403 | "This league has no commissioner password yet." |
| UNKNOWN | 404 | "League not found." |

The lockout (5 wrong passwords in 15 minutes, per league) is counted in the database, not in the function.

## `commissioner-session-check` (new; replaces `admin-session-check`)

Body: `{ token, league_id? }` → 200 `{ ok, session: { leagueId, expiresAt } }`, 401 (with `reason`), or 403 for another league.

## `review-trade` (new; replaces `delete-trade`)

Body: `{ token, league_id?, trade_id, action, commissioner_name, reason?, trade? }`

| Field | Rule |
|---|---|
| `trade_id` | uuid |
| `action` | `REVIEW`, `CORRECT` or `REVERSE` (any case) |
| `commissioner_name` | 1–60 characters |
| `reason` | up to 500 characters. Required for CORRECT and REVERSE; an optional comment for REVIEW |
| `trade` | CORRECT only: a full v2.0 / v4.4 snapshot, checked with the same validator as `accept-trade` |

| Result | Status | Body |
|---|---|---|
| Done | 200 | `{ ok, trade: { id, tradeNumber, reviewStatus, currentRevision } }` |
| Invalid input, or already reversed | 400 | the message |
| Trade not in the token's league | 404 | "Trade not found in this league." |
| No or expired session | 401 | `reason` |

## `commissioner-audit-log` (new; replaces `admin-audit-log`)

Body: `{ token, league_id?, limit? }`. The limit is 1–1000 and defaults to 200.

200 → `{ ok, events: [ { occurredAt, action, tradeNumber, actorRole, actorName, reason, details } ] }`, newest first, this league only.

## `commissioner-teams` (new in Web v2.1)

| Body | Result |
|---|---|
| `{ token, league_id?, action: "LIST" }` (`LIST` is the default) | 200 `{ ok, teams: [ { teamId, abbreviation, cityName, nickname, division, controlledBy, ownerLabel, updatedAt } ] }`, for the token's league |
| `{ token, league_id?, action: "UPDATE", team_id, controlled_by, owner_label?, commissioner_name }` | 200 `{ ok, team: { teamId, abbreviation, controlledBy, ownerLabel, changed } }` |

- `controlled_by` is `USER` or `CPU`, in any case; `HUMAN` also means USER.
- `owner_label` can be up to 60 characters. A blank or null label clears it.
- `commissioner_name` must be 1–60 characters.
- **Errors:**
  - 400 for invalid input
  - 401 for no or an expired session
  - 403 when `league_id` doesn't match the token
  - 404 when the team isn't in this league
- A change is audited as `TEAM_UPDATED` (actor COMMISSIONER, with before and after values). `changed: false` means nothing differed, and no event is written.

## Deploy (release step 3, not now)

PowerShell, in the repo folder:

```powershell
npx.cmd supabase functions deploy accept-trade --no-verify-jwt
npx.cmd supabase functions deploy commissioner-login --no-verify-jwt
npx.cmd supabase functions deploy commissioner-session-check --no-verify-jwt
npx.cmd supabase functions deploy review-trade --no-verify-jwt
npx.cmd supabase functions deploy commissioner-audit-log --no-verify-jwt
```

There are no new secrets: `ADMIN_SESSION_SECRET` is reused. The old Admin functions and `ADMIN_PASSWORD` are removed at release step 7.
