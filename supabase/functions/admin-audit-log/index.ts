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

function authorizationFailure(): Response {
  return jsonResponse(
    {
      ok: false,
      error: "Administrative authorization required.",
    },
    401,
  );
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, ctx): Promise<Response> => {
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
            error: "Method not allowed.",
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
        return authorizationFailure();
      }

      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        Array.isArray(requestBody)
      ) {
        return authorizationFailure();
      }

      const body =
        requestBody as Record<string, unknown>;

      const validation =
        await verifyAdminSession(
          body.token,
          sessionSecret,
        );

      if (!validation.valid) {
        return authorizationFailure();
      }

      const { data: auditEvents, error: auditError } =
        await ctx.supabaseAdmin
          .from("audit_events")
          .select(
            `
              id,
              trade_id,
              trade_number,
              action,
              occurred_at,
              administrator_name,
              reason
            `,
          )
          .order("occurred_at", {
            ascending: false,
          });

      if (auditError) {
        console.error(
          "Audit Log retrieval failed:",
          {
            code: auditError.code,
            message: auditError.message,
            details: auditError.details,
            hint: auditError.hint,
          },
        );

        return jsonResponse(
          {
            ok: false,
            error: "Audit Log could not be loaded.",
          },
          500,
        );
      }

      const deletedTradeIds =
        Array.isArray(auditEvents)
          ? [
              ...new Set(
                auditEvents
                  .map(event => event.trade_id)
                  .filter(
                    value =>
                      typeof value === "string",
                  ),
              ),
            ]
          : [];

      let deletedTrades: unknown[] = [];

      if (deletedTradeIds.length > 0) {
        const { data, error } =
          await ctx.supabaseAdmin
            .from("trades")
            .select(
              `
                id,
                trade_number,
                accepted_at,
                web_release,
                ruleset_version,
                user_team_assets,
                cpu_team_assets,
                user_raw_value,
                cpu_raw_value,
                user_adjusted_value,
                cpu_adjusted_value,
                adjusted_gap,
                verdict,
                evaluation_mode,
                protection_tier,
                required_target,
                fair_maximum,
                trade_intelligence,
                suggested_correction,
                deleted_at,
                created_at
              `,
            )
            .in("id", deletedTradeIds);

        if (error) {
          console.error(
            "Deleted Trade retrieval failed:",
            {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
            },
          );

          return jsonResponse(
            {
              ok: false,
              error: "Audit Log could not be loaded.",
            },
            500,
          );
        }

        deletedTrades =
          Array.isArray(data) ? data : [];
      }

      return jsonResponse({
        ok: true,
        auditEvents:
          Array.isArray(auditEvents)
            ? auditEvents
            : [],
        deletedTrades,
      });
    },
  ),
};