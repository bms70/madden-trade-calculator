// commissioner-audit-log (Web v2.0): the audit log for the commissioner's league.
// Request handling lives in ../_shared/commissioner-handlers.ts (tested in Node).

import { withSupabase } from "npm:@supabase/server@1";

import { handleCommissionerAuditLog } from "../_shared/commissioner-handlers.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleCommissionerAuditLog(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
        secret: Deno.env.get("ADMIN_SESSION_SECRET"),
      }),
  ),
};
