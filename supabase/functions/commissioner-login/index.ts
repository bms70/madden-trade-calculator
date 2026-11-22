// commissioner-login (Web v2.0): signs a commissioner in to one league (lockout lives in the database).
// Request handling lives in ../_shared/commissioner-handlers.ts (tested in Node).

import { withSupabase } from "npm:@supabase/server@1";

import { handleCommissionerLogin } from "../_shared/commissioner-handlers.ts";

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> =>
      await handleCommissionerLogin(request, {
        rpc: async (name, args) => await context.supabaseAdmin.rpc(name, args),
        secret: Deno.env.get("ADMIN_SESSION_SECRET"),
      }),
  ),
};
