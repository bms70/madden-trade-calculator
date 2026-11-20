import { withSupabase } from "npm:@supabase/server@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_MINUTES = 30;

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

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return new Uint8Array(digest);
}

function constantTimeEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

async function passwordMatches(
  suppliedPassword: string,
  expectedPassword: string,
): Promise<boolean> {
  const suppliedHash = await sha256(suppliedPassword);
  const expectedHash = await sha256(expectedPassword);

  return constantTimeEqual(suppliedHash, expectedHash);
}

async function createAdminSession(
  sessionSecret: string,
): Promise<{
  token: string;
  expiresAt: string;
}> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds =
    issuedAt + SESSION_MINUTES * 60;

  const payload = {
    version: 1,
    issuedAt,
    expiresAt: expiresAtSeconds,
  };

  const payloadBytes = new TextEncoder().encode(
    JSON.stringify(payload),
  );

  const encodedPayload = toBase64Url(payloadBytes);

  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    new TextEncoder().encode(encodedPayload),
  );

  const encodedSignature = toBase64Url(
    new Uint8Array(signature),
  );

  return {
    token: `${encodedPayload}.${encodedSignature}`,
    expiresAt: new Date(
      expiresAtSeconds * 1000,
    ).toISOString(),
  };
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
            error: "Access denied.",
          },
          405,
        );
      }

      const adminPassword =
        Deno.env.get("ADMIN_PASSWORD");

      const sessionSecret =
        Deno.env.get("ADMIN_SESSION_SECRET");

      if (!adminPassword || !sessionSecret) {
        console.error(
          "Required Admin authentication secrets are unavailable.",
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
            error: "Access denied.",
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
            error: "Access denied.",
          },
          401,
        );
      }

      const suppliedPassword =
        (requestBody as Record<string, unknown>).password;

      if (
        typeof suppliedPassword !== "string" ||
        suppliedPassword.length === 0 ||
        suppliedPassword.length > 512
      ) {
        return jsonResponse(
          {
            ok: false,
            error: "Access denied.",
          },
          401,
        );
      }

      const validPassword =
        await passwordMatches(
          suppliedPassword,
          adminPassword,
        );

      if (!validPassword) {
        return jsonResponse(
          {
            ok: false,
            error: "Access denied.",
          },
          401,
        );
      }

      const session =
        await createAdminSession(sessionSecret);

      return jsonResponse({
        ok: true,
        session: {
          token: session.token,
          expiresAt: session.expiresAt,
        },
      });
    },
  ),
};