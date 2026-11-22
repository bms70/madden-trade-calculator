// review-trade (Web v2.0): commissioner review, correction or reversal of one league trade.
// Request handling lives in ../_shared/commissioner-handlers.ts (tested in Node).

import { withSupabase } from "npm:@supabase/server@1";

import { handleReviewTrade } from "../_shared/commissioner-handlers.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleReviewTrade(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
        secret: Deno.env.get("ADMIN_SESSION_SECRET"),
      }),
  ),
};
