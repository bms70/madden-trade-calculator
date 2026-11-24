// commissioner-teams (Web v2.1): the league's teams, and human / CPU and owner label edits.
// Request handling lives in ../_shared/commissioner-handlers.ts (tested in Node).

import { withSupabase } from "npm:@supabase/server@1";

import { handleCommissionerTeams } from "../_shared/commissioner-handlers.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleCommissionerTeams(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
        secret: Deno.env.get("ADMIN_SESSION_SECRET"),
      }),
  ),
};
