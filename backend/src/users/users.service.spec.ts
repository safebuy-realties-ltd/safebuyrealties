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

describe("UsersService role rules", () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(mockPrisma as never);
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
});
