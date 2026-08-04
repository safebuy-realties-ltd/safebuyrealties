export const AuditAction = {
  LISTING_CREATED: "LISTING_CREATED",
  LISTING_STATUS_CHANGED: "LISTING_STATUS_CHANGED",
  LISTING_REJECTED: "LISTING_REJECTED",
  VERIFICATION_STEP_ASSIGNED: "VERIFICATION_STEP_ASSIGNED",
  VERIFICATION_STEP_COMPLETED: "VERIFICATION_STEP_COMPLETED",
  TASK_CREATED: "TASK_CREATED",
  TASK_STATUS_CHANGED: "TASK_STATUS_CHANGED",
  PAYMENT_INITIATED: "PAYMENT_INITIATED",
  PAYMENT_SUCCEEDED: "PAYMENT_SUCCEEDED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  VERIFICATION_STEP_ACCEPTED: "VERIFICATION_STEP_ACCEPTED",
  VERIFICATION_REVISION_REQUESTED: "VERIFICATION_REVISION_REQUESTED",
  PROFESSIONAL_CREDENTIAL_VERIFIED: "PROFESSIONAL_CREDENTIAL_VERIFIED",
  PROFESSIONAL_CREDENTIAL_REJECTED: "PROFESSIONAL_CREDENTIAL_REJECTED",
  PLATFORM_CONFIG_UPDATED: "PLATFORM_CONFIG_UPDATED",
  PRIVATE_DOCUMENT_READ: "PRIVATE_DOCUMENT_READ",
  PRIVATE_DOCUMENT_READ_DENIED: "PRIVATE_DOCUMENT_READ_DENIED",
  /** A SUPER_ADMIN passed a privilege check it holds by bypass rather than by grant. */
  SUPER_ADMIN_PRIVILEGE_BYPASS: "SUPER_ADMIN_PRIVILEGE_BYPASS",
  /**
   * A feature was switched on or off at runtime. Overrides are process-local and leave no other
   * trace, so this row is the only durable record that the change happened at all.
   */
  FEATURE_FLAG_OVERRIDE_SET: "FEATURE_FLAG_OVERRIDE_SET",
  FEATURE_FLAG_OVERRIDE_CLEARED: "FEATURE_FLAG_OVERRIDE_CLEARED",
  FEATURE_FLAG_KILL_SWITCH_ARMED: "FEATURE_FLAG_KILL_SWITCH_ARMED",
  FEATURE_FLAG_KILL_SWITCH_DISARMED: "FEATURE_FLAG_KILL_SWITCH_DISARMED",
  /**
   * The three E5-S1 writes. Unlike every action above them these are also read back: they are the
   * counter the account lockout runs on, which is how it survives a restart without a migration.
   * See src/auth/login-attempts.service.ts. They are keyed by hash, never by email or address.
   */
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED",
  LOGIN_LOCKED_OUT: "LOGIN_LOCKED_OUT",
  /**
   * E5-S5. `SESSION_ISSUED` is the odd one in this file: the row it writes is not only read back but
   * updated in place, because it is the session itself rather than a note that a session happened.
   * One row per family, `entity` "AuthSession", `entityId` the family id, state in `after`. The other
   * two are ordinary append-only notes, so the history of a revocation outlives the session row.
   * See src/auth/sessions.service.ts for why this lives here instead of in a table of its own.
   */
  SESSION_ISSUED: "SESSION_ISSUED",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_REUSE_DETECTED: "SESSION_REUSE_DETECTED",
  /**
   * E1-S1. The three ways a listing due diligence case moves. A buyer pays for a verdict and acts on
   * it, so the question "who said this case was complete, and when" has to have an answer that does
   * not depend on the case row, which only ever holds the latest state.
   */
  DD_CASE_STATUS_CHANGED: "DD_CASE_STATUS_CHANGED",
  DD_CASE_ASSIGNED: "DD_CASE_ASSIGNED",
  DD_CASE_REPORT_SUBMITTED: "DD_CASE_REPORT_SUBMITTED",
  /**
   * E1-S3. One row each time a download link is handed out, `entity` "DueDiligenceReport",
   * `entityId` the storage key, the order and the expiry in `after`.
   *
   * PRIVATE_DOCUMENT_READ above records the fetch, which is not the same event. A link is issued
   * to somebody who asked for one; whether they then used it, used it four times, or never used it
   * is a separate fact. The report is the thing the buyer paid for, so "who was given the means to
   * read this, and when did that permission run out" has to be answerable on its own.
   */
  DD_REPORT_LINK_ISSUED: "DD_REPORT_LINK_ISSUED",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
