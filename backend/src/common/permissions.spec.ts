import { UserRole } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
  resolvePermissions,
} from "./permissions";

describe("resolvePermissions", () => {
  it("gives super admin every permission regardless of grants", () => {
    expect(resolvePermissions(UserRole.SUPER_ADMIN, [])).toEqual(ALL_PERMISSIONS);
    expect(resolvePermissions(UserRole.SUPER_ADMIN, [PERMISSIONS.USERS_READ])).toEqual(
      ALL_PERMISSIONS,
    );
  });

  it("uses role defaults when grants are empty", () => {
    const staff = resolvePermissions(UserRole.STAFF, []);
    expect(staff).toContain(PERMISSIONS.STAFF_OPS);
    expect(staff).not.toContain(PERMISSIONS.DD_CHECKLISTS_MANAGE);

    const admin = resolvePermissions(UserRole.ADMIN, []);
    expect(admin).toContain(PERMISSIONS.DD_CHECKLISTS_MANAGE);
    expect(admin).not.toContain(PERMISSIONS.PERMISSIONS_MANAGE);
    expect(admin).not.toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it("prefers admin role permissions when no grants", () => {
    const custom = resolvePermissions(UserRole.STAFF, [], [
      PERMISSIONS.ESCROWS_READ,
      PERMISSIONS.ANALYTICS_READ,
    ]);
    expect(custom).toEqual([PERMISSIONS.ESCROWS_READ, PERMISSIONS.ANALYTICS_READ]);
  });

  it("uses custom grants when present for admin", () => {
    const custom = resolvePermissions(UserRole.ADMIN, [
      PERMISSIONS.CONTENT_MANAGE,
      PERMISSIONS.DD_CHECKLISTS_MANAGE,
    ]);
    expect(custom).toEqual([PERMISSIONS.CONTENT_MANAGE, PERMISSIONS.DD_CHECKLISTS_MANAGE]);
  });
});

describe("hasPermission", () => {
  it("requires all listed permissions", () => {
    const effective = [PERMISSIONS.USERS_READ, PERMISSIONS.LISTINGS_READ];
    expect(hasPermission(effective, PERMISSIONS.USERS_READ)).toBe(true);
    expect(
      hasPermission(effective, [PERMISSIONS.USERS_READ, PERMISSIONS.LISTINGS_WRITE]),
    ).toBe(false);
  });
});
