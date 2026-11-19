export type AdminSessionPayload = {
  version: number;
  issuedAt: number;
  expiresAt: number;
};

export type AdminSessionValidation =
  | {
      valid: true;
      payload: AdminSessionPayload;
    }
  | {
      valid: false;
      reason: "missing" | "malformed" | "invalid" | "expired";
    };

function fromBase64Url(value: string): Uint8Array {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized +
    "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    character => character.charCodeAt(0),
  );
}

async function importSigningKey(
  sessionSecret: string,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );
}

export async function verifyAdminSession(
  token: unknown,
  sessionSecret: string,
): Promise<AdminSessionValidation> {
  if (
    typeof token !== "string" ||
    token.length === 0
  ) {
    return {
      valid: false,
      reason: "missing",
    };
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  const [encodedPayload, encodedSignature] = parts;

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;

  try {
    payloadBytes = fromBase64Url(encodedPayload);
    signatureBytes = fromBase64Url(encodedSignature);
  } catch {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  let signingKey: CryptoKey;

  try {
    signingKey =
      await importSigningKey(sessionSecret);
  } catch {
    return {
      valid: false,
      reason: "invalid",
    };
  }

  const signatureValid =
    await crypto.subtle.verify(
      "HMAC",
      signingKey,
      signatureBytes,
      new TextEncoder().encode(encodedPayload),
    );

  if (!signatureValid) {
    return {
      valid: false,
      reason: "invalid",
    };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    );
  } catch {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  const session =
    payload as Record<string, unknown>;

  if (
    session.version !== 1 ||
    typeof session.issuedAt !== "number" ||
    !Number.isFinite(session.issuedAt) ||
    typeof session.expiresAt !== "number" ||
    !Number.isFinite(session.expiresAt)
  ) {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  const now =
    Math.floor(Date.now() / 1000);

  if (session.expiresAt <= now) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  if (
    session.issuedAt > now ||
    session.expiresAt <= session.issuedAt
  ) {
    return {
      valid: false,
      reason: "invalid",
    };
  }

  return {
    valid: true,
    payload: {
      version: session.version,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    },
  };
}