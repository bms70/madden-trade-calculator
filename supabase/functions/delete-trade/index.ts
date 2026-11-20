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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        return jsonResponse(
          {
            ok: false,
            error: "Invalid deletion request.",
          },
          400,
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
            error: "Invalid deletion request.",
          },
          400,
        );
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

      const tradeId =
        typeof body.tradeId === "string"
          ? body.tradeId.trim()
          : "";

      if (!uuidPattern.test(tradeId)) {
        return jsonResponse(
          {
            ok: false,
            error: "A valid Trade identifier is required.",
          },
          400,
        );
      }

      const administratorName =
        typeof body.administratorName === "string"
          ? body.administratorName.trim()
          : "";

      if (administratorName.length === 0) {
        return jsonResponse(
          {
            ok: false,
            error: "Administrator Name is required.",
          },
          400,
        );
      }

      if (administratorName.length > 200) {
        return jsonResponse(
          {
            ok: false,
            error: "Administrator Name is too long.",
          },
          400,
        );
      }

      const reason =
        typeof body.reason === "string"
          ? body.reason.trim()
          : "";

      if (reason.length > 1000) {
        return jsonResponse(
          {
            ok: false,
            error: "Deletion Reason is too long.",
          },
          400,
        );
      }

      const { data, error } =
        await ctx.supabaseAdmin.rpc(
          "delete_trade_with_audit",
          {
            p_trade_id: tradeId,
            p_administrator_name:
              administratorName,
            p_reason:
              reason.length > 0
                ? reason
                : null,
          },
        );

      if (error) {
        console.error(
          "Atomic Trade deletion failed:",
          {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
        );

        if (error.code === "P0002") {
          return jsonResponse(
            {
              ok: false,
              error:
                "The Trade was not found or is already deleted.",
            },
            409,
          );
        }

        if (error.code === "22023") {
          return jsonResponse(
            {
              ok: false,
              error: "Administrator Name is required.",
            },
            400,
          );
        }

        return jsonResponse(
          {
            ok: false,
            error:
              "The Trade could not be deleted.",
          },
          500,
        );
      }

      if (
        !Array.isArray(data) ||
        data.length !== 1
      ) {
        console.error(
          "Atomic Trade deletion returned an unexpected result:",
          data,
        );

        return jsonResponse(
          {
            ok: false,
            error:
              "The Trade deletion result was invalid.",
          },
          500,
        );
      }

      const result =
        data[0] as Record<string, unknown>;

      if (
        typeof result.trade_id !== "string" ||
        typeof result.trade_number !== "number" ||
        typeof result.deleted_at !== "string" ||
        typeof result.audit_event_id !== "string" ||
        typeof result.audit_occurred_at !== "string"
      ) {
        console.error(
          "Atomic Trade deletion returned incomplete data:",
          result,
        );

        return jsonResponse(
          {
            ok: false,
            error:
              "The Trade deletion result was incomplete.",
          },
          500,
        );
      }

      return jsonResponse({
        ok: true,
        deletion: {
          tradeId: result.trade_id,
          tradeNumber: result.trade_number,
          deletedAt: result.deleted_at,
          auditEventId: result.audit_event_id,
          auditOccurredAt:
            result.audit_occurred_at,
        },
      });
    },
  ),
};