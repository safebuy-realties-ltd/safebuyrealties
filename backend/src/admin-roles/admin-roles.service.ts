import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  OnModuleInit,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ALL_PERMISSIONS,
  DEFAULT_ADMIN_ROLE_TEMPLATES,
  PERMISSIONS,
  type Permission,
} from "../common/permissions";
import { isSuperAdmin } from "../common/user-roles";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class AdminRolesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultRoles();
  }

  async ensureDefaultRoles() {
    for (const template of DEFAULT_ADMIN_ROLE_TEMPLATES) {
      await this.prisma.adminRole.upsert({
        where: { name: template.name },
        create: {
          name: template.name,
          description: template.description,
          permissions: template.permissions,
          isSystem: template.isSystem ?? false,
          sortOrder: template.sortOrder,
        },
        update: {
          description: template.description,
          sortOrder: template.sortOrder,
          // Keep system role permissions in sync; leave custom roles alone
          ...(template.isSystem ? { permissions: template.permissions } : {}),
        },
      });
    }
  }

  private serialize(role: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    isSystem: boolean;
    sortOrder: number;
    updatedAt: Date;
    _count?: { users: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      sortOrder: role.sortOrder,
      userCount: role._count?.users ?? undefined,
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  async list() {
    await this.ensureDefaultRoles();
    const rows = await this.prisma.adminRole.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    return { data: rows.map((r) => this.serialize(r)) };
  }

  async listForActor(actorId: string, actorRole: UserRole) {
    if (isSuperAdmin(actorRole)) return this.list();
    const effective = await this.permissions.getEffectivePermissions(actorId, actorRole);
    if (
      !effective.includes(PERMISSIONS.ROLES_MANAGE) &&
      !effective.includes(PERMISSIONS.USERS_WRITE) &&
      !effective.includes(PERMISSIONS.USERS_READ)
    ) {
      throw new ForbiddenException("Insufficient privileges to view admin roles");
    }
    return this.list();
  }

  async get(id: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException("Admin role not found");
    return { data: this.serialize(role) };
  }

  async create(
    actorId: string,
    actorRole: UserRole,
    dto: { name: string; description?: string; permissions: string[] },
  ) {
    await this.assertCanManageRoles(actorId, actorRole);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Role name is required");
    const permissions = this.sanitizePermissions(dto.permissions, actorRole);
    try {
      const created = await this.prisma.adminRole.create({
        data: {
          name,
          description: dto.description?.trim() || null,
          permissions,
          isSystem: false,
          sortOrder: 100,
        },
        include: { _count: { select: { users: true } } },
      });
      return { data: this.serialize(created) };
    } catch {
      throw new ConflictException(`Role "${name}" already exists`);
    }
  }

  async update(
    actorId: string,
    actorRole: UserRole,
    id: string,
    dto: { name?: string; description?: string | null; permissions?: string[] },
  ) {
    await this.assertCanManageRoles(actorId, actorRole);
    const existing = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Admin role not found");
    if (existing.isSystem && dto.permissions) {
      if (!isSuperAdmin(actorRole)) {
        throw new ForbiddenException("Only super admin can edit system role privileges");
      }
    }
    const permissions =
      dto.permissions !== undefined
        ? this.sanitizePermissions(dto.permissions, actorRole)
        : undefined;
    try {
      const updated = await this.prisma.adminRole.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(permissions !== undefined ? { permissions } : {}),
        },
        include: { _count: { select: { users: true } } },
      });
      return { data: this.serialize(updated) };
    } catch {
      throw new ConflictException("Could not update role (name may already exist)");
    }
  }

  async remove(actorId: string, actorRole: UserRole, id: string) {
    await this.assertCanManageRoles(actorId, actorRole);
    const existing = await this.prisma.adminRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) throw new NotFoundException("Admin role not found");
    if (existing.isSystem) {
      throw new BadRequestException("System roles cannot be deleted");
    }
    if (existing._count.users > 0) {
      throw new BadRequestException(
        `Role is assigned to ${existing._count.users} user(s). Reassign them first.`,
      );
    }
    await this.prisma.adminRole.delete({ where: { id } });
    return { data: { id } };
  }

  private sanitizePermissions(permissions: string[], actorRole: UserRole): Permission[] {
    const known = new Set(ALL_PERMISSIONS);
    const unique = [...new Set(permissions)];
    for (const p of unique) {
      if (!known.has(p as Permission)) {
        throw new BadRequestException(`Unknown privilege: ${p}`);
      }
      if (
        (p === PERMISSIONS.PERMISSIONS_MANAGE || p === PERMISSIONS.ROLES_MANAGE) &&
        !isSuperAdmin(actorRole)
      ) {
        throw new ForbiddenException(`Only super admin can grant ${p}`);
      }
    }
    return unique as Permission[];
  }

  private async assertCanManageRoles(actorId: string, actorRole: UserRole) {
    if (isSuperAdmin(actorRole)) return;
    const effective = await this.permissions.getEffectivePermissions(actorId, actorRole);
    if (!effective.includes(PERMISSIONS.ROLES_MANAGE)) {
      throw new ForbiddenException("Missing roles.manage privilege");
    }
  }
}
