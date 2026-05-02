import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, ProfessionalType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ListUsersQueryDto } from "./dto/list-users.query";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private serializeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    professionalType: ProfessionalType | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
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
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
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
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          professionalType: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
        },
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
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        professionalType: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    if (actor.sub !== id && actor.role !== UserRole.STAFF && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    return this.serializeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: JwtPayload) {
    const isStaff = actor.role === UserRole.STAFF || actor.role === UserRole.ADMIN;
    if (actor.sub !== id && !isStaff) throw new ForbiddenException();
    if ((dto.role !== undefined || dto.professionalType !== undefined) && !isStaff) {
      throw new ForbiddenException("Only staff can change role or professional type");
    }
    if (dto.role === UserRole.PROFESSIONAL && !dto.professionalType && actor.sub !== id) {
      const existing = await this.prisma.user.findUnique({ where: { id } });
      if (existing && !existing.professionalType) {
        throw new BadRequestException("Professionals must have a professionalType set");
      }
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.role !== undefined && isStaff ? { role: dto.role } : {}),
        ...(dto.professionalType !== undefined && isStaff
          ? { professionalType: dto.professionalType }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        professionalType: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.serializeUser(user);
  }
}
