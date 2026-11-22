# V5_IDENTITY_AND_ACCESS

Ruleset v5.0 roadmap, Phase 1. Drafted 2026-11-21. "Decided" items come from the commissioner. "Assumed" items are defaults for questions the commissioner hasn't answered yet; each stays open until confirmed (see `V5_OPEN_QUESTIONS.md`). The build order is in `V5_PHASE_PLAN.md`.

## Decided

- **League-exclusive trades.** A logged league trade belongs to one league and involves teams from that league. This adds a League layer above everything else.
- **One league now, built for several.** Every league-owned record carries a `league_id`.
- **Access by league name, with no member passwords.** A member types the league name, and their trades go to that league. It's a plain name with no extra code. Members don't have accounts and don't sign in.
- **The practice calculator stays.** The current free-entry calculator stays open to anyone, with no league. It can't log trades.
- **CPU trades are the main case.**
- **Manual entry is fine, and the commissioner audits it.**
- **Every calculator field stays editable, imports or not.** Imports only pre-fill. Edits to imported values are marked for the audit, never blocked.
- **Unfair verdicts:** trades can still be submitted, but they're flagged in the audit queue.
- **The "finesse" problem is quantity-for-quality,** which v4.4 already blocks.
- **Only the commissioner imports league data.**

## Assumed (confirm)

- **Each league gets its own commissioner password** to protect its Admin area (audit queue, imports, pick ownership, corrections). This replaces today's single shared Admin password once league mode ships.
- **Only the site owner creates leagues** and sets their commissioner passwords.
- **The audit happens before logging.** A trade stays Pending until the commissioner approves it.
- **Trades between two human teams are approved by the commissioner alone.** Without member identities, the site can't verify that the other owner agreed.

## Two modes

| | Practice | League |
|---|---|---|
| Who | Anyone | Anyone who enters the league name |
| Teams | Not tied to a league | Choose "my team" and the other team from the league's team list (CPU or human) |
| Assets | Typed by hand | Typed, or picked from imported rosters to pre-fill. **Every field stays editable.** |
| Edited imported values | — | Kept, and marked for the audit ("edited from import: X → Y") |
| Logging | Not logged | Submitted as Pending, audited by the commissioner, then logged |
| Valuation | Ruleset v4.4 | Ruleset v4.4 (same engine and validation) |

## Roles

| Role | How | Can |
|---|---|---|
| Visitor | No league name entered | Use the practice calculator; read the rules and guides |
| Member | Knows the league name | Build and submit league trades; view the league's trade history |
| Commissioner | League name + commissioner password | Audit and approve or reject trades; correct values; import data; maintain the team list and pick ownership |
| Site owner | Project owner | Create leagues; set commissioner passwords |

## League trade flow

1. Enter the league name and choose League mode.
2. Pick your team and the other team.
3. Enter the assets, typed or pre-filled, and adjust as needed. The v4.4 verdict shows as you go, and the posture FYI shows from Phase 5.
4. Submit with a submitter name (free text) and an optional note. The trade becomes **Pending**, and its snapshot is frozen.
5. The commissioner audits it, reviewing imported vs submitted values, flags for unfair verdicts or posture, and any corrections, then approves or rejects.
6. Approved trades are logged. Rejected trades keep their reason.

## Data access (Postgres row-level security and Edge Functions)

- **Reading a league's data** (teams, imported rosters, approved history) needs the league name.
- **Submitting a trade** goes through an Edge Function. It checks that the league exists and that both teams belong to it, then writes the trade as Pending.
- **Commissioner actions** (approve or reject, corrections, imports, pick ownership) go through Edge Functions that check the league's commissioner password, which is stored hashed.
- **Import receiver:** a secret URL per league. Snallabot sends no authentication, so the secret in the URL is the only protection.
- Practice mode reads nothing league-specific and writes nothing.

## Effects on existing parts

- **`buildTradeSnapshot()` / `accept-trade`:** league trades add `league_id`, team IDs, status, submitter name, auditor, the original and corrected snapshots, and, for pre-filled assets, the linked `player_id` with imported vs submitted values. That's a snapshot-contract change, shipped as **Web v2.0** with a coordinated migration. `accept-trade` must be updated and deployed before merge.
- **Existing trade history** moves into the current league in a one-time migration and is marked as pre-league.
- **Admin tab** becomes the commissioner area for each league.

## Known risks

- **Plain league names can be guessed.** Anyone who guesses one can read that league's trades and submit to its queue. The audit gate keeps junk out of league history. A short league code can be added later if spam appears.
- **No member identities.** Anyone can pick any team, and the submitter name is self-reported. The commissioner audit is the only check.
