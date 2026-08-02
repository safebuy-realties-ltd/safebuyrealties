import type { ReactNode } from "react";
import { useFeature } from "@/hooks/use-feature-flags";

type FeatureProps = {
  /** The registry key, the same string the backend declares in `FEATURE_FLAGS`. */
  flag: string;
  children: ReactNode;
  /** What to show instead. Nothing, usually: a switched-off feature should leave no hole. */
  fallback?: ReactNode;
  /** Renders the children when the flag is off instead of when it is on. */
  not?: boolean;
};

/**
 * Shows its children while a feature flag is on.
 *
 * This is presentation, not protection. It keeps a control off the screen when the feature behind
 * it is not available, so nobody clicks a button that answers 404. The route itself is closed on
 * the server by `FeatureGuard`, which is what actually stops the request, and that stays true if
 * this component is never rendered.
 *
 * Nothing inside is mounted while the flag is off, so an effect that fetches on mount does not run.
 */
export function Feature({ flag, children, fallback = null, not = false }: FeatureProps) {
  const enabled = useFeature(flag);
  const show = not ? !enabled : enabled;
  return <>{show ? children : fallback}</>;
}
