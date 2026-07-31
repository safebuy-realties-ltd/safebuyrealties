/**
 * Bounded dependency checks for the readiness probe.
 *
 * A readiness probe that hangs is worse than one that fails: the orchestrator keeps the
 * instance in rotation while it waits. Every check therefore runs behind its own timeout
 * and every failure is turned into a status, never an exception.
 */

/**
 * The complete vocabulary a check may report. It is a closed set of literals on purpose:
 * nothing derived from configuration can reach the response body, so the probe cannot leak
 * a bucket name, a hostname, a connection string, or any part of a key.
 */
export type CheckStatus = "ok" | "unavailable" | "timeout" | "misconfigured" | "mock";

/** Per-check budgets. The database check talks over the network; the others read config. */
export const CHECK_TIMEOUT_MS = {
  database: 2000,
  storage: 500,
  payments: 500,
} as const;

/**
 * Runs one dependency check under a timeout.
 *
 * Resolves to the probe's own status, to "timeout" if the probe outlives its budget, or to
 * "unavailable" if it throws or rejects. It never rejects, so a caller cannot turn a failing
 * dependency into an unhandled 5xx.
 */
export async function runCheck(
  probe: () => Promise<CheckStatus> | CheckStatus,
  timeoutMs: number,
): Promise<CheckStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<CheckStatus>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  // Promise.resolve().then() so a probe that throws synchronously is caught here too.
  const attempt = Promise.resolve()
    .then(probe)
    .catch((): CheckStatus => "unavailable");

  try {
    return await Promise.race([attempt, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
