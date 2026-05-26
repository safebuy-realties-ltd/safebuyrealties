/** Allowed risk flag codes (must match src/lib/risk-flags.ts on the frontend). */
export const RISK_FLAG_CODES = [
  "BOUNDARY_DISPUTE",
  "GOVT_ACQUISITION",
  "FLOOD_ZONE",
  "OMO_ONILE_ACTIVITY",
  "TITLE_ENCUMBRANCE",
  "LITIGATION_PENDING",
  "SURVEY_DISCREPANCY",
  "INCOMPLETE_DOCUMENTS",
] as const;

export type RiskFlagCode = (typeof RISK_FLAG_CODES)[number];

const ALLOWED = new Set<string>(RISK_FLAG_CODES);

export function assertValidRiskFlags(flags: string[]): void {
  const invalid = flags.filter((f) => !ALLOWED.has(f));
  if (invalid.length > 0) {
    throw new Error(`Invalid risk flag(s): ${invalid.join(", ")}`);
  }
}
