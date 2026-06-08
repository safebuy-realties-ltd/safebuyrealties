import { UserRole } from "@prisma/client";
import { isInternalRole, isAdminRole, roleSatisfies } from "./user-roles";

describe("user-roles", () => {
  it("treats SUPER_ADMIN as internal and admin", () => {
    expect(isInternalRole(UserRole.SUPER_ADMIN)).toBe(true);
    expect(isAdminRole(UserRole.SUPER_ADMIN)).toBe(true);
  });

  it("lets SUPER_ADMIN satisfy ADMIN and STAFF role requirements", () => {
    expect(roleSatisfies(UserRole.SUPER_ADMIN, [UserRole.ADMIN])).toBe(true);
    expect(roleSatisfies(UserRole.SUPER_ADMIN, [UserRole.STAFF])).toBe(true);
    expect(roleSatisfies(UserRole.ADMIN, [UserRole.STAFF])).toBe(false);
  });
});
