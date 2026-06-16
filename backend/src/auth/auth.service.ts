import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole, ProfessionalType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./jwt.strategy";

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
  ) {}

  private userPublic(user: {
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
    };
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
        user: this.userPublic(user),
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException("Invalid email or password");
    if (!user.isActive) throw new UnauthorizedException("Account is deactivated");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");
    const accessToken = await this.signToken(user);
    return {
      data: {
        accessToken,
        user: this.userPublic(user),
      },
    };
  }

  async me(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return { data: this.userPublic(user) };
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
        user: this.userPublic(user),
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
