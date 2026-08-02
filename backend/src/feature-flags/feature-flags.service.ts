import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  KILL_SWITCH_ENV_VAR,
  envVarFor,
  parseFlagValue,
  type FeatureFlagKey,
} from "./feature-flags.constants";

/** Where a resolved value came from. Reported on every read, because "off" alone is not an answer. */
export type FeatureFlagSource = "kill-switch" | "override" | "env" | "default";

export type FeatureFlagState = {
  key: FeatureFlagKey;
  enabled: boolean;
  source: FeatureFlagSource;
  description: string;
  story: string;
  /** The environment variable that would set this flag, so the reader does not have to derive it. */
  envVar: string;
  /**
   * Present when the environment variable is set to something unparseable, which means it is being
   * ignored. Without this the operator who typed FEATURE_PAYOUTS=maybe sees "off, by default" and
   * concludes the variable does not work.
   */
  envValueIgnored?: string;
};

export type FeatureFlagsSnapshot = {
  killSwitch: {
    armed: boolean;
    /** True when it is armed by the environment, which survives a restart and reaches every instance. */
    fromEnv: boolean;
    /** True when it is armed at runtime, which does neither. */
    fromRuntime: boolean;
  };
  /**
   * Overrides live in this process and nowhere else, so an operator reading a response from one
   * instance is not reading the state of the others. Stated in the payload rather than in a wiki.
   */
  overridesAreProcessLocal: true;
  flags: FeatureFlagState[];
};

/**
 * Feature flags, resolved in one place, with a switch that turns everything off at once.
 *
 * Four inputs, highest priority first:
 *
 *   1. the kill switch, which forces every flag off and beats everything below it
 *   2. a runtime override, set through the admin API, held in memory
 *   3. an environment variable, FEATURE_<KEY>
 *   4. the default in the registry
 *
 * Two of those are durable and two are not, and the difference matters enough to be in the API
 * response. The environment variable and the environment half of the kill switch survive a restart
 * and apply to every instance, so they are how a flag is really flipped. Runtime overrides apply to
 * the process that received the request and are lost when it restarts, so they are the 2am lever:
 * they take effect in the time of one HTTP call, and the durable change follows behind them.
 *
 * There is no database table here on purpose. A flag row would need a migration, and this
 * repository shares one cloud Postgres between local development, previews and production, so a
 * migration is a scheduled event rather than part of a chore. Environment variables are already
 * durable, already deployed, and already the thing an operator can change on Render without a code
 * deploy, which is what the story asked for.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly overrides = new Map<FeatureFlagKey, boolean>();
  private runtimeKillSwitch = false;

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Says out loud, once, what the process booted believing.
   *
   * A flag system is read far more often than it is configured, and the moment a configuration
   * mistake is cheapest to catch is the moment after deployment. Anything switched away from its
   * default is worth a line in the log; anything set to a value that was not understood is worth a
   * warning, because that is the case where the operator thinks the job is done.
   */
  onModuleInit(): void {
    if (this.isKillSwitchArmed()) {
      this.logger.warn(
        `${KILL_SWITCH_ENV_VAR} is armed: every feature flag reads off regardless of its own setting.`,
      );
    }
    for (const state of this.all()) {
      if (state.envValueIgnored !== undefined) {
        this.logger.warn(
          `${state.envVar}="${state.envValueIgnored}" is not a value this reads, so it is being ` +
            `ignored and ${state.key} stays ${state.enabled ? "on" : "off"}. Use on or off.`,
        );
      } else if (state.source === "env") {
        this.logger.log(`${state.key} is ${state.enabled ? "on" : "off"} by ${state.envVar}.`);
      }
    }
  }

  /** The one method a caller normally wants. */
  isEnabled(key: FeatureFlagKey): boolean {
    return this.describe(key).enabled;
  }

  describe(key: FeatureFlagKey): FeatureFlagState {
    const definition = FEATURE_FLAGS[key];
    const envVar = envVarFor(key);
    const raw = this.config.get<string>(envVar);
    const fromEnv = parseFlagValue(raw);
    const envValueIgnored = raw?.trim() && fromEnv === null ? raw.trim() : undefined;

    const base: Omit<FeatureFlagState, "enabled" | "source"> = {
      key,
      description: definition.description,
      story: definition.story,
      envVar,
      ...(envValueIgnored === undefined ? {} : { envValueIgnored }),
    };

    // The kill switch is checked first and can only ever turn something off. A switch that could
    // also turn a flag on would be a second way to enable a feature, which is not a kill switch.
    if (this.isKillSwitchArmed()) {
      return { ...base, enabled: false, source: "kill-switch" };
    }
    const override = this.overrides.get(key);
    if (override !== undefined) {
      return { ...base, enabled: override, source: "override" };
    }
    if (fromEnv !== null) {
      return { ...base, enabled: fromEnv, source: "env" };
    }
    return { ...base, enabled: definition.defaultEnabled, source: "default" };
  }

  all(): FeatureFlagState[] {
    return FEATURE_FLAG_KEYS.map((key) => this.describe(key));
  }

  snapshot(): FeatureFlagsSnapshot {
    return {
      killSwitch: {
        armed: this.isKillSwitchArmed(),
        fromEnv: this.isKillSwitchEnvArmed(),
        fromRuntime: this.runtimeKillSwitch,
      },
      overridesAreProcessLocal: true,
      flags: this.all(),
    };
  }

  /** The shape the browser gets: only the flags marked client, and only their values. */
  clientFlags(): Record<string, boolean> {
    const visible: Record<string, boolean> = {};
    for (const key of FEATURE_FLAG_KEYS) {
      if (FEATURE_FLAGS[key].client) visible[key] = this.isEnabled(key);
    }
    return visible;
  }

  isKillSwitchArmed(): boolean {
    return this.runtimeKillSwitch || this.isKillSwitchEnvArmed();
  }

  private isKillSwitchEnvArmed(): boolean {
    return parseFlagValue(this.config.get<string>(KILL_SWITCH_ENV_VAR)) === true;
  }

  setOverride(key: FeatureFlagKey, enabled: boolean, actorId: string): FeatureFlagState {
    const before = this.describe(key);
    this.overrides.set(key, enabled);
    const after = this.describe(key);
    this.record(AuditAction.FEATURE_FLAG_OVERRIDE_SET, key, actorId, before, after);
    return after;
  }

  clearOverride(key: FeatureFlagKey, actorId: string): FeatureFlagState {
    const before = this.describe(key);
    this.overrides.delete(key);
    const after = this.describe(key);
    this.record(AuditAction.FEATURE_FLAG_OVERRIDE_CLEARED, key, actorId, before, after);
    return after;
  }

  setKillSwitch(armed: boolean, actorId: string): FeatureFlagsSnapshot {
    const before = this.isKillSwitchArmed();
    this.runtimeKillSwitch = armed;
    const after = this.snapshot();
    void this.audit.log({
      actorId,
      action: armed
        ? AuditAction.FEATURE_FLAG_KILL_SWITCH_ARMED
        : AuditAction.FEATURE_FLAG_KILL_SWITCH_DISARMED,
      entity: "FeatureFlag",
      entityId: KILL_SWITCH_ENV_VAR,
      before: { armed: before },
      after: { armed: after.killSwitch.armed, fromEnv: after.killSwitch.fromEnv },
    });
    if (armed) {
      this.logger.warn(
        `Feature flag kill switch armed at runtime by ${actorId}. This process only, and lost on ` +
          `restart. Set ${KILL_SWITCH_ENV_VAR}=on to make it hold.`,
      );
    }
    return after;
  }

  private record(
    action: (typeof AuditAction)[keyof typeof AuditAction],
    key: FeatureFlagKey,
    actorId: string,
    before: FeatureFlagState,
    after: FeatureFlagState,
  ): void {
    void this.audit.log({
      actorId,
      action,
      entity: "FeatureFlag",
      entityId: key,
      before: { enabled: before.enabled, source: before.source },
      after: { enabled: after.enabled, source: after.source },
    });
  }
}
