import { withSupabase } from "npm:@supabase/server@1";

import {
  verifyAdminSession,
} from "../_shared/admin-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request): Promise<Response> => {
      if (request.method === "OPTIONS") {
        return new Response("ok", {
          status: 200,
          headers: corsHeaders,
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(
          {
            ok: false,
            error: "Administrative authorization required.",
          },
          405,
        );
      }

      const sessionSecret =
        Deno.env.get("ADMIN_SESSION_SECRET");

      if (!sessionSecret) {
        console.error(
          "ADMIN_SESSION_SECRET is unavailable.",
        );

        return jsonResponse(
          {
            ok: false,
            error: "Administrative access is unavailable.",
          },
          500,
        );
      }

      let requestBody: unknown;

      try {
        requestBody = await request.json();
      } catch {
        return jsonResponse(
          {
            ok: false,
            error: "Administrative authorization required.",
          },
          401,
        );
      }

      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        Array.isArray(requestBody)
      ) {
        return jsonResponse(
          {
            ok: false,
            error: "Administrative authorization required.",
          },
          401,
        );
      }

      const token =
        (requestBody as Record<string, unknown>).token;

      const validation =
        await verifyAdminSession(
          token,
          sessionSecret,
        );

      if (!validation.valid) {
        return jsonResponse(
          {
            ok: false,
            error: "Administrative authorization required.",
          },
          401,
        );
      }

      return jsonResponse({
        ok: true,
        authorized: true,
        session: {
          issuedAt: new Date(
            validation.payload.issuedAt * 1000,
          ).toISOString(),
          expiresAt: new Date(
            validation.payload.expiresAt * 1000,
          ).toISOString(),
        },
      });
    },
  ),
};