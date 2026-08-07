export const ESCROW_STATUS = {
  AWAITING_FUNDS: "AWAITING_FUNDS",
  HELD: "HELD",
  RELEASED: "RELEASED",
  REFUNDED: "REFUNDED",
} as const;
export const PAYOUT_STATUS = {
  PENDING: "PENDING",
  INITIATED: "INITIATED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export const PLATFORM_FEE_RATE = 0.05;
export type ReleaseCondition = { code: string; label: string };
export const DEFAULT_RELEASE_CONDITIONS: ReleaseCondition[] = [
  { code: "DD_COMPLETE", label: "Due diligence complete" },
  { code: "POA_EXECUTED", label: "Power of Attorney executed" },
  { code: "PROPERTY_RESERVED", label: "Property reserved under offer" },
];
