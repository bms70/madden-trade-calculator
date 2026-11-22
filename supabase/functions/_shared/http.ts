// Shared HTTP helpers for the Web v2.0 functions.
// No Deno or Supabase APIs here, so handlers can be tested in Node.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(
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

export function failure(error: string, status: number, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: false, error, ...extra }, status);
}

export function preflight(): Response {
  return new Response("ok", { status: 200, headers: corsHeaders });
}

// Reads the body as a JSON object; null when missing, invalid or not an object.
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  return body as Record<string, unknown>;
}

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function trimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

// The database functions raise P0002 for "not found" and 22023 for invalid
// input; anything else is a server error.
export function statusForDatabaseError(code: string | undefined): number {
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

// Minimal shape of a Supabase RPC result, so handlers can take a fake in tests.
export type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
