import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  resolvePermissions,
  type Permission,
} from "../common/permissions";
import { isAdminRole, isSuperAdmin } from "../common/user-roles";

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async getEffectivePermissions(userId: string, role: UserRole): Promise<Permission[]> {
    if (role === UserRole.SUPER_ADMIN) return [...ALL_PERMISSIONS];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        adminRole: { select: { permissions: true } },
        permissionGrants: { select: { permission: true } },
      },
    });
    const grants = user?.permissionGrants.map((g) => g.permission) ?? [];
    return resolvePermissions(role, grants, user?.adminRole?.permissions ?? null);
  }

  async listCatalog() {
    return {
      data: ALL_PERMISSIONS.map((code) => ({
        code,
        label: undefined as string | undefined,
      })),
    };
  }

  async getUserPermissions(actorId: string, actorRole: UserRole, targetUserId: string) {
    await this.assertCanManage(actorId, actorRole, targetUserId);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { adminRole: true },
    });
    if (!target) throw new NotFoundException("User not found");
    const grants = await this.prisma.permissionGrant.findMany({
      where: { userId: targetUserId },
      orderBy: { permission: "asc" },
    });
    const effective = await this.getEffectivePermissions(targetUserId, target.role);
    return {
      data: {
        userId: targetUserId,
        role: target.role.toLowerCase(),
        adminRoleId: target.adminRoleId,
        adminRoleName: target.adminRole?.name ?? null,
        custom: grants.length > 0,
        grants: grants.map((g) => g.permission),
        rolePermissions: target.adminRole?.permissions ?? [],
        effective,
      },
    };
  }

  async setUserPermissions(
    actorId: string,
    actorRole: UserRole,
    targetUserId: string,
    permissions: string[],
  ) {
    await this.assertCanManage(actorId, actorRole, targetUserId);
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Super admin permissions cannot be customized");
    }
    if (target.role !== UserRole.STAFF && target.role !== UserRole.ADMIN) {
      throw new BadRequestException("Permissions apply only to staff and admin accounts");
    }

    const known = new Set(ALL_PERMISSIONS);
    const unique = [...new Set(permissions)];
    for (const p of unique) {
      if (!known.has(p as Permission)) {
        throw new BadRequestException(`Unknown permission: ${p}`);
      }
      if (p === PERMISSIONS.PERMISSIONS_MANAGE && !isSuperAdmin(actorRole)) {
        throw new ForbiddenException("Only super admin can grant permissions.manage");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.permissionGrant.deleteMany({ where: { userId: targetUserId } });
      if (unique.length > 0) {
        await tx.permissionGrant.createMany({
          data: unique.map((permission) => ({ userId: targetUserId, permission })),
        });
      }
    });

    return this.getUserPermissions(actorId, actorRole, targetUserId);
  }

  private async assertCanManage(actorId: string, actorRole: UserRole, targetUserId: string) {
    if (isSuperAdmin(actorRole)) return;
    if (!isAdminRole(actorRole)) {
      throw new ForbiddenException("Only admins can manage permissions");
    }
    const actorPerms = await this.getEffectivePermissions(actorId, actorRole);
    if (!actorPerms.includes(PERMISSIONS.PERMISSIONS_MANAGE)) {
      throw new ForbiddenException("Missing permissions.manage");
    }
    if (actorId === targetUserId) {
      throw new ForbiddenException("Cannot modify your own permission grants");
    }
  }
}
