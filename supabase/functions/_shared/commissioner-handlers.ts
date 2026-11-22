// Request handling for the Web v2.0 commissioner functions:
//   commissioner-login, commissioner-session-check, review-trade,
//   commissioner-audit-log
// Each function's index.ts wires in Supabase and the secret; this file has no
// Deno or Supabase APIs, so it is tested in Node.

import {
  failure,
  jsonResponse,
  preflight,
  readJsonObject,
  type Rpc,
  statusForDatabaseError,
  trimmedString,
  uuidPattern,
} from "./http.ts";
import {
  createCommissionerSession,
  verifyCommissionerSession,
} from "./commissioner-session.ts";
import {
  LEAGUE_RELEASE,
  SUPPORTED_RELEASES,
  tradeForStorage,
  validateTradePayload,
} from "./trade-validation.ts";

export type CommissionerDeps = {
  rpc: Rpc;
  secret: string | undefined;
  nowSeconds?: () => number;
  log?: (message: string, details: unknown) => void;
};

const unavailable = "Commissioner access is unavailable.";
const sessionRequired = "Commissioner sign-in required.";

function now(deps: CommissionerDeps): number {
  return deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1000);
}

function logger(deps: CommissionerDeps) {
  return deps.log ?? ((message: string, details: unknown) => console.error(message, details));
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}

// Common start: preflight, POST only, secret present, JSON object body.
async function begin(
  request: Request,
  deps: CommissionerDeps,
): Promise<{ response: Response } | { body: Record<string, unknown>; secret: string }> {
  if (request.method === "OPTIONS") return { response: preflight() };
  if (request.method !== "POST") return { response: failure("Method not allowed.", 405) };

  if (!deps.secret) {
    logger(deps)("ADMIN_SESSION_SECRET is unavailable.", null);
    return { response: failure(unavailable, 500) };
  }

  const body = await readJsonObject(request);
  if (!body) return { response: failure("Request body must contain valid JSON.", 400) };

  return { body, secret: deps.secret };
}

// Verifies the token; when the body names a league_id it must match the token.
async function requireSession(
  body: Record<string, unknown>,
  secret: string,
  deps: CommissionerDeps,
): Promise<{ response: Response } | { leagueId: string; expiresAt: number }> {
  const session = await verifyCommissionerSession(body.token, secret, now(deps));

  if (!session.valid) {
    return { response: failure(sessionRequired, 401, { reason: session.reason }) };
  }

  if (
    body.league_id !== undefined &&
    (typeof body.league_id !== "string" ||
      body.league_id.toLowerCase() !== session.payload.leagueId.toLowerCase())
  ) {
    return { response: failure("This sign-in is for a different league.", 403) };
  }

  return { leagueId: session.payload.leagueId, expiresAt: session.payload.expiresAt };
}

// ---------------------------------------------------------------------------
// commissioner-login: { league_name, password } -> session token for that league
// ---------------------------------------------------------------------------
export async function handleCommissionerLogin(request: Request, deps: CommissionerDeps): Promise<Response> {
  const start = await begin(request, deps);
  if ("response" in start) return start.response;
  const { body, secret } = start;

  const leagueName = trimmedString(body.league_name, 100);
  const password = typeof body.password === "string" ? body.password : "";

  if (!leagueName || password.length === 0 || password.length > 512) {
    return failure("Enter the league name and the commissioner password.", 400);
  }

  const { data, error } = await deps.rpc("commissioner_login", {
    p_league_name: leagueName,
    p_password: password,
  });

  if (error) {
    logger(deps)("Commissioner login failed:", error);
    return failure(unavailable, 500);
  }

  const row = firstRow(data);
  const status = row?.status;

  if (status === "OK" && typeof row?.league_id === "string") {
    const session = await createCommissionerSession(secret, row.league_id, now(deps));
    return jsonResponse({
      ok: true,
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
        leagueId: row.league_id,
        leagueName: row.league_name,
      },
    });
  }

  if (status === "BAD") return failure("Wrong password.", 401);

  if (status === "LOCKED") {
    const retryAfter = typeof row?.retry_after_seconds === "number" ? row.retry_after_seconds : 900;
    return failure("Too many wrong passwords. Try again later.", 429, { retryAfterSeconds: retryAfter });
  }

  if (status === "NOT_SET") return failure("This league has no commissioner password yet.", 403);
  if (status === "UNKNOWN") return failure("League not found.", 404);

  logger(deps)("Commissioner login returned an unexpected result.", data);
  return failure(unavailable, 500);
}

// ---------------------------------------------------------------------------
// commissioner-session-check: { token, league_id? } -> still valid?
// ---------------------------------------------------------------------------
export async function handleCommissionerSessionCheck(request: Request, deps: CommissionerDeps): Promise<Response> {
  const start = await begin(request, deps);
  if ("response" in start) return start.response;

  const session = await requireSession(start.body, start.secret, deps);
  if ("response" in session) return session.response;

  return jsonResponse({
    ok: true,
    session: {
      leagueId: session.leagueId,
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// review-trade: { token, league_id?, trade_id, action, commissioner_name,
//                 reason?, trade? (CORRECT only) }
// ---------------------------------------------------------------------------
const reviewActions = new Set(["REVIEW", "CORRECT", "REVERSE"]);

// Corrections are made in the v2.0 calculator, so only v2.0 snapshots.
const correctionReleases: Record<string, string> = {
  [LEAGUE_RELEASE]: SUPPORTED_RELEASES[LEAGUE_RELEASE],
};

export async function handleReviewTrade(request: Request, deps: CommissionerDeps): Promise<Response> {
  const start = await begin(request, deps);
  if ("response" in start) return start.response;
  const { body, secret } = start;

  const session = await requireSession(body, secret, deps);
  if ("response" in session) return session.response;

  const tradeId = typeof body.trade_id === "string" ? body.trade_id.trim() : "";
  if (!uuidPattern.test(tradeId)) return failure("A valid trade is required.", 400);

  const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : "";
  if (!reviewActions.has(action)) return failure("Unknown review action.", 400);

  const commissionerName = trimmedString(body.commissioner_name, 60);
  if (!commissionerName) return failure("Commissioner name must be 1 to 60 characters.", 400);

  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== "string") return failure("The reason must be text.", 400);
    const trimmed = body.reason.trim();
    if (trimmed.length > 500) return failure("The reason must be 500 characters or fewer.", 400);
    reason = trimmed.length > 0 ? trimmed : null;
  }

  if ((action === "CORRECT" || action === "REVERSE") && !reason) {
    return failure(action === "CORRECT" ? "A correction needs a reason." : "Reversing a trade needs a reason.", 400);
  }

  let trade: Record<string, unknown> | null = null;

  if (action === "CORRECT") {
    const validation = validateTradePayload(body.trade, correctionReleases);
    if (!validation.valid) return failure(validation.message, 400);
    trade = tradeForStorage(validation.trade);
  }

  const { data, error } = await deps.rpc("review_league_trade", {
    p_league_id: session.leagueId,
    p_trade_id: tradeId,
    p_action: action,
    p_commissioner_name: commissionerName,
    p_reason: reason,
    p_trade: trade,
  });

  if (error) {
    const status = statusForDatabaseError(error.code);
    logger(deps)("Trade review failed:", error);
    return failure(status === 500 ? "The trade could not be updated." : error.message, status);
  }

  const row = firstRow(data);
  if (!row) {
    logger(deps)("Trade review returned no row.", data);
    return failure("The trade could not be updated.", 500);
  }

  return jsonResponse({
    ok: true,
    trade: {
      id: row.trade_id,
      tradeNumber: row.trade_number,
      reviewStatus: row.review_status,
      currentRevision: row.current_revision,
    },
  });
}

// ---------------------------------------------------------------------------
// commissioner-audit-log: { token, league_id?, limit? } -> this league's events
// ---------------------------------------------------------------------------
export async function handleCommissionerAuditLog(request: Request, deps: CommissionerDeps): Promise<Response> {
  const start = await begin(request, deps);
  if ("response" in start) return start.response;
  const { body, secret } = start;

  const session = await requireSession(body, secret, deps);
  if ("response" in session) return session.response;

  let limit = 200;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > 1000) {
      return failure("The limit must be a whole number from 1 to 1000.", 400);
    }
    limit = body.limit;
  }

  const { data, error } = await deps.rpc("league_audit_log", {
    p_league_id: session.leagueId,
    p_limit: limit,
  });

  if (error) {
    logger(deps)("Audit log retrieval failed:", error);
    return failure("Audit log could not be loaded.", 500);
  }

  const rows = Array.isArray(data) ? data : [];

  return jsonResponse({
    ok: true,
    events: rows.map((row: Record<string, unknown>) => ({
      occurredAt: row.occurred_at,
      action: row.action,
      tradeNumber: row.trade_number,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      reason: row.reason,
      details: row.details,
    })),
  });
}
