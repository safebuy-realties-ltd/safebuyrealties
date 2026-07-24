import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { UserRole, ProfessionalType } from "@prisma/client";
import { AuthService } from "./auth.service";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  professionalProfile: {
    create: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue("token"),
};

const mockPermissions = {
  getEffectivePermissions: jest.fn().mockResolvedValue([]),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(mockPrisma as never, mockJwt as never, mockPermissions as never);
  });

  describe("register", () => {
    it("allows professional self-registration with professionalType", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "pro-1",
        email: "pro@test.com",
        firstName: "Pro",
        lastName: "User",
        role: UserRole.PROFESSIONAL,
        professionalType: ProfessionalType.LAWYER,
        phone: null,
        isActive: true,
        createdAt: new Date(),
      });
      mockPrisma.professionalProfile.create.mockResolvedValue({});

      const result = await service.register({
        email: "pro@test.com",
        password: "password123",
        firstName: "Pro",
        lastName: "User",
        role: UserRole.PROFESSIONAL,
        professionalType: ProfessionalType.LAWYER,
      });

      expect(result.data.user.role).toBe("professional");
      expect(mockPrisma.professionalProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verifiedStatus: "PENDING" }),
        }),
      );
    });

    it("rejects staff self-registration", async () => {
      await expect(
        service.register({
          email: "staff@test.com",
          password: "password123",
          firstName: "St",
          lastName: "Aff",
          role: UserRole.STAFF,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("login", () => {
    it("rejects inactive users", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "inactive@test.com",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012",
        isActive: false,
        firstName: "In",
        lastName: "Active",
        role: UserRole.BUYER,
        professionalType: null,
        phone: null,
        createdAt: new Date(),
      });

      await expect(
        service.login({ email: "inactive@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
