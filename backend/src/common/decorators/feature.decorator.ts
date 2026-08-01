import { SetMetadata } from "@nestjs/common";
import type { FeatureFlagKey } from "../../feature-flags/feature-flags.constants";

export const FEATURE_FLAG_KEY = "featureFlag";

/**
 * Puts a route behind a feature flag. While the flag is off the route answers 404.
 *
 * Usable on a handler or on a whole controller, and the handler wins, which is how a controller can
 * be flagged as a unit while one route inside it stays reachable.
 *
 * The key is typed against the registry, so a route cannot be gated on a flag nobody declared.
 */
export const RequiresFeature = (flag: FeatureFlagKey) => SetMetadata(FEATURE_FLAG_KEY, flag);
