/**
 * The browser half of the feature flag system.
 *
 * Two inputs, highest priority first:
 *
 *   1. what the API said, `GET /feature-flags`, which is where the truth lives
 *   2. `VITE_FEATURE_<KEY>` baked in at build time
 *
 * The server wins because the server is the thing an operator can change without a deploy, and
 * because a browser that believes a feature is on when the API has it off renders buttons that
 * answer 404. The build-time value is the state of the page before the first response arrives, and
 * the answer for a key the server did not send. It is a starting position, not an override.
 *
 * Nothing here decides authorization. Hiding a control is a courtesy to the person looking at the
 * screen; the route behind it is closed by `FeatureGuard` on the server whether or not this file
 * runs at all.
 */

/** The value of a flag nobody has said anything about. Off, because an unknown feature is not built. */
const UNKNOWN_FLAG = false;

/** Mirrors the vocabulary the backend accepts, so `on` means the same thing on both sides. */
const TRUTHY = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSY = new Set(["false", "0", "no", "off", "disabled"]);

export type ClientFeatureFlags = Record<string, boolean>;

/** The build-time variable that sets a flag, derived the same way the backend derives its own. */
export function envVarForFlag(key: string): string {
  return `VITE_FEATURE_${key.toUpperCase()}`;
}

/**
 * Reads a flag out of an environment string, returning null for anything unrecognised so that a
 * typo is treated as unset rather than as false. A misspelt value that silently meant "off" would
 * look exactly like a flag working correctly.
 */
export function parseFlagValue(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return null;
}

/**
 * Every `VITE_FEATURE_*` in the build, as flags.
 *
 * Vite only exposes variables prefixed `VITE_`, and it inlines them at build time, so this is a
 * fixed object by the time it reaches a browser. That is the reason it cannot be the authority: to
 * change one you have to deploy, which is the problem the flag system exists to remove.
 */
export function buildTimeFlags(
  env: Record<string, string | undefined> = import.meta.env,
): ClientFeatureFlags {
  const flags: ClientFeatureFlags = {};
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("VITE_FEATURE_")) continue;
    const parsed = parseFlagValue(raw);
    if (parsed === null) continue;
    flags[name.slice("VITE_FEATURE_".length).toLowerCase()] = parsed;
  }
  return flags;
}

/** The build-time flags with the server's answer laid over the top of them. */
export function resolveFeatureFlags(
  server: ClientFeatureFlags | undefined,
  env: Record<string, string | undefined> = import.meta.env,
): ClientFeatureFlags {
  return { ...buildTimeFlags(env), ...(server ?? {}) };
}

/** Reads one flag out of a resolved set. A key the set does not contain is off. */
export function isFeatureEnabled(flags: ClientFeatureFlags | undefined, key: string): boolean {
  return flags?.[key] ?? UNKNOWN_FLAG;
}
