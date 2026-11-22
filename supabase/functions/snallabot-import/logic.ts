// Snallabot import receiver: request parsing and validation.
// No Deno or Supabase APIs here, so the same code runs in the Edge Function
// and in tests/snallabot-import-logic.test.mjs (Node).
//
// Snallabot sends POST <function URL>/<secret>/<platform>/<leagueId>/<route>
// with a JSON body and no auth header. The secret in the path is the only
// protection, so it is checked (as a SHA-256 hash) in the database.

export const FUNCTION_NAME = "snallabot-import";

// Largest body accepted. A team roster is about 185 kB; 5 MB leaves room.
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export type ParsedImportPath = {
  secret: string;
  platform: string;
  externalLeagueId: number;
  route: string;
};

export type ParseResult =
  | { ok: true; value: ParsedImportPath }
  | { ok: false; status: number; error: string };

const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const PLATFORM_PATTERN = /^[a-z0-9]{1,16}$/;
const LEAGUE_ID_PATTERN = /^[0-9]{1,15}$/;
const ROUTE_PATTERN = /^[a-z0-9/]{1,120}$/;

export const KNOWN_ROUTE_PATTERN =
  /^(leagueteams|standings|freeagents\/roster|team\/[0-9]+\/roster|week\/(reg|pre)\/[0-9]{1,2}\/(passing|rushing|receiving|defense|kicking|punting|teamstats|schedules))$/;

// Splits a request path into its parts. Works whether or not the runtime
// keeps the "/functions/v1" prefix: everything after the function name counts.
export function parseImportPath(pathname: string): ParseResult {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const start = segments.indexOf(FUNCTION_NAME);

  if (start === -1) {
    return { ok: false, status: 404, error: "Not found." };
  }

  const rest = segments.slice(start + 1);

  if (rest.length < 4) {
    return { ok: false, status: 404, error: "Not found." };
  }

  const [secret, platformRaw, leagueId, ...routeParts] = rest;
  const platform = platformRaw.toLowerCase();
  const route = routeParts.join("/").toLowerCase();

  if (!SECRET_PATTERN.test(secret)) {
    return { ok: false, status: 404, error: "Not found." };
  }

  if (!PLATFORM_PATTERN.test(platform)) {
    return { ok: false, status: 400, error: "Invalid platform segment." };
  }

  if (!LEAGUE_ID_PATTERN.test(leagueId)) {
    return { ok: false, status: 400, error: "Invalid league ID." };
  }

  if (!ROUTE_PATTERN.test(route)) {
    return { ok: false, status: 400, error: "Invalid route." };
  }

  return {
    ok: true,
    value: {
      secret,
      platform,
      externalLeagueId: Number(leagueId),
      route,
    },
  };
}

export type BodyResult =
  | { ok: true; value: Record<string, unknown>; byteLength: number }
  | { ok: false; status: number; error: string };

// Checks the raw body text: size, valid JSON, and a JSON object (every
// Companion-format payload is an object with a list, "success" and "message").
export function validateBody(text: string): BodyResult {
  const byteLength = new TextEncoder().encode(text).length;

  if (byteLength === 0) {
    return { ok: false, status: 400, error: "Request body is empty." };
  }

  if (byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }

  return { ok: true, value: parsed as Record<string, unknown>, byteLength };
}

// Lower-case hex SHA-256, using Web Crypto (Deno and Node 20+).
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Maps a database error code from record_snallabot_payload to an HTTP status.
export function statusForDatabaseError(code: string | undefined): number {
  if (code === "P0002") return 404; // unknown or inactive import URL
  if (code === "22023") return 403; // URL belongs to a different league
  return 500;
}
