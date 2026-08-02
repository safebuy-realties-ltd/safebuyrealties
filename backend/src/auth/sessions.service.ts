import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import {
  AUTH_SESSION_ENTITY,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
  DEFAULT_REUSE_LEEWAY_MS,
  MAX_SESSIONS_SCANNED,
  REFRESH_FAILURE_MESSAGE,
} from "./sessions.constants";

/**
 * Server-side sessions with rotating refresh tokens, which is the half of authentication this
 * application has never had.
 *
 * **What was wrong.** A seven-day JWT in a cookie, no server record, and logout that clears the
 * cookie and nothing else. Nothing could revoke a token: not the user, not an administrator, not a
 * KYC rejection, not the person whose laptop was taken. It stayed valid for its full week wherever
 * a copy of it existed.
 *
 * **Where a session is stored, and why it is not a new table.** In `AuditLog`, one row per session
 * family, `entity: "AuthSession"`, `entityId` the family id, `actorId` the user. This repository
 * shares one cloud Postgres between local development, previews and production, so a migration is a
 * scheduled event with the client rather than something a story does; E5-S1 put its lockout counter
 * here for the same reason and this follows it. The mutable half of a session lives in the `after`
 * column, which is `Json?`, so rotation is one indexed update.
 *
 * That reuse has a real cost and it should be said out loud: `AuditLog` reads as append-only
 * everywhere else in this codebase, and these rows are written and then updated. The row is still
 * the truth about the session at all times, and `AuditAction.SESSION_REVOKED` and
 * `SESSION_REUSE_DETECTED` are separate append-only rows so the history of a revocation survives
 * even though the session row itself moves. When a maintenance window exists, an `auth_sessions`
 * table with a unique index on the token hash is the right home, and moving is a copy rather than a
 * redesign.
 *
 * **Unlike `AuditService.log`, a failed write here is fatal.** Audit writes are swallowed on purpose
 * so a logging problem cannot take a feature down. A session write that is swallowed hands the
 * caller a refresh token that no row backs, and they are signed out fifteen minutes later with no
 * way to recover. So the issue and rotate paths go to `prisma.auditLog` directly and let the error
 * out. The alert paths go through `AuditService` and stay best effort, because failing to record
 * that something happened must not stop the response that acts on it.
 *
 * **Token shape.** `<familyId>.<secret>`, the secret 32 bytes of `randomBytes` in base64url. The
 * family id travels in the token so the lookup is one indexed read on `entityId` rather than a scan
 * for a matching hash, which is what a table with a unique index on the hash would give and this one
 * cannot. Only the SHA-256 of the secret is stored, so the table is not a set of live credentials:
 * whoever reads the database gets hashes of tokens that expire in a week, not the tokens.
 */

export type SessionView = {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

export type IssuedSession = {
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
};

/** The mutable half of a session, as it sits in `AuditLog.after`. */
type SessionState = {
  tokenHash: string;
  /** The hash this one replaced, kept only so the leeway window can recognise a benign race. */
  previousTokenHash: string | null;
  rotatedAt: string | null;
  generation: number;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  device: string;
  ipAddress: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
};

export type RevocationReason =
  | "logout"
  | "user_revoked"
  | "password_changed"
  | "kyc_rejected"
  | "account_deactivated"
  | "token_reuse";

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Whether sessions are on.
   *
   * Read on every issue and every refresh rather than cached, so turning the flag off is a rollback
   * that takes effect on the next request instead of the next deploy. Criterion 6 asks for a
   * documented rollback and this is the whole of it: off means sign-in issues the seven-day token it
   * always did, the refresh route and the session list answer 404 through the feature guard, and any
   * refresh cookie already in a browser is simply never read again.
   */
  enabled(): boolean {
    return this.flags.isEnabled("auth_sessions");
  }

  private ttlDays(): number {
    const raw = Number(this.config.get<string>("REFRESH_TOKEN_TTL_DAYS"));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REFRESH_TOKEN_TTL_DAYS;
  }

  private leewayMs(): number {
    const raw = Number(this.config.get<string>("REFRESH_REUSE_LEEWAY_MS"));
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REUSE_LEEWAY_MS;
  }

  /** Opens a session and returns the only copy of the refresh token that will ever exist. */
  async issue(input: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<IssuedSession> {
    const familyId = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlDays() * 24 * 60 * 60 * 1000);

    const state: SessionState = {
      tokenHash: sha256(secret),
      previousTokenHash: null,
      rotatedAt: null,
      generation: 1,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
      device: describeDevice(input.userAgent),
      ipAddress: input.ipAddress ?? null,
      revokedAt: null,
      revokedReason: null,
    };

    await this.prisma.auditLog.create({
      data: {
        actorId: input.userId,
        action: AuditAction.SESSION_ISSUED,
        entity: AUTH_SESSION_ENTITY,
        entityId: familyId,
        after: state as unknown as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { familyId, refreshToken: `${familyId}.${secret}`, expiresAt };
  }

  /**
   * Spends a refresh token and returns its replacement.
   *
   * Every failure below throws the same exception with the same message, which is criterion 5. The
   * branches differ in what they do on the way out, not in what they say: a reuse revokes the family
   * and writes an alert, an expiry does neither, and the caller cannot tell which happened.
   */
  async rotate(
    presented: string,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ userId: string; familyId: string; refreshToken: string; expiresAt: Date }> {
    const parsed = parseToken(presented);
    if (!parsed) throw refusal();

    // `action` is pinned on every lookup below. The alert rows this service writes carry the same
    // entity and entityId, and without it a revocation note would shadow the session it is about.
    const row = await this.prisma.auditLog.findFirst({
      where: {
        entity: AUTH_SESSION_ENTITY,
        entityId: parsed.familyId,
        action: AuditAction.SESSION_ISSUED,
      },
    });
    const state = readState(row?.after);
    if (!row?.actorId || !state) throw refusal();
    if (state.revokedAt) throw refusal();
    if (new Date(state.expiresAt) <= new Date()) throw refusal();

    const presentedHash = sha256(parsed.secret);

    if (!constantTimeEquals(presentedHash, state.tokenHash)) {
      // A token that was current one rotation ago, presented while the tabs were racing, is the
      // ordinary case rather than an attack. Outside the window it is the definition of reuse.
      const withinLeeway =
        state.previousTokenHash !== null &&
        constantTimeEquals(presentedHash, state.previousTokenHash) &&
        state.rotatedAt !== null &&
        Date.now() - new Date(state.rotatedAt).getTime() <= this.leewayMs();
      if (!withinLeeway) {
        await this.revokeFamily(row.id, state, "token_reuse");
        await this.audit.log({
          actorId: row.actorId,
          action: AuditAction.SESSION_REUSE_DETECTED,
          entity: AUTH_SESSION_ENTITY,
          entityId: parsed.familyId,
          after: { generation: state.generation, device: state.device },
          ipAddress: context.ipAddress ?? null,
        });
        this.logger.warn(
          `Refresh token reuse on session ${parsed.familyId}; the family is revoked. Either a ` +
            `token leaked or a client is replaying one. The token is not in this line.`,
        );
      }
      throw refusal();
    }

    const now = new Date();
    const secret = randomBytes(32).toString("base64url");
    const next: SessionState = {
      ...state,
      tokenHash: sha256(secret),
      previousTokenHash: state.tokenHash,
      rotatedAt: now.toISOString(),
      generation: state.generation + 1,
      lastSeenAt: now.toISOString(),
      ipAddress: context.ipAddress ?? state.ipAddress,
    };
    await this.prisma.auditLog.update({
      where: { id: row.id },
      data: { after: next as unknown as Prisma.InputJsonValue },
    });

    return {
      userId: row.actorId,
      familyId: parsed.familyId,
      refreshToken: `${parsed.familyId}.${secret}`,
      expiresAt: new Date(state.expiresAt),
    };
  }

  /**
   * Whether an access token's session is still good.
   *
   * Called on every authenticated request once the flag is on, which is what makes revocation mean
   * anything before the access token expires on its own. It is one indexed read next to the user
   * lookup that already runs there. A token minted before this story has no session id at all and
   * skips it, which is why an old cookie keeps working through the rollout.
   */
  async isLive(familyId: string): Promise<boolean> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        entity: AUTH_SESSION_ENTITY,
        entityId: familyId,
        action: AuditAction.SESSION_ISSUED,
      },
      select: { after: true },
    });
    const state = readState(row?.after);
    if (!state || state.revokedAt) return false;
    return new Date(state.expiresAt) > new Date();
  }

  /** The user's live sessions, newest first, with the one they are asking from marked. */
  async list(userId: string, currentFamilyId?: string | null): Promise<SessionView[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: AUTH_SESSION_ENTITY, actorId: userId, action: AuditAction.SESSION_ISSUED },
      orderBy: { createdAt: "desc" },
      take: MAX_SESSIONS_SCANNED,
      select: { entityId: true, after: true },
    });
    const now = new Date();
    return rows
      .map((row) => ({ entityId: row.entityId, state: readState(row.after) }))
      .filter(
        (row): row is { entityId: string; state: SessionState } =>
          row.state !== null && !row.state.revokedAt && new Date(row.state.expiresAt) > now,
      )
      .map(({ entityId, state }) => ({
        id: entityId,
        device: state.device,
        ipAddress: state.ipAddress,
        createdAt: state.issuedAt,
        lastSeenAt: state.lastSeenAt,
        expiresAt: state.expiresAt,
        current: entityId === currentFamilyId,
      }));
  }

  /**
   * Revokes one session belonging to one user.
   *
   * The ownership check is part of the lookup rather than a step after it, so there is no window in
   * which the row is read and then written on behalf of somebody who does not own it, and a session
   * id that belongs to another account is indistinguishable from one that never existed.
   */
  async revoke(userId: string, familyId: string, reason: RevocationReason): Promise<boolean> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        entity: AUTH_SESSION_ENTITY,
        entityId: familyId,
        actorId: userId,
        action: AuditAction.SESSION_ISSUED,
      },
    });
    const state = readState(row?.after);
    if (!row || !state || state.revokedAt) return false;
    await this.revokeFamily(row.id, state, reason);
    await this.audit.log({
      actorId: userId,
      action: AuditAction.SESSION_REVOKED,
      entity: AUTH_SESSION_ENTITY,
      entityId: familyId,
      after: { reason, device: state.device },
    });
    return true;
  }

  /**
   * Ends the session a refresh token belongs to, which is what logout needs.
   *
   * The token is proof of ownership on its own, so this needs no access token and no user id, and
   * that is the point: logout has to work when the access token has already expired. The secret is
   * still checked, so holding somebody else's family id is not enough to sign them out.
   *
   * Silent when the token is bad or the session is already over. Nothing useful can be said to a
   * caller who is being signed out either way, and answering "no such session" would tell whoever
   * is asking which family ids exist.
   */
  async revokePresented(presented: string, reason: RevocationReason): Promise<boolean> {
    const parsed = parseToken(presented);
    if (!parsed) return false;
    const row = await this.prisma.auditLog.findFirst({
      where: {
        entity: AUTH_SESSION_ENTITY,
        entityId: parsed.familyId,
        action: AuditAction.SESSION_ISSUED,
      },
    });
    const state = readState(row?.after);
    if (!row || !state || state.revokedAt) return false;

    const presentedHash = sha256(parsed.secret);
    const matches =
      constantTimeEquals(presentedHash, state.tokenHash) ||
      (state.previousTokenHash !== null &&
        constantTimeEquals(presentedHash, state.previousTokenHash));
    if (!matches) return false;

    await this.revokeFamily(row.id, state, reason);
    await this.audit.log({
      actorId: row.actorId,
      action: AuditAction.SESSION_REVOKED,
      entity: AUTH_SESSION_ENTITY,
      entityId: parsed.familyId,
      after: { reason, device: state.device },
    });
    return true;
  }

  /**
   * Revokes every session a user has, optionally sparing the one making the request.
   *
   * This is criterion 4's engine. The callers are the events that mean the account's credentials or
   * standing changed underneath whoever is holding a token for it: activation sets a password,
   * a KYC rejection withdraws standing, deactivation withdraws the account. Password change and
   * password reset belong here too and neither endpoint exists yet; E5-S3 builds them and calling
   * this is the whole of its obligation.
   */
  async revokeAllForUser(
    userId: string,
    reason: RevocationReason,
    options: { exceptFamilyId?: string | null } = {},
  ): Promise<number> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: AUTH_SESSION_ENTITY, actorId: userId, action: AuditAction.SESSION_ISSUED },
      orderBy: { createdAt: "desc" },
      take: MAX_SESSIONS_SCANNED,
    });

    let revoked = 0;
    for (const row of rows) {
      if (options.exceptFamilyId && row.entityId === options.exceptFamilyId) continue;
      const state = readState(row.after);
      if (!state || state.revokedAt) continue;
      await this.revokeFamily(row.id, state, reason);
      revoked += 1;
    }

    if (revoked > 0) {
      await this.audit.log({
        actorId: userId,
        action: AuditAction.SESSION_REVOKED,
        entity: AUTH_SESSION_ENTITY,
        entityId: userId,
        after: { reason, revoked, scope: "all" },
      });
      this.logger.log(`Revoked ${revoked} session(s) for user ${userId}: ${reason}.`);
    }
    return revoked;
  }

  /**
   * Marks a family dead and clears both hashes in the same write.
   *
   * Clearing them matters: a revoked family that still carries the hash of a live-looking token
   * leaves something for a later bug to match against, and there is nothing left to be done with
   * them once the session is over.
   */
  private async revokeFamily(
    rowId: string,
    state: SessionState,
    reason: RevocationReason,
  ): Promise<void> {
    const dead: SessionState = {
      ...state,
      tokenHash: "",
      previousTokenHash: null,
      revokedAt: new Date().toISOString(),
      revokedReason: reason,
    };
    await this.prisma.auditLog.update({
      where: { id: rowId },
      data: { after: dead as unknown as Prisma.InputJsonValue },
    });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Both arguments here are hex digests of the same length, so length alone leaks nothing. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function refusal(): UnauthorizedException {
  return new UnauthorizedException(REFRESH_FAILURE_MESSAGE);
}

function parseToken(presented: string): { familyId: string; secret: string } | null {
  if (typeof presented !== "string") return null;
  const dot = presented.indexOf(".");
  if (dot <= 0 || dot === presented.length - 1) return null;
  const familyId = presented.slice(0, dot);
  const secret = presented.slice(dot + 1);
  // The family id is a uuid and goes straight into a query, so it is checked in shape before it
  // gets there rather than trusted because it came out of a cookie we set.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familyId))
    return null;
  if (!/^[A-Za-z0-9_-]{16,}$/.test(secret)) return null;
  return { familyId, secret };
}

/**
 * Reads the session out of a `Json?` column without trusting it.
 *
 * The column is typed as "any JSON" by Prisma and holds other shapes for other entities, so every
 * field is checked. A row that does not parse is treated as no session at all, which fails closed.
 */
function readState(value: unknown): SessionState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.tokenHash !== "string") return null;
  if (typeof raw.expiresAt !== "string" || Number.isNaN(Date.parse(raw.expiresAt))) return null;
  if (typeof raw.issuedAt !== "string") return null;
  return {
    tokenHash: raw.tokenHash,
    previousTokenHash: typeof raw.previousTokenHash === "string" ? raw.previousTokenHash : null,
    rotatedAt: typeof raw.rotatedAt === "string" ? raw.rotatedAt : null,
    generation: typeof raw.generation === "number" ? raw.generation : 1,
    issuedAt: raw.issuedAt,
    expiresAt: raw.expiresAt,
    lastSeenAt: typeof raw.lastSeenAt === "string" ? raw.lastSeenAt : raw.issuedAt,
    device: typeof raw.device === "string" ? raw.device : "Unknown device",
    ipAddress: typeof raw.ipAddress === "string" ? raw.ipAddress : null,
    revokedAt: typeof raw.revokedAt === "string" ? raw.revokedAt : null,
    revokedReason: typeof raw.revokedReason === "string" ? raw.revokedReason : null,
  };
}

/**
 * A short label for the session list, so a person can recognise which one to end.
 *
 * The whole user agent is not stored. It is a fingerprint, it is supplied by the caller, and the
 * question the list has to answer is "is this the phone or the office laptop", which two words
 * cover. No dependency: a user agent parser is a large moving table of strings, and the failure mode
 * here is a slightly wrong label rather than a wrong decision.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  // Bounded before any regex touches it. A user agent is caller-supplied and unbounded, and these
  // patterns are scanned over the whole string.
  const ua = userAgent.slice(0, 400);
  const platform = firstMatch(ua, PLATFORMS) ?? "Unknown";
  const browser = firstMatch(ua, BROWSERS) ?? "Unknown browser";
  return `${browser} on ${platform}`;
}

const PLATFORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad/i, "iOS"],
  [/Android/i, "Android"],
  [/Macintosh|Mac OS X/i, "macOS"],
  [/Windows/i, "Windows"],
  [/Linux/i, "Linux"],
];

/** Order matters: Edge and Opera both claim to be Chrome, and Chrome claims to be Safari. */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//i, "Edge"],
  [/OPR\//i, "Opera"],
  [/Chrome\//i, "Chrome"],
  [/Firefox\//i, "Firefox"],
  [/Safari\//i, "Safari"],
];

function firstMatch(value: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label;
  }
  return null;
}
