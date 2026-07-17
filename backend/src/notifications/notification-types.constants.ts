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
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationEntityType = {
  Listing: "Listing",
  Transaction: "Transaction",
  Task: "Task",
  VerificationStep: "VerificationStep",
  KycRecord: "KycRecord",
  ProfessionalProfile: "ProfessionalProfile",
} as const;

export type NotificationEntityTypeValue =
  (typeof NotificationEntityType)[keyof typeof NotificationEntityType];
