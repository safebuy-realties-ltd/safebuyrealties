export const NotificationType = {
  LISTING_SUBMITTED: "LISTING_SUBMITTED",
  LISTING_VERIFIED: "LISTING_VERIFIED",
  LISTING_REJECTED: "LISTING_REJECTED",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  REPORT_SUBMITTED: "REPORT_SUBMITTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  DD_PAYMENT_SUCCEEDED: "DD_PAYMENT_SUCCEEDED",
  ESCROW_RELEASED: "ESCROW_RELEASED",
  ESCROW_REFUNDED: "ESCROW_REFUNDED",
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationEntityType = {
  Listing: "Listing",
  Transaction: "Transaction",
  Task: "Task",
  VerificationStep: "VerificationStep",
} as const;

export type NotificationEntityTypeValue =
  (typeof NotificationEntityType)[keyof typeof NotificationEntityType];
