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

const unlocked = {
  account: { failures: 0, lockedUntil: null },
  address: { failures: 0, lockedUntil: null },
  lockedUntil: null,
  retryAfterSeconds: 0,
};

const mockLoginAttempts = {
  check: jest.fn().mockResolvedValue(unlocked),
  assertNotLocked: jest.fn(),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoginAttempts.check.mockResolvedValue(unlocked);
    service = new AuthService(
      mockPrisma as never,
      mockJwt as never,
      mockPermissions as never,
      mockLoginAttempts as never,
    );
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

    it("does not count a deactivated account as a failed attempt", async () => {
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
      // The credential was never tested, so counting it would let a deactivated account's own
      // owner drive the lock, and would count nothing an attacker did.
      expect(mockLoginAttempts.recordFailure).not.toHaveBeenCalled();
    });

    it("counts an unknown account and answers exactly as it answers a wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@test.com", password: "password123" }, "203.0.113.7"),
      ).rejects.toThrow("Invalid email or password");
      // Counted, or an attacker could probe for which addresses exist without ever being locked.
      expect(mockLoginAttempts.recordFailure).toHaveBeenCalledWith(
        "nobody@test.com",
        "203.0.113.7",
        unlocked,
        null,
      );
    });

    it("checks the lock before it looks the account up", async () => {
      mockLoginAttempts.assertNotLocked.mockImplementationOnce(() => {
        throw new Error("locked");
      });

      await expect(
        service.login({ email: "locked@test.com", password: "password123" }),
      ).rejects.toThrow("locked");
      // Nothing was read and no hash was compared, so a locked answer costs the same and looks the
      // same whether or not the account exists.
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
