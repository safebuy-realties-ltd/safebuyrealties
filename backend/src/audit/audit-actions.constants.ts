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
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
