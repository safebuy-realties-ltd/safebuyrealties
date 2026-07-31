import { CHECK_TIMEOUT_MS, runCheck } from "./health-check";

describe("runCheck", () => {
  it("passes the probe's own status through", async () => {
    await expect(runCheck(() => "ok", 50)).resolves.toBe("ok");
    await expect(runCheck(() => Promise.resolve("mock" as const), 50)).resolves.toBe("mock");
  });

  it("reports unavailable instead of rejecting when the probe rejects", async () => {
    await expect(runCheck(() => Promise.reject(new Error("ECONNREFUSED")), 50)).resolves.toBe(
      "unavailable",
    );
  });

  it("reports unavailable when the probe throws synchronously", async () => {
    await expect(
      runCheck(() => {
        throw new Error("bad config");
      }, 50),
    ).resolves.toBe("unavailable");
  });

  it("gives up on a probe that hangs rather than hanging with it", async () => {
    const started = Date.now();

    await expect(runCheck(() => new Promise<never>(() => undefined), 20)).resolves.toBe("timeout");

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not wait for a slow probe once its own budget has expired", async () => {
    const slow = () => new Promise<"ok">((resolve) => setTimeout(() => resolve("ok"), 100));

    await expect(runCheck(slow, 20)).resolves.toBe("timeout");
  });

  it("gives each dependency its own budget", () => {
    expect(CHECK_TIMEOUT_MS.database).toBeGreaterThan(0);
    expect(CHECK_TIMEOUT_MS.storage).toBeGreaterThan(0);
    expect(CHECK_TIMEOUT_MS.payments).toBeGreaterThan(0);
  });
});
