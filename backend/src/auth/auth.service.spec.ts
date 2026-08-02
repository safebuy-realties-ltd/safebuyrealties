import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { UserRole, ProfessionalType } from "@prisma/client";
import { AuthService } from "./auth.service";
import { DEFAULT_ACCESS_TOKEN_TTL, REFRESH_FAILURE_MESSAGE } from "./sessions.constants";

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

const mockSessions = {
  enabled: jest.fn().mockReturnValue(false),
  issue: jest.fn(),
  rotate: jest.fn(),
  revokeAllForUser: jest.fn().mockResolvedValue(0),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(undefined),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoginAttempts.check.mockResolvedValue(unlocked);
    // Off by default, which is the state main is in and the state a rollback returns to. The
    // session-aware paths get the flag turned on inside the tests that are about them.
    mockSessions.enabled.mockReturnValue(false);
    mockConfig.get.mockReturnValue(undefined);
    service = new AuthService(
      mockPrisma as never,
      mockJwt as never,
      mockPermissions as never,
      mockLoginAttempts as never,
      mockSessions as never,
      mockConfig as never,
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

  /**
   * E5-S5. These go through `register` rather than `login` because register reaches the same
   * `issueCredentials` without a bcrypt round to fake, and what is under test is the credential, not
   * the way in.
   */
  describe("issuing credentials", () => {
    const created = {
      id: "u-new",
      email: "new@test.com",
      firstName: "New",
      lastName: "User",
      role: UserRole.BUYER,
      professionalType: null,
      phone: null,
      isActive: true,
      publicId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const registerDto = {
      email: "new@test.com",
      password: "password123",
      firstName: "New",
      lastName: "User",
      role: UserRole.BUYER,
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(created);
    });

    it("keeps the old seven-day token and hands back no refresh token while the flag is off", async () => {
      const result = await service.register(registerDto);

      expect(result.data.refreshToken).toBeNull();
      expect(result.data.refreshExpiresAt).toBeNull();
      expect(mockSessions.issue).not.toHaveBeenCalled();
      // Criterion 6 in the other direction. Turning the flag off has to be a rollback, and a
      // rollback that leaves fifteen-minute tokens behind with nothing able to refresh them signs
      // the whole userbase out four times an hour.
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.not.objectContaining({ sid: expect.anything() }),
        { expiresIn: "7d" },
      );
    });

    it("opens a session, stamps its id on the token and shortens the token to fifteen minutes", async () => {
      mockSessions.enabled.mockReturnValue(true);
      const expiresAt = new Date("2026-01-08T00:00:00.000Z");
      mockSessions.issue.mockResolvedValue({
        familyId: "fam-1",
        refreshToken: "fam-1.secret",
        expiresAt,
      });

      const result = await service.register(registerDto, {
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0",
      });

      expect(result.data.refreshToken).toBe("fam-1.secret");
      expect(result.data.refreshExpiresAt).toBe(expiresAt);
      expect(mockSessions.issue).toHaveBeenCalledWith({
        userId: "u-new",
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0",
      });
      // The `sid` is what makes a token revocable. Without it `JwtStrategy` has nothing to look up
      // and criterion 3 cannot end anything.
      expect(mockJwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sid: "fam-1" }), {
        expiresIn: DEFAULT_ACCESS_TOKEN_TTL,
      });
    });

    it("honours ACCESS_TOKEN_TTL when it reads as a duration", async () => {
      mockSessions.enabled.mockReturnValue(true);
      mockConfig.get.mockReturnValue("5m");
      mockSessions.issue.mockResolvedValue({
        familyId: "fam-2",
        refreshToken: "fam-2.secret",
        expiresAt: new Date(),
      });

      await service.register(registerDto);

      expect(mockJwt.signAsync).toHaveBeenCalledWith(expect.anything(), { expiresIn: "5m" });
    });

    it("ignores a mistyped ACCESS_TOKEN_TTL instead of turning every sign-in into a 500", async () => {
      mockSessions.enabled.mockReturnValue(true);
      mockConfig.get.mockReturnValue("15 minutes");
      mockSessions.issue.mockResolvedValue({
        familyId: "fam-3",
        refreshToken: "fam-3.secret",
        expiresAt: new Date(),
      });

      await service.register(registerDto);

      expect(mockJwt.signAsync).toHaveBeenCalledWith(expect.anything(), {
        expiresIn: DEFAULT_ACCESS_TOKEN_TTL,
      });
    });
  });

  describe("refresh", () => {
    const rotated = {
      userId: "u1",
      familyId: "fam-9",
      refreshToken: "fam-9.next",
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    };

    it("mints a token carrying the rotated family and passes the new refresh token through", async () => {
      mockSessions.rotate.mockResolvedValue(rotated);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        role: UserRole.BUYER,
        professionalType: null,
        isActive: true,
      });

      const result = await service.refresh("fam-9.presented", { ip: "203.0.113.7" });

      expect(result.refreshToken).toBe("fam-9.next");
      expect(result.refreshExpiresAt).toBe(rotated.expiresAt);
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sid: "fam-9" }),
        expect.anything(),
      );
    });

    it("refuses a deactivated account in the same words as any other refresh failure, and ends its sessions", async () => {
      mockSessions.rotate.mockResolvedValue(rotated);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@test.com",
        role: UserRole.BUYER,
        professionalType: null,
        isActive: false,
      });

      // Criterion 5. The token itself was perfectly good, and saying so would tell the holder of a
      // stolen token that the account exists and that they have the right credential.
      await expect(service.refresh("fam-9.presented", {})).rejects.toThrow(REFRESH_FAILURE_MESSAGE);
      expect(mockSessions.revokeAllForUser).toHaveBeenCalledWith("u1", "account_deactivated");
    });
  });
});
