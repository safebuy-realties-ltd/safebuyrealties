import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { FEATURE_FLAGS, FEATURE_FLAG_KEYS, KILL_SWITCH_ENV_VAR } from "./feature-flags.constants";
import { FeatureFlagsService } from "./feature-flags.service";

/**
 * The service is the only place a flag value is decided, so these tests are mostly about the order
 * the four inputs are consulted in and about what the response says when the answer is surprising.
 * A flag system that returns the right boolean but cannot say where it came from is a system nobody
 * trusts at 2am, which is the only hour it gets used.
 */
describe("FeatureFlagsService", () => {
  let service: FeatureFlagsService;
  let env: Record<string, string | undefined>;
  let log: jest.Mock;

  beforeEach(async () => {
    env = {};
    log = jest.fn(async () => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: AuditService, useValue: { log } },
      ],
    }).compile();

    service = moduleRef.get(FeatureFlagsService);
  });

  describe("resolution order", () => {
    it("falls back to the registry default when nothing else says otherwise", () => {
      const state = service.describe("payouts");
      expect(state).toMatchObject({
        key: "payouts",
        enabled: FEATURE_FLAGS.payouts.defaultEnabled,
        source: "default",
        envVar: "FEATURE_PAYOUTS",
      });
      expect(state.envValueIgnored).toBeUndefined();
    });

    it("reads the derived environment variable, which is what a deploy actually sets", () => {
      env.FEATURE_PAYOUTS = "on";
      expect(service.describe("payouts")).toMatchObject({ enabled: true, source: "env" });
    });

    it("lets a runtime override beat the environment, in either direction", () => {
      env.FEATURE_PAYOUTS = "on";
      expect(service.setOverride("payouts", false, "admin-1")).toMatchObject({
        enabled: false,
        source: "override",
      });

      env.FEATURE_AUTH_RECOVERY = "off";
      expect(service.setOverride("auth_recovery", true, "admin-1")).toMatchObject({
        enabled: true,
        source: "override",
      });
    });

    it("returns to the layer below when the override is cleared", () => {
      env.FEATURE_PAYOUTS = "on";
      service.setOverride("payouts", false, "admin-1");
      expect(service.clearOverride("payouts", "admin-1")).toMatchObject({
        enabled: true,
        source: "env",
      });
    });
  });

  describe("the kill switch", () => {
    it("forces every flag off, including ones set on by the environment and by an override", () => {
      env.FEATURE_PAYOUTS = "on";
      service.setOverride("auth_recovery", true, "admin-1");
      // Defaults on rather than off, so it is the one that proves the switch is not just a no-op.
      expect(service.isEnabled("standalone_dd_public_order_read")).toBe(true);

      service.setKillSwitch(true, "admin-1");

      for (const state of service.all()) {
        expect(state).toMatchObject({ enabled: false, source: "kill-switch" });
      }
    });

    it("cannot turn a flag on, because a switch that could would be a second enable path", () => {
      env[KILL_SWITCH_ENV_VAR] = "off";
      expect(service.isKillSwitchArmed()).toBe(false);
      expect(service.isEnabled("payouts")).toBe(FEATURE_FLAGS.payouts.defaultEnabled);
    });

    it("arms from the environment, which is the half that survives a restart", () => {
      env[KILL_SWITCH_ENV_VAR] = "true";
      const snapshot = service.snapshot();
      expect(snapshot.killSwitch).toEqual({ armed: true, fromEnv: true, fromRuntime: false });
    });

    it("separates the runtime half from the durable half in the snapshot", () => {
      const snapshot = service.setKillSwitch(true, "admin-1");
      expect(snapshot.killSwitch).toEqual({ armed: true, fromEnv: false, fromRuntime: true });
      expect(snapshot.overridesAreProcessLocal).toBe(true);
    });

    it("disarms the runtime half without disarming the environment", () => {
      env[KILL_SWITCH_ENV_VAR] = "on";
      service.setKillSwitch(true, "admin-1");
      const snapshot = service.setKillSwitch(false, "admin-1");
      expect(snapshot.killSwitch).toEqual({ armed: true, fromEnv: true, fromRuntime: false });
    });
  });

  describe("environment values it does not understand", () => {
    it("treats them as unset and says so, rather than quietly meaning off", () => {
      env.FEATURE_PAYOUTS = "maybe";
      const state = service.describe("payouts");
      expect(state).toMatchObject({
        enabled: FEATURE_FLAGS.payouts.defaultEnabled,
        source: "default",
        envValueIgnored: "maybe",
      });
    });

    it("keeps reporting the ignored value even when an override is what is answering", () => {
      env.FEATURE_PAYOUTS = "maybe";
      const state = service.setOverride("payouts", true, "admin-1");
      expect(state).toMatchObject({ enabled: true, source: "override", envValueIgnored: "maybe" });
    });

    it("does not flag an empty variable, which is how an unset variable arrives", () => {
      env.FEATURE_PAYOUTS = "   ";
      expect(service.describe("payouts").envValueIgnored).toBeUndefined();
    });
  });

  describe("what the browser is told", () => {
    it("returns the client-visible keys only, with values and nothing else", () => {
      const client = service.clientFlags();
      const expected = FEATURE_FLAG_KEYS.filter((key) => FEATURE_FLAGS[key].client);

      expect(Object.keys(client).sort()).toEqual([...expected].sort());
      expect(Object.values(client).every((value) => typeof value === "boolean")).toBe(true);
      expect(client).not.toHaveProperty("standalone_dd_public_order_read");
    });

    it("keeps the server-only flag out of the payload whatever its value is", () => {
      service.setOverride("standalone_dd_public_order_read", false, "admin-1");
      expect(service.clientFlags()).not.toHaveProperty("standalone_dd_public_order_read");
      expect(service.isEnabled("standalone_dd_public_order_read")).toBe(false);
    });

    it("gives an operator the source of every flag, which is what the snapshot is for", () => {
      const snapshot = service.snapshot();
      expect(snapshot.flags).toHaveLength(FEATURE_FLAG_KEYS.length);
      for (const state of snapshot.flags) {
        expect(state.description).not.toHaveLength(0);
        expect(state.story).not.toHaveLength(0);
        expect(state.envVar.startsWith("FEATURE_")).toBe(true);
      }
    });
  });

  describe("the audit trail", () => {
    it("records an override, because nothing else durable records that it happened", () => {
      env.FEATURE_PAYOUTS = "on";
      service.setOverride("payouts", false, "admin-7");

      expect(log).toHaveBeenCalledWith({
        actorId: "admin-7",
        action: AuditAction.FEATURE_FLAG_OVERRIDE_SET,
        entity: "FeatureFlag",
        entityId: "payouts",
        before: { enabled: true, source: "env" },
        after: { enabled: false, source: "override" },
      });
    });

    it("records a cleared override with the value it went back to", () => {
      service.setOverride("payouts", true, "admin-7");
      log.mockClear();
      service.clearOverride("payouts", "admin-7");

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.FEATURE_FLAG_OVERRIDE_CLEARED,
          entityId: "payouts",
          before: { enabled: true, source: "override" },
          after: { enabled: FEATURE_FLAGS.payouts.defaultEnabled, source: "default" },
        }),
      );
    });

    it("records arming and disarming under different actions", () => {
      service.setKillSwitch(true, "admin-7");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.FEATURE_FLAG_KILL_SWITCH_ARMED,
          entityId: KILL_SWITCH_ENV_VAR,
          before: { armed: false },
          after: { armed: true, fromEnv: false },
        }),
      );

      service.setKillSwitch(false, "admin-7");
      expect(log).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: AuditAction.FEATURE_FLAG_KILL_SWITCH_DISARMED }),
      );
    });
  });

  describe("what it says at boot", () => {
    let warn: jest.SpyInstance;
    let info: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      info = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
      info.mockRestore();
    });

    it("stays quiet when every flag is sitting on its default", () => {
      service.onModuleInit();
      expect(warn).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
    });

    it("names each flag the environment moved", () => {
      env.FEATURE_PAYOUTS = "on";
      service.onModuleInit();
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("payouts is on by FEATURE_PAYOUTS"),
      );
    });

    it("warns about a value it ignored, which is the mistake that otherwise goes unnoticed", () => {
      env.FEATURE_PAYOUTS = "maybe";
      service.onModuleInit();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('FEATURE_PAYOUTS="maybe"'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Use on or off"));
    });

    it("warns loudly when the process boots with the kill switch armed", () => {
      env[KILL_SWITCH_ENV_VAR] = "on";
      service.onModuleInit();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${KILL_SWITCH_ENV_VAR} is armed`));
    });
  });
});
