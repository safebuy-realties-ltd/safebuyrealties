import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole, ProfessionalType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./jwt.strategy";
import { portalAcceptsRole } from "../common/auth-portals";
import { PermissionsService } from "../permissions/permissions.service";
import { LoginAttemptsService } from "./login-attempts.service";
import type { Permission } from "../common/permissions";

const SELF_REGISTER_ROLES: UserRole[] = [
  UserRole.BUYER,
  UserRole.SELLER,
  UserRole.PROFESSIONAL,
];

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private permissions: PermissionsService,
    private readonly loginAttempts: LoginAttemptsService,
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
      adminRole: user.adminRole
        ? { id: user.adminRole.id, name: user.adminRole.name }
        : null,
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
    return this.userPublic(
      { ...user, adminRole: withRole?.adminRole ?? null },
      permissions,
    );
  }

  async register(dto: RegisterDto) {
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

    const accessToken = await this.signToken(user);
    return {
      data: {
        accessToken,
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
  async login(dto: LoginDto, ip?: string) {
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
    const accessToken = await this.signToken(user);
    return {
      data: {
        accessToken,
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

  async activateAccount(token: string, password: string) {
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

    const accessToken = await this.signToken(user);
    return {
      data: {
        accessToken,
        user: await this.withPermissions(user),
      },
    };
  }

  private signToken(user: {
    id: string;
    email: string;
    role: UserRole;
    professionalType: ProfessionalType | null;
  }) {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      professionalType: user.professionalType,
    });
  }
}
