import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  isFeatureEnabled,
  resolveFeatureFlags,
  type ClientFeatureFlags,
} from "@/lib/feature-flags";

type FeatureFlagsResponse = { flags: ClientFeatureFlags };

/**
 * How long a flag value is trusted before the browser asks again.
 *
 * Flipping a flag is an operational act, often an urgent one, and a tab that has been open all
 * afternoon should not need a reload to notice. A minute is short enough that the fix reaches an
 * open session while somebody is still on the phone, and long enough that it is one request a
 * minute per tab rather than one per navigation.
 */
const FLAGS_STALE_MS = 60_000;

/**
 * The raw query. Most callers want `useFeatureFlags` or `useFeature` instead.
 *
 * No auth gate: the endpoint answers a guest with the client-visible flags, because the public
 * pages are flagged too. What comes back for an operator is a larger payload with sources and the
 * kill switch in it, and this hook deliberately reads only `flags`, which both shapes carry.
 */
export function useFeatureFlagsQuery() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const env = await apiRequest<FeatureFlagsResponse>("/feature-flags");
      return env.data.flags;
    },
    staleTime: FLAGS_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * Every flag this browser can see, with the server's answer over the build-time defaults.
 *
 * `isLoading` is worth reading when the flag guards something expensive to render twice. For most
 * callers the build-time value covers the gap and the flag simply settles.
 */
export function useFeatureFlags(): { flags: ClientFeatureFlags; isLoading: boolean } {
  const query = useFeatureFlagsQuery();
  return { flags: resolveFeatureFlags(query.data), isLoading: query.isLoading };
}

/**
 * One flag, as a boolean.
 *
 * Off while the request is in flight unless the build says otherwise, which is the safe direction:
 * a control that appears a moment late is a smaller problem than one that appears and then cannot
 * be used.
 */
export function useFeature(key: string): boolean {
  const { flags } = useFeatureFlags();
  return isFeatureEnabled(flags, key);
}
