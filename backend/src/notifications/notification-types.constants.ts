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
  KYC_VERIFIED: "KYC_VERIFIED",
  KYC_REJECTED: "KYC_REJECTED",
  PROFESSIONAL_CREDENTIAL_VERIFIED: "PROFESSIONAL_CREDENTIAL_VERIFIED",
  PROFESSIONAL_CREDENTIAL_REJECTED: "PROFESSIONAL_CREDENTIAL_REJECTED",
  SAVED_LISTING_LIVE: "SAVED_LISTING_LIVE",
  SAVED_LISTING_UNDER_OFFER: "SAVED_LISTING_UNDER_OFFER",
  /**
   * E1-S1. A listing due diligence case changed hands or changed state. `Notification.type` is a
   * plain string column rather than an enum, so this entry needs no migration.
   */
  DD_CASE_STATUS_CHANGED: "DD_CASE_STATUS_CHANGED",
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationEntityType = {
  Listing: "Listing",
  Transaction: "Transaction",
  Task: "Task",
  VerificationStep: "VerificationStep",
  KycRecord: "KycRecord",
  ProfessionalProfile: "ProfessionalProfile",
  DueDiligenceOrder: "DueDiligenceOrder",
} as const;

export type NotificationEntityTypeValue =
  (typeof NotificationEntityType)[keyof typeof NotificationEntityType];
