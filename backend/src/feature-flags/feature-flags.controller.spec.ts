import { NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { JwtPayload } from "../auth/jwt.strategy";
import { FeatureFlagsController } from "./feature-flags.controller";
import type { FeatureFlagsService, FeatureFlagsSnapshot } from "./feature-flags.service";

function user(role: UserRole, sub = "user-1"): JwtPayload {
  return { sub, email: `${sub}@safebuyrealties.test`, role, professionalType: null };
}

describe("FeatureFlagsController", () => {
  let controller: FeatureFlagsController;
  let snapshot: jest.Mock;
  let clientFlags: jest.Mock;
  let setOverride: jest.Mock;
  let clearOverride: jest.Mock;
  let setKillSwitch: jest.Mock;

  const fullSnapshot = {
    killSwitch: { armed: false, fromEnv: false, fromRuntime: false },
    overridesAreProcessLocal: true,
    flags: [],
  } as unknown as FeatureFlagsSnapshot;

  beforeEach(() => {
    snapshot = jest.fn(() => fullSnapshot);
    clientFlags = jest.fn(() => ({ payouts: false }));
    setOverride = jest.fn((key: string) => ({ key }));
    clearOverride = jest.fn((key: string) => ({ key }));
    setKillSwitch = jest.fn(() => fullSnapshot);

    controller = new FeatureFlagsController({
      snapshot,
      clientFlags,
      setOverride,
      clearOverride,
      setKillSwitch,
    } as unknown as FeatureFlagsService);
  });

  describe("GET /feature-flags", () => {
    it.each([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
      "gives %s the whole snapshot, sources and kill switch included",
      (role) => {
        expect(controller.get(user(role))).toBe(fullSnapshot);
        expect(clientFlags).not.toHaveBeenCalled();
      },
    );

    it.each([UserRole.BUYER, UserRole.SELLER, UserRole.PROFESSIONAL])(
      "gives %s the client-visible values and nothing about how they were reached",
      (role) => {
        expect(controller.get(user(role))).toEqual({ flags: { payouts: false } });
        expect(snapshot).not.toHaveBeenCalled();
      },
    );

    it("answers a guest, because the public pages are flagged too", () => {
      // OptionalJwtAuthGuard leaves `req.user` unset when there is no session at all, so the
      // handler is reached with undefined rather than with a payload.
      expect(controller.get(undefined)).toEqual({ flags: { payouts: false } });
      expect(controller.get(null)).toEqual({ flags: { payouts: false } });
      expect(snapshot).not.toHaveBeenCalled();
    });
  });

  describe("the mutating routes", () => {
    it("sets an override for the caller who asked for it", () => {
      controller.setOverride("payouts", { enabled: true }, user(UserRole.ADMIN, "admin-3"));
      expect(setOverride).toHaveBeenCalledWith("payouts", true, "admin-3");
    });

    it("clears an override for the caller who asked for it", () => {
      controller.clearOverride("payouts", user(UserRole.ADMIN, "admin-3"));
      expect(clearOverride).toHaveBeenCalledWith("payouts", "admin-3");
    });

    it("arms and disarms the kill switch", () => {
      controller.setKillSwitch({ armed: true }, user(UserRole.SUPER_ADMIN, "admin-3"));
      expect(setKillSwitch).toHaveBeenCalledWith(true, "admin-3");

      controller.setKillSwitch({ armed: false }, user(UserRole.SUPER_ADMIN, "admin-3"));
      expect(setKillSwitch).toHaveBeenLastCalledWith(false, "admin-3");
    });
  });

  describe("a key the registry does not contain", () => {
    it("is a 404 on the way in, so nothing downstream ever sees an unchecked string", () => {
      const admin = user(UserRole.ADMIN);

      expect(() => controller.setOverride("payuots", { enabled: true }, admin)).toThrow(
        NotFoundException,
      );
      expect(() => controller.clearOverride("payuots", admin)).toThrow(NotFoundException);
      expect(setOverride).not.toHaveBeenCalled();
      expect(clearOverride).not.toHaveBeenCalled();
    });

    it("names the key it rejected, because the caller has usually just made a typo", () => {
      expect(() => controller.clearOverride("payuots", user(UserRole.ADMIN))).toThrow(
        'No feature flag named "payuots"',
      );
    });

    it("does not treat kill-switch as a flag name", () => {
      expect(() => controller.clearOverride("kill-switch", user(UserRole.ADMIN))).toThrow(
        NotFoundException,
      );
    });
  });
});
