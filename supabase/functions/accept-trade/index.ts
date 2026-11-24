// accept-trade (Web v2.1): logs a league trade. Validation and the league
// path live in handler.ts (tested in Node); this file wires in Supabase.

import { withSupabase } from "npm:@supabase/server@1";

import { handleAcceptTrade } from "./handler.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleAcceptTrade(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
      }),
  ),
};
