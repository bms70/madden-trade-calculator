// Snallabot import receiver (backend only; Web Release v1.5.0 maintenance).
// Ruleset v4.4 is unchanged; nothing here reads or writes trades.
//
// Snallabot exports POST to:
//   https://<project>.supabase.co/functions/v1/snallabot-import/<secret>/<platform>/<leagueId>/<route>
// with no auth header, so this function uses auth "none" and checks the
// secret itself (as a SHA-256 hash, in record_snallabot_payload).
// Deploy with: npx.cmd supabase functions deploy snallabot-import --no-verify-jwt
// Design: docs/roadmap/v5/V5_SNALLABOT_CONNECTION.md

import { withSupabase } from "npm:@supabase/server@1";
import {
  MAX_BODY_BYTES,
  parseImportPath,
  sha256Hex,
  statusForDatabaseError,
  validateBody,
} from "./logic.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Snallabot only needs a 2xx. Errors use the same shape so they show up
// readably in Snallabot's logs, without saying anything about the league.
function failure(status: number, error: string): Response {
  return jsonResponse({ success: false, message: error }, status);
}

export default {
  fetch: withSupabase(
    { auth: "none" },
    async (request, context): Promise<Response> => {
      if (request.method !== "POST") {
        return failure(405, "Method not allowed.");
      }

      const parsed = parseImportPath(new URL(request.url).pathname);

      if (!parsed.ok) {
        return failure(parsed.status, parsed.error);
      }

      const declaredLength = Number(request.headers.get("content-length") ?? "0");

      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return failure(413, "Request body is too large.");
      }

      let text: string;

      try {
        text = await request.text();
      } catch {
        return failure(400, "Request body could not be read.");
      }

      const body = validateBody(text);

      if (!body.ok) {
        return failure(body.status, body.error);
      }

      const { secret, platform, externalLeagueId, route } = parsed.value;

      const { data, error } = await context.supabaseAdmin.rpc(
        "record_snallabot_payload",
        {
          p_secret_sha256: await sha256Hex(secret),
          p_platform: platform,
          p_external_league_id: externalLeagueId,
          p_route: route,
          p_body: body.value,
          p_body_sha256: await sha256Hex(text),
          p_content_length: body.byteLength,
        },
      );

      if (error) {
        const status = statusForDatabaseError(error.code);

        if (status === 500) {
          console.error("Snallabot import failed:", error.message);
          return failure(500, "Import could not be stored.");
        }

        return failure(status, status === 404 ? "Not found." : "Forbidden.");
      }

      const row = Array.isArray(data) ? data[0] : data;

      return jsonResponse({
        success: true,
        message: "",
        snapshot_id: row?.snapshot_id ?? null,
        duplicate: row?.is_duplicate ?? false,
      });
    },
  ),
};
