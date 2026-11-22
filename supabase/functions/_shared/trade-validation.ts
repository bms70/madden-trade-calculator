// Trade payload validation, shared by accept-trade and review-trade.
// The trade checks are moved unchanged from accept-trade (v1.5.0); v2.0 adds
// the league fields. No Deno or Supabase APIs here (tested in Node).

import { trimmedString, uuidPattern } from "./http.ts";

// Accepted Web Release / Ruleset pairs from Web v2.0.
//   v2.0 / v4.4   league trades (requires the league fields)
//   v1.5.0 / v4.4 accepted during the switchover window only, so open v1.5.0
//                 tabs don't fail; logged without a league, then swept into
//                 the main league as pre-league. Removed about a week after
//                 launch (spec section 7).
// v1.4.0 / v4.2 is no longer accepted.
export const SUPPORTED_RELEASES: Record<string, string> = {
  "v1.5.0": "v4.4",
  "v2.0": "v4.4",
};

export const LEAGUE_RELEASE = "v2.0";

const allowedVerdicts = new Set(["FAIR", "QUESTIONABLE", "UNFAIR", "LEAGUE-BREAKING"]);
const allowedModes = new Set(["DRAFT_ONLY", "POSITIVE_PLAYER_TIE", "NO_ELIGIBLE_PLAYER", "DIRECTIONAL"]);
const allowedProtectionTiers = new Set(["STANDARD", "CORNERSTONE", "ELITE_QB"]);

// The fields stored for every trade (the accept-trade v1.5.0 insert list).
export const TRADE_FIELDS = [
  "web_release",
  "ruleset_version",
  "user_team_assets",
  "cpu_team_assets",
  "user_raw_value",
  "cpu_raw_value",
  "user_adjusted_value",
  "cpu_adjusted_value",
  "adjusted_gap",
  "verdict",
  "evaluation_mode",
  "protection_tier",
  "required_target",
  "fair_maximum",
  "trade_intelligence",
  "suggested_correction",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssetArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 6;
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

export type TradeValidation =
  | { valid: true; trade: Record<string, unknown> }
  | { valid: false; message: string };

export function validateTradePayload(
  value: unknown,
  supportedReleases: Record<string, string> = SUPPORTED_RELEASES,
): TradeValidation {
  if (!isPlainObject(value)) {
    return { valid: false, message: "Trade payload must be an object." };
  }

  const trade = value;

  if (
    typeof trade.web_release !== "string" ||
    !Object.hasOwn(supportedReleases, trade.web_release)
  ) {
    return { valid: false, message: "Unsupported Web Release version." };
  }

  if (trade.ruleset_version !== supportedReleases[trade.web_release]) {
    return { valid: false, message: "Unsupported Ruleset version." };
  }

  if (!isAssetArray(trade.user_team_assets)) {
    return { valid: false, message: "User Team must contain between one and six assets." };
  }

  if (!isAssetArray(trade.cpu_team_assets)) {
    return { valid: false, message: "CPU Team must contain between one and six assets." };
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
      return { valid: false, message: `${field} must be a finite number.` };
    }
  }

  if (
    (trade.user_raw_value as number) < 0 ||
    (trade.cpu_raw_value as number) < 0 ||
    (trade.user_adjusted_value as number) <= 0 ||
    (trade.cpu_adjusted_value as number) <= 0 ||
    (trade.adjusted_gap as number) < 0
  ) {
    return { valid: false, message: "Trade values are incomplete or invalid." };
  }

  if (typeof trade.verdict !== "string" || !allowedVerdicts.has(trade.verdict)) {
    return { valid: false, message: "Trade verdict is invalid or incomplete." };
  }

  if (typeof trade.evaluation_mode !== "string" || !allowedModes.has(trade.evaluation_mode)) {
    return { valid: false, message: "Evaluation mode is invalid or incomplete." };
  }

  if (
    trade.protection_tier !== null &&
    (typeof trade.protection_tier !== "string" || !allowedProtectionTiers.has(trade.protection_tier))
  ) {
    return { valid: false, message: "Protection tier is invalid." };
  }

  if (!isOptionalFiniteNumber(trade.required_target)) {
    return { valid: false, message: "Required Target is invalid." };
  }

  if (!isOptionalFiniteNumber(trade.fair_maximum)) {
    return { valid: false, message: "FAIR Maximum is invalid." };
  }

  if (!Array.isArray(trade.trade_intelligence)) {
    return { valid: false, message: "Trade Intelligence must be an array." };
  }

  if (typeof trade.suggested_correction !== "string" || trade.suggested_correction.length > 2000) {
    return { valid: false, message: "Suggested Correction is invalid." };
  }

  return { valid: true, trade };
}

// Only the stored trade fields, in a fixed order (league fields stay out of
// the frozen evaluation).
export function tradeForStorage(trade: Record<string, unknown>): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const field of TRADE_FIELDS) stored[field] = trade[field];
  return stored;
}

export type LeagueFields = {
  leagueName: string;
  submittingTeamId: string;
  otherTeamId: string;
  submitterName: string;
  submitterNote: string | null;
};

export type LeagueValidation =
  | { valid: true; fields: LeagueFields }
  | { valid: false; message: string };

// The league fields a v2.0 snapshot adds (spec section 7).
export function validateLeagueFields(body: Record<string, unknown>): LeagueValidation {
  if (body.mode !== "LEAGUE") {
    return { valid: false, message: "Only league trades can be logged." };
  }

  const leagueName = trimmedString(body.league_name, 100);
  if (!leagueName) {
    return { valid: false, message: "League name is required." };
  }

  const submittingTeamId = typeof body.submitting_team_id === "string" ? body.submitting_team_id : "";
  const otherTeamId = typeof body.other_team_id === "string" ? body.other_team_id : "";

  if (!uuidPattern.test(submittingTeamId) || !uuidPattern.test(otherTeamId)) {
    return { valid: false, message: "Choose your team and the other team." };
  }

  if (submittingTeamId.toLowerCase() === otherTeamId.toLowerCase()) {
    return { valid: false, message: "Choose two different teams." };
  }

  const submitterName = trimmedString(body.submitter_name, 60);
  if (!submitterName) {
    return { valid: false, message: "Your name must be 1 to 60 characters." };
  }

  let submitterNote: string | null = null;

  if (body.submitter_note !== undefined && body.submitter_note !== null) {
    if (typeof body.submitter_note !== "string") {
      return { valid: false, message: "The note must be text." };
    }
    const note = body.submitter_note.trim();
    if (note.length > 500) {
      return { valid: false, message: "The note must be 500 characters or fewer." };
    }
    submitterNote = note.length > 0 ? note : null;
  }

  return {
    valid: true,
    fields: { leagueName, submittingTeamId, otherTeamId, submitterName, submitterNote },
  };
}
