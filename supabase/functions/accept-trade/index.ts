import { withSupabase } from "npm:@supabase/server@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedVerdicts = new Set([
  "FAIR",
  "QUESTIONABLE",
  "UNFAIR",
  "LEAGUE-BREAKING",
]);

const allowedModes = new Set([
  "DRAFT_ONLY",
  "POSITIVE_PLAYER_TIE",
  "NO_ELIGIBLE_PLAYER",
  "DIRECTIONAL",
]);

const allowedProtectionTiers = new Set([
  "STANDARD",
  "CORNERSTONE",
  "ELITE_QB",
]);

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAssetArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 6;
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function validateTradePayload(
  value: unknown,
): { valid: true; trade: Record<string, unknown> } | {
  valid: false;
  message: string;
} {
  if (!isPlainObject(value)) {
    return {
      valid: false,
      message: "Trade payload must be an object.",
    };
  }

  const trade = value;

  // Accepted Web Release / Ruleset pairs. v1.4.0 / v4.2 stays accepted so
  // this function can be deployed before the v1.5.0 site goes live.
  const supportedReleases: Record<string, string> = {
    "v1.4.0": "v4.2",
    "v1.5.0": "v4.4",
  };

  if (
    typeof trade.web_release !== "string" ||
    !Object.hasOwn(supportedReleases, trade.web_release)
  ) {
    return {
      valid: false,
      message: "Unsupported Web Release version.",
    };
  }

  if (trade.ruleset_version !== supportedReleases[trade.web_release]) {
    return {
      valid: false,
      message: "Unsupported Ruleset version.",
    };
  }

  if (!isAssetArray(trade.user_team_assets)) {
    return {
      valid: false,
      message: "User Team must contain between one and six assets.",
    };
  }

  if (!isAssetArray(trade.cpu_team_assets)) {
    return {
      valid: false,
      message: "CPU Team must contain between one and six assets.",
    };
  }

  const requiredNumbers = [
    "user_raw_value",
    "cpu_raw_value",
    "user_adjusted_value",
    "cpu_adjusted_value",
    "adjusted_gap",
  ];

  for (const field of requiredNumbers) {
    if (!isFiniteNumber(trade[field])) {
      return {
        valid: false,
        message: `${field} must be a finite number.`,
      };
    }
  }

  if (
    (trade.user_raw_value as number) < 0 ||
    (trade.cpu_raw_value as number) < 0 ||
    (trade.user_adjusted_value as number) <= 0 ||
    (trade.cpu_adjusted_value as number) <= 0 ||
    (trade.adjusted_gap as number) < 0
  ) {
    return {
      valid: false,
      message: "Trade values are incomplete or invalid.",
    };
  }

  if (
    typeof trade.verdict !== "string" ||
    !allowedVerdicts.has(trade.verdict)
  ) {
    return {
      valid: false,
      message: "Trade verdict is invalid or incomplete.",
    };
  }

  if (
    typeof trade.evaluation_mode !== "string" ||
    !allowedModes.has(trade.evaluation_mode)
  ) {
    return {
      valid: false,
      message: "Evaluation mode is invalid or incomplete.",
    };
  }

  if (
    trade.protection_tier !== null &&
    (
      typeof trade.protection_tier !== "string" ||
      !allowedProtectionTiers.has(trade.protection_tier)
    )
  ) {
    return {
      valid: false,
      message: "Protection tier is invalid.",
    };
  }

  if (!isOptionalFiniteNumber(trade.required_target)) {
    return {
      valid: false,
      message: "Required Target is invalid.",
    };
  }

  if (!isOptionalFiniteNumber(trade.fair_maximum)) {
    return {
      valid: false,
      message: "FAIR Maximum is invalid.",
    };
  }

  if (!Array.isArray(trade.trade_intelligence)) {
    return {
      valid: false,
      message: "Trade Intelligence must be an array.",
    };
  }

  if (
    typeof trade.suggested_correction !== "string" ||
    trade.suggested_correction.length > 2000
  ) {
    return {
      valid: false,
      message: "Suggested Correction is invalid.",
    };
  }

  return {
    valid: true,
    trade,
  };
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, context): Promise<Response> => {
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
        error: "Method not allowed.",
      },
      405,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Request body must contain valid JSON.",
      },
      400,
    );
  }

  const validation = validateTradePayload(body);

  if (!validation.valid) {
    return jsonResponse(
      {
        ok: false,
        error: validation.message,
      },
      400,
    );
  }

  const trade = validation.trade;

  const { data, error } = await context.supabaseAdmin
    .from("trades")
    .insert({
      web_release: trade.web_release,
      ruleset_version: trade.ruleset_version,
      user_team_assets: trade.user_team_assets,
      cpu_team_assets: trade.cpu_team_assets,
      user_raw_value: trade.user_raw_value,
      cpu_raw_value: trade.cpu_raw_value,
      user_adjusted_value: trade.user_adjusted_value,
      cpu_adjusted_value: trade.cpu_adjusted_value,
      adjusted_gap: trade.adjusted_gap,
      verdict: trade.verdict,
      evaluation_mode: trade.evaluation_mode,
      protection_tier: trade.protection_tier,
      required_target: trade.required_target,
      fair_maximum: trade.fair_maximum,
      trade_intelligence: trade.trade_intelligence,
      suggested_correction: trade.suggested_correction,
    })
    .select("id, trade_number, accepted_at")
    .single();

  if (error) {
    console.error("Trade insertion failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Trade could not be logged. No historical record was created.",
      },
      500,
    );
  }

  return jsonResponse({
    ok: true,
    trade: {
      id: data.id,
      tradeNumber: data.trade_number,
      acceptedAt: data.accepted_at,
    },
  });
    },
  ),
};