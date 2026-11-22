// commissioner-session-check (Web v2.0): checks a commissioner session token is still valid.
// Request handling lives in ../_shared/commissioner-handlers.ts (tested in Node).

import { withSupabase } from "npm:@supabase/server@1";

import { handleCommissionerSessionCheck } from "../_shared/commissioner-handlers.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleCommissionerSessionCheck(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
        secret: Deno.env.get("ADMIN_SESSION_SECRET"),
      }),
  ),
};
