import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { UserRole, ProfessionalType, Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersQueryDto } from "./dto/list-users.query";
import { isInternalRole, isSuperAdmin } from "../common/user-roles";
import { SessionsService } from "../auth/sessions.service";

const STAFF_ASSIGNABLE_ROLES: UserRole[] = [UserRole.BUYER, UserRole.SELLER, UserRole.PROFESSIONAL];

const ADMIN_ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.STAFF,
  UserRole.BUYER,
  UserRole.SELLER,
  UserRole.PROFESSIONAL,
];

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  professionalType: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  adminRoleId: true,
  adminRole: { select: { id: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  private serializeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    professionalType: ProfessionalType | null;
    phone: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    adminRoleId?: string | null;
    adminRole?: { id: string; name: string } | null;
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
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      adminRoleId: user.adminRoleId ?? null,
      adminRole: user.adminRole ? { id: user.adminRole.id, name: user.adminRole.name } : null,
    };
  }

  private assertCanCreateUser(actor: JwtPayload, targetRole: UserRole) {
    if (!isInternalRole(actor.role)) {
      throw new ForbiddenException();
    }
    if (actor.role === UserRole.STAFF) {
      throw new ForbiddenException("Staff cannot create users");
    }
    if (actor.role === UserRole.ADMIN && targetRole !== UserRole.STAFF) {
      throw new ForbiddenException("Admins can only create staff users");
    }
  }

  private assertCanAssignRole(actor: JwtPayload, targetRole: UserRole) {
    if (targetRole === UserRole.ADMIN || targetRole === UserRole.SUPER_ADMIN) {
      if (!isSuperAdmin(actor.role)) {
        throw new ForbiddenException("Only super admins can assign admin roles");
      }
      return;
    }
    if (actor.role === UserRole.ADMIN && !ADMIN_ASSIGNABLE_ROLES.includes(targetRole)) {
      throw new ForbiddenException("Admins cannot assign this role");
    }
    if (actor.role === UserRole.STAFF && !STAFF_ASSIGNABLE_ROLES.includes(targetRole)) {
      throw new ForbiddenException("Staff cannot assign this role");
    }
  }

  private assertCanDeactivate(actor: JwtPayload, target: { id: string; role: UserRole }) {
    if (!isInternalRole(actor.role)) {
      throw new ForbiddenException();
    }
    if (actor.sub === target.id) {
      throw new ForbiddenException("Cannot deactivate your own account");
    }
    if (target.role === UserRole.SUPER_ADMIN && !isSuperAdmin(actor.role)) {
      throw new ForbiddenException("Only super admins can deactivate super admin accounts");
    }
  }

  private async createProfessionalProfile(userId: string) {
    await this.prisma.professionalProfile.create({
      data: {
        userId,
        regulatoryBody: "",
        licenseNumber: "",
        verifiedStatus: "PENDING",
      },
    });
  }

  async create(dto: CreateUserDto, actor: JwtPayload) {
    this.assertCanCreateUser(actor, dto.role);

    if (dto.role === UserRole.PROFESSIONAL && !dto.professionalType) {
      throw new BadRequestException("professionalType is required for professional users");
    }

    if (dto.adminRoleId) {
      if (dto.role !== UserRole.STAFF && dto.role !== UserRole.ADMIN) {
        throw new BadRequestException("Admin portal roles apply only to staff/admin accounts");
      }
      const adminRole = await this.prisma.adminRole.findUnique({ where: { id: dto.adminRoleId } });
      if (!adminRole) throw new BadRequestException("Admin role not found");
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
        ...(dto.adminRoleId ? { adminRoleId: dto.adminRoleId } : {}),
      },
      select: USER_SELECT,
    });

    if (dto.role === UserRole.PROFESSIONAL) {
      await this.createProfessionalProfile(user.id);
    }

    return this.serializeUser(user);
  }

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: USER_SELECT,
      }),
    ]);
    return {
      data: rows.map((u) => this.serializeUser(u)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(id: string, actor: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException("User not found");
    if (actor.sub !== id && !isInternalRole(actor.role)) {
      throw new ForbiddenException();
    }
    return this.serializeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: JwtPayload) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, professionalType: true },
    });
    if (!existing) throw new NotFoundException("User not found");

    const isStaffActor = isInternalRole(actor.role);
    if (actor.sub !== id && !isStaffActor) throw new ForbiddenException();

    if ((dto.role !== undefined || dto.professionalType !== undefined) && !isStaffActor) {
      throw new ForbiddenException("Only staff can change role or professional type");
    }

    if (dto.role !== undefined && isStaffActor) {
      this.assertCanAssignRole(actor, dto.role);
    }

    if (dto.isActive === false && isStaffActor) {
      this.assertCanDeactivate(actor, existing);
    } else if (dto.isActive !== undefined && !isStaffActor) {
      throw new ForbiddenException("Only staff can change account active status");
    }

    if (dto.isActive === true && dto.isActive !== undefined && isStaffActor) {
      // staff+ may reactivate
    }

    if (dto.role === UserRole.PROFESSIONAL && !dto.professionalType && actor.sub !== id) {
      if (!existing.professionalType) {
        throw new BadRequestException("Professionals must have a professionalType set");
      }
    }

    if (dto.adminRoleId !== undefined && isStaffActor) {
      if (dto.adminRoleId) {
        const targetRole = dto.role ?? existing.role;
        if (targetRole !== UserRole.STAFF && targetRole !== UserRole.ADMIN) {
          throw new BadRequestException("Admin portal roles apply only to staff/admin accounts");
        }
        const adminRole = await this.prisma.adminRole.findUnique({
          where: { id: dto.adminRoleId },
        });
        if (!adminRole) throw new BadRequestException("Admin role not found");
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.role !== undefined && isStaffActor ? { role: dto.role } : {}),
        ...(dto.professionalType !== undefined && isStaffActor
          ? { professionalType: dto.professionalType }
          : {}),
        ...(dto.isActive !== undefined && isStaffActor ? { isActive: dto.isActive } : {}),
        ...(dto.adminRoleId !== undefined && isStaffActor
          ? { adminRoleId: dto.adminRoleId || null }
          : {}),
      },
      select: USER_SELECT,
    });

    if (
      dto.role === UserRole.PROFESSIONAL &&
      isStaffActor &&
      !(await this.prisma.professionalProfile.findUnique({ where: { userId: id } }))
    ) {
      await this.createProfessionalProfile(id);
    }

    // E5-S5, criterion 4. `JwtStrategy` already refuses a deactivated account on every request, so
    // this is not what closes the door. It is what makes the record match: a deactivated account
    // with live sessions still listed against it is a lie told to the next person who reads the
    // table, and the session rows are also what a future story will count when it answers "who is
    // signed in right now".
    if (dto.isActive === false && isStaffActor) {
      await this.sessions.revokeAllForUser(id, "account_deactivated");
    }

    return this.serializeUser(user);
  }
}
