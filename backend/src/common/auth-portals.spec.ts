import { UserRole } from "@prisma/client";
import { loginPathForRole, portalAcceptsRole } from "./auth-portals";

describe("auth portals", () => {
  it("accepts only matching roles per portal", () => {
    expect(portalAcceptsRole("buyer", UserRole.BUYER)).toBe(true);
    expect(portalAcceptsRole("buyer", UserRole.SELLER)).toBe(false);
    expect(portalAcceptsRole("admin", UserRole.STAFF)).toBe(true);
    expect(portalAcceptsRole("admin", UserRole.ADMIN)).toBe(true);
    expect(portalAcceptsRole("admin", UserRole.BUYER)).toBe(false);
  });

  it("maps roles to login paths", () => {
    expect(loginPathForRole(UserRole.BUYER)).toBe("/login/buyer");
    expect(loginPathForRole(UserRole.SELLER)).toBe("/login/seller");
    expect(loginPathForRole(UserRole.PROFESSIONAL)).toBe("/login/professional");
    expect(loginPathForRole(UserRole.STAFF)).toBe("/login/admin");
    expect(loginPathForRole(UserRole.SUPER_ADMIN)).toBe("/login/admin");
  });
});
