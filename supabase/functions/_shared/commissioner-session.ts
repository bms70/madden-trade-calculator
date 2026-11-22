// Commissioner session tokens (Web v2.0). Same signing scheme as the v1 Admin
// session (_shared/admin-session.ts): base64url(JSON payload) "." base64url(
// HMAC-SHA256), keyed with ADMIN_SESSION_SECRET. Version 2 adds the league and
// role, so a token only works for the league it was issued for. v1 Admin
// tokens are rejected. No Deno or Supabase APIs here (tested in Node).

import { uuidPattern } from "./http.ts";

export const SESSION_MINUTES = 30;

export type CommissionerSessionPayload = {
  version: 2;
  role: "COMMISSIONER";
  leagueId: string;
  issuedAt: number;
  expiresAt: number;
};

export type CommissionerSessionValidation =
  | { valid: true; payload: CommissionerSessionPayload }
  | { valid: false; reason: "missing" | "malformed" | "invalid" | "expired" };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("bad base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function createCommissionerSession(
  secret: string,
  leagueId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  minutes: number = SESSION_MINUTES,
): Promise<{ token: string; expiresAt: string }> {
  const payload: CommissionerSessionPayload = {
    version: 2,
    role: "COMMISSIONER",
    leagueId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + minutes * 60,
  };

  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret, "sign"),
    new TextEncoder().encode(encodedPayload),
  );

  return {
    token: `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
  };
}

export async function verifyCommissionerSession(
  token: unknown,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<CommissionerSessionValidation> {
  if (typeof token !== "string" || token.length === 0) {
    return { valid: false, reason: "missing" };
  }

  if (token.length > 2048) {
    return { valid: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedPayload, encodedSignature] = parts;
  let payloadBytes: Uint8Array<ArrayBuffer>;
  let signatureBytes: Uint8Array<ArrayBuffer>;

  try {
    payloadBytes = fromBase64Url(encodedPayload);
    signatureBytes = fromBase64Url(encodedSignature);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  let signatureValid = false;

  try {
    signatureValid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret, "verify"),
      signatureBytes,
      new TextEncoder().encode(encodedPayload),
    );
  } catch {
    return { valid: false, reason: "invalid" };
  }

  if (!signatureValid) {
    return { valid: false, reason: "invalid" };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { valid: false, reason: "malformed" };
  }

  const session = payload as Record<string, unknown>;

  if (
    session.version !== 2 ||
    session.role !== "COMMISSIONER" ||
    typeof session.leagueId !== "string" ||
    !uuidPattern.test(session.leagueId) ||
    typeof session.issuedAt !== "number" ||
    !Number.isFinite(session.issuedAt) ||
    typeof session.expiresAt !== "number" ||
    !Number.isFinite(session.expiresAt)
  ) {
    return { valid: false, reason: "malformed" };
  }

  if (session.expiresAt <= nowSeconds) {
    return { valid: false, reason: "expired" };
  }

  if (session.issuedAt > nowSeconds + 60 || session.expiresAt <= session.issuedAt) {
    return { valid: false, reason: "invalid" };
  }

  return {
    valid: true,
    payload: {
      version: 2,
      role: "COMMISSIONER",
      leagueId: session.leagueId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    },
  };
}
