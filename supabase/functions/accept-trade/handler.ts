// accept-trade request handling (Web v2.1). index.ts wires in Supabase; this
// file has no Deno or Supabase APIs, so it is tested in Node.
//
// Every accepted release (v2.0 and v2.1, both Ruleset v4.4) is a league
// trade: league fields required, logged through submit_league_trade (trade,
// revision 0 and assets). The v1.5.0 plain-insert path was removed in v2.1.

import {
  failure,
  jsonResponse,
  preflight,
  readJsonObject,
  type Rpc,
  statusForDatabaseError,
} from "../_shared/http.ts";
import {
  tradeForStorage,
  validateLeagueFields,
  validateTradePayload,
} from "../_shared/trade-validation.ts";

export type AcceptTradeDeps = {
  rpc: Rpc;
  log?: (message: string, details: unknown) => void;
};

const notLogged = "Trade could not be logged. No historical record was created.";

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}

export async function handleAcceptTrade(request: Request, deps: AcceptTradeDeps): Promise<Response> {
  const log = deps.log ?? ((message, details) => console.error(message, details));

  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return failure("Method not allowed.", 405);

  const body = await readJsonObject(request);
  if (!body) return failure("Request body must contain valid JSON.", 400);

  const validation = validateTradePayload(body);
  if (!validation.valid) return failure(validation.message, 400);

  const trade = tradeForStorage(validation.trade);

  const league = validateLeagueFields(body);
  if (!league.valid) return failure(league.message, 400);

  const lookup = await deps.rpc("league_lookup", { p_name: league.fields.leagueName });

  if (lookup.error) {
    log("League lookup failed:", lookup.error);
    return failure(notLogged, 500);
  }

  const leagueRow = firstRow(lookup.data);
  if (!leagueRow) return failure("League not found.", 404);

  const { data, error } = await deps.rpc("submit_league_trade", {
    p_league_id: leagueRow.league_id,
    p_submitting_team_id: league.fields.submittingTeamId,
    p_other_team_id: league.fields.otherTeamId,
    p_submitter_name: league.fields.submitterName,
    p_submitter_note: league.fields.submitterNote,
    p_trade: trade,
  });

  if (error) {
    const status = statusForDatabaseError(error.code);
    log("League trade submission failed:", error);
    return failure(status === 500 ? notLogged : error.message, status);
  }

  const row = firstRow(data);
  if (!row) {
    log("League trade submission returned no row.", data);
    return failure(notLogged, 500);
  }

  return jsonResponse({
    ok: true,
    trade: {
      id: row.trade_id,
      tradeNumber: row.trade_number,
      acceptedAt: row.accepted_at,
      leagueName: leagueRow.league_name,
    },
  });
}
