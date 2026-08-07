import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { UserRole, ProfessionalType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./jwt.strategy";
import { portalAcceptsRole } from "../common/auth-portals";
import { PermissionsService } from "../permissions/permissions.service";
import { LoginAttemptsService } from "./login-attempts.service";
import { SessionsService } from "./sessions.service";
import { DEFAULT_ACCESS_TOKEN_TTL, REFRESH_FAILURE_MESSAGE } from "./sessions.constants";
import type { Permission } from "../common/permissions";

const SELF_REGISTER_ROLES: UserRole[] = [UserRole.BUYER, UserRole.SELLER, UserRole.PROFESSIONAL];

/**
 * What an access token was worth before E5-S5, and what it goes back to being if the flag is turned
 * off. Seven days with nothing that can end it early. It is written here rather than left implicit
 * in the module's `signOptions` so the difference the flag makes is one line to read.
 */
const LEGACY_ACCESS_TOKEN_TTL = "7d";

/** What sign-in hands back. `refreshToken` is null whenever `auth_sessions` is off. */
export type IssuedCredentials = {
  accessToken: string;
  refreshToken: string | null;
  refreshExpiresAt: Date | null;
};

/** Where a sign-in came from, used to label the session in the list a person is shown. */
export type SignInContext = { ip?: string | null; userAgent?: string | null };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionsService,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService,
  ) {}

  private userPublic(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      professionalType: ProfessionalType | null;
      phone: string | null;
      isActive: boolean;
      publicId: string | null;
      createdAt: Date;
      adminRole?: { id: string; name: string } | null;
    },
    permissions: Permission[] = [],
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role.toLowerCase(),
      professionalType: user.professionalType,
      phone: user.phone,
      isActive: user.isActive,
      publicId: user.publicId,
      createdAt: user.createdAt.toISOString(),
      permissions,
      adminRole: user.adminRole ? { id: user.adminRole.id, name: user.adminRole.name } : null,
    };
  }

  private async withPermissions(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    professionalType: ProfessionalType | null;
    phone: string | null;
    isActive: boolean;
    publicId: string | null;
    createdAt: Date;
  }) {
    const [permissions, withRole] = await Promise.all([
      this.permissions.getEffectivePermissions(user.id, user.role),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { adminRole: { select: { id: true, name: true } } },
      }),
    ]);
    return this.userPublic({ ...user, adminRole: withRole?.adminRole ?? null }, permissions);
  }

  async register(dto: RegisterDto, context: SignInContext = {}) {
    if (!SELF_REGISTER_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        "Only buyer, seller, and professional accounts can self-register. Contact support for other roles.",
      );
    }
    if (dto.role === UserRole.PROFESSIONAL && !dto.professionalType) {
      throw new BadRequestException("professionalType is required for professional registration");
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("Email already registered");
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        ...(dto.professionalType ? { professionalType: dto.professionalType } : {}),
      },
    });

    if (dto.role === UserRole.PROFESSIONAL) {
      await this.prisma.professionalProfile.create({
        data: {
          userId: user.id,
          regulatoryBody: "",
          licenseNumber: "",
          verifiedStatus: "PENDING",
        },
      });
    }

    const credentials = await this.issueCredentials(user, context);
    return {
      data: {
        ...credentials,
        user: await this.withPermissions(user),
      },
    };
  }

  /**
   * The order of the first three lines is the whole of the enumeration argument.
   *
   * The attempt state is read and the lock is applied before the user is looked up, so a locked
   * response is identical whether the email belongs to an account or to nobody: same status, same
   * message, same Retry-After, and no bcrypt round to time. Doing it the other way round, checking
   * the lock only once an account is found, turns the lockout into an oracle that answers "does
   * this address have an account here" for anyone patient enough to trigger it.
   *
   * `ip` is the caller's address as Express reports it, which is only true if TRUST_PROXY_HOPS is
   * right for the deployment. See src/config/trust-proxy.ts.
   */
  async login(dto: LoginDto, ip?: string, userAgent?: string | null) {
    const attempts = await this.loginAttempts.check(dto.email, ip);
    this.loginAttempts.assertNotLocked(attempts);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.loginAttempts.recordFailure(dto.email, ip, attempts, null);
      throw new UnauthorizedException("Invalid email or password");
    }
    // Not counted as a failed attempt: the credential was never tested, and a deactivated account
    // cannot be broken into by guessing at it.
    if (!user.isActive) throw new UnauthorizedException("Account is deactivated");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.loginAttempts.recordFailure(dto.email, ip, attempts, user.id);
      throw new UnauthorizedException("Invalid email or password");
    }
    // Also not counted. The password was right; this is the wrong door, not a wrong key, and
    // counting it would let a buyer lock themselves out by bookmarking the staff login page.
    if (dto.portal && !portalAcceptsRole(dto.portal, user.role)) {
      throw new ForbiddenException(
        `This account cannot sign in through the ${dto.portal} portal. Use the login page for your role.`,
      );
    }
    await this.loginAttempts.recordSuccess(dto.email, ip, user.id);
    const credentials = await this.issueCredentials(user, { ip, userAgent });
    return {
      data: {
        ...credentials,
        user: await this.withPermissions(user),
      },
    };
  }

  async me(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return { data: await this.withPermissions(user) };
  }

  async getActivationPreview(token: string) {
    const record = await this.prisma.accountActivationToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new NotFoundException("Activation link is invalid or expired");
    }
    const user = record.user;
    return {
      data: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phone,
        buyerId: user.publicId,
      },
    };
  }

  /**
   * Setting a password through an activation link is a password change, and criterion 4 says a
   * password change ends every other session. It applies here even though this is usually the first
   * password an account has ever had: an activation token that reached the wrong hands could have
   * been redeemed already, and the person redeeming it now would have no way to see that or to undo
   * it. Revoking first and issuing second means the session this call returns is the only one left.
   */
  async activateAccount(token: string, password: string, context: SignInContext = {}) {
    const record = await this.prisma.accountActivationToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException("Activation link is invalid or expired");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.accountActivationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, isActive: true },
      });
    });

    await this.sessions.revokeAllForUser(user.id, "password_changed");
    const credentials = await this.issueCredentials(user, context);
    return {
      data: {
        ...credentials,
        user: await this.withPermissions(user),
      },
    };
  }

  /**
   * Trades a refresh token for a new pair.
   *
   * Deliberately thin. The rotation, the reuse detection and the single refusal message all live in
   * `SessionsService`; what belongs here is minting the access token that goes with the session it
   * hands back, and re-checking the user, because a session that outlived its account is a session
   * that must not be refreshed. The user check reuses the same refusal as everything else, so a
   * deactivated account does not learn that its token was otherwise fine.
   */
  async refresh(presentedToken: string, context: SignInContext): Promise<IssuedCredentials> {
    const rotated = await this.sessions.rotate(presentedToken, {
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });
    const user = await this.prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user?.isActive) {
      await this.sessions.revokeAllForUser(rotated.userId, "account_deactivated");
      throw new UnauthorizedException(REFRESH_FAILURE_MESSAGE);
    }
    return {
      accessToken: await this.signToken(user, rotated.familyId),
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  /**
   * Opens a session if sessions are on, and mints the access token either way.
   *
   * The whole of the flag's effect on sign-in is here. Off: one seven-day token and no refresh
   * token, exactly as before this story. On: a session row, a fifteen-minute token carrying its id,
   * and a refresh token the caller has to store somewhere the browser will send back.
   */
  private async issueCredentials(
    user: {
      id: string;
      email: string;
      role: UserRole;
      professionalType: ProfessionalType | null;
    },
    context: SignInContext,
  ): Promise<IssuedCredentials> {
    if (!this.sessions.enabled()) {
      return {
        accessToken: await this.signToken(user),
        refreshToken: null,
        refreshExpiresAt: null,
      };
    }
    const session = await this.sessions.issue({
      userId: user.id,
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });
    return {
      accessToken: await this.signToken(user, session.familyId),
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  /**
   * How long a freshly minted access token is good for.
   *
   * Fifteen minutes only means something when there is a session behind it that can be refreshed
   * and revoked. With the flag off there is neither, so a fifteen-minute token would simply sign
   * people out four times an hour with nothing gained. That is why the TTL follows the flag rather
   * than being set once in the module.
   */
  private accessTokenTtl(): JwtSignOptions["expiresIn"] {
    if (!this.sessions.enabled()) return LEGACY_ACCESS_TOKEN_TTL;
    const configured = this.config.get<string>("ACCESS_TOKEN_TTL")?.trim();
    if (!configured) return DEFAULT_ACCESS_TOKEN_TTL;
    // Checked here rather than left to the signing library, which throws on a value it cannot
    // parse. A typo in this variable would then turn every sign-in into a 500, which is a worse
    // outcome than a token that lives fifteen minutes instead of the five somebody meant.
    if (!/^\d+(ms|s|m|h|d)?$/.test(configured)) {
      this.logger.warn(
        `ACCESS_TOKEN_TTL="${configured}" is not a duration this understands, so it is being ` +
          `ignored and access tokens live ${DEFAULT_ACCESS_TOKEN_TTL}. Use a form like 15m or 900s.`,
      );
      return DEFAULT_ACCESS_TOKEN_TTL;
    }
    return configured as JwtSignOptions["expiresIn"];
  }

  private signToken(
    user: {
      id: string;
      email: string;
      role: UserRole;
      professionalType: ProfessionalType | null;
    },
    sid?: string,
  ) {
    return this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        professionalType: user.professionalType,
        ...(sid ? { sid } : {}),
      },
      { expiresIn: this.accessTokenTtl() },
    );
  }
}
