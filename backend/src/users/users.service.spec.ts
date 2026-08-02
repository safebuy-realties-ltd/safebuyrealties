import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { UserRole, ProfessionalType } from "@prisma/client";
import { UsersService } from "./users.service";
import { JwtPayload } from "../auth/jwt.strategy";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  professionalProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSessions = {
  revokeAllForUser: jest.fn().mockResolvedValue(0),
};

describe("UsersService role rules", () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessions.revokeAllForUser.mockResolvedValue(0);
    service = new UsersService(mockPrisma as never, mockSessions as never);
  });

  const actor = (role: UserRole, sub = "actor-1"): JwtPayload => ({
    sub,
    email: "actor@test.com",
    role,
    professionalType: null,
  });

  describe("create", () => {
    it("rejects staff creating users", async () => {
      await expect(
        service.create(
          {
            email: "new@test.com",
            password: "password123",
            firstName: "New",
            lastName: "User",
            role: UserRole.BUYER,
          },
          actor(UserRole.STAFF),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows admin to create staff only", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "u1",
        email: "staff@test.com",
        firstName: "St",
        lastName: "Aff",
        role: UserRole.STAFF,
        professionalType: null,
        phone: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create(
        {
          email: "staff@test.com",
          password: "password123",
          firstName: "St",
          lastName: "Aff",
          role: UserRole.STAFF,
        },
        actor(UserRole.ADMIN),
      );

      await expect(
        service.create(
          {
            email: "buyer@test.com",
            password: "password123",
            firstName: "Bu",
            lastName: "Yer",
            role: UserRole.BUYER,
          },
          actor(UserRole.ADMIN),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows super admin to create any role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "u2",
        email: "admin2@test.com",
        firstName: "Ad",
        lastName: "Min",
        role: UserRole.ADMIN,
        professionalType: null,
        phone: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        {
          email: "admin2@test.com",
          password: "password123",
          firstName: "Ad",
          lastName: "Min",
          role: UserRole.ADMIN,
        },
        actor(UserRole.SUPER_ADMIN),
      );

      expect(result.role).toBe("admin");
    });

    it("requires professionalType for professional users", async () => {
      await expect(
        service.create(
          {
            email: "pro@test.com",
            password: "password123",
            firstName: "Pro",
            lastName: "User",
            role: UserRole.PROFESSIONAL,
          },
          actor(UserRole.SUPER_ADMIN),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("update role assignment", () => {
    it("blocks admin from assigning admin role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "target-1",
        role: UserRole.BUYER,
        professionalType: null,
      });

      await expect(
        service.update("target-1", { role: UserRole.ADMIN }, actor(UserRole.ADMIN)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows super admin to assign admin role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "target-1",
        role: UserRole.STAFF,
        professionalType: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: "target-1",
        email: "staff@test.com",
        firstName: "St",
        lastName: "Aff",
        role: UserRole.ADMIN,
        professionalType: null,
        phone: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);

      const result = await service.update(
        "target-1",
        { role: UserRole.ADMIN },
        actor(UserRole.SUPER_ADMIN),
      );

      expect(result.role).toBe("admin");
    });

    it("prevents deactivating self", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "actor-1",
        role: UserRole.ADMIN,
        professionalType: null,
      });

      await expect(
        service.update("actor-1", { isActive: false }, actor(UserRole.ADMIN, "actor-1")),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * E5-S5, criterion 4. The guard already turns a deactivated account away on the next request, so
   * none of this is what closes the door. It is what makes the record honest: a closed account with
   * live sessions still listed against it misleads whoever reads the table next.
   */
  describe("deactivation and open sessions", () => {
    const target = {
      id: "target-1",
      email: "buyer@test.com",
      firstName: "Bu",
      lastName: "Yer",
      role: UserRole.BUYER,
      professionalType: null,
      phone: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "target-1",
        role: UserRole.BUYER,
        professionalType: null,
      });
      mockPrisma.user.update.mockResolvedValue(target);
    });

    it("ends every session the account has open when staff close it", async () => {
      mockPrisma.user.update.mockResolvedValue({ ...target, isActive: false });

      await service.update("target-1", { isActive: false }, actor(UserRole.ADMIN));

      expect(mockSessions.revokeAllForUser).toHaveBeenCalledWith("target-1", "account_deactivated");
    });

    it("leaves the sessions alone on an ordinary profile edit", async () => {
      await service.update("target-1", { phone: "+2348012345678" }, actor(UserRole.ADMIN));

      expect(mockSessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("leaves the sessions alone when the account is turned back on", async () => {
      await service.update("target-1", { isActive: true }, actor(UserRole.ADMIN));

      // Reactivating is not a security event, and signing the owner out of a session they never
      // lost would make the reinstatement look like a second punishment.
      expect(mockSessions.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
