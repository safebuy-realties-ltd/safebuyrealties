import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LoggerService } from "@nestjs/common";
import { MONEY_EVENT, MONEY_OPERATIONS, withMoneyOperation } from "./money-operation";

/**
 * E7-S1 criterion 5: "Payment, escrow, and payout operations emit an explicit start and outcome log
 * with amounts and identifiers."
 *
 * Two lines rather than one, because the interesting failure is the one that produces no second line
 * at all — a request that hung, a process killed mid-transfer. A single line written afterwards
 * cannot describe that; a missing outcome line can.
 */

function stubLogger() {
  const log = jest.fn();
  const error = jest.fn();
  return { logger: { log, error } as unknown as LoggerService, log, error };
}

const FIELDS = { amountMinor: 250_000, amount: "2500.00", currency: "NGN", transactionId: "tx-1" };

describe("withMoneyOperation", () => {
  it("emits a start line before the work and an outcome line after it", async () => {
    const { logger, log } = stubLogger();
    const order: string[] = [];
    log.mockImplementation((line: { phase: string }) => order.push(`log:${line.phase}`));

    await withMoneyOperation(logger, "escrow.hold", FIELDS, async () => {
      order.push("work");
      return "held";
    });

    expect(order).toEqual(["log:start", "work", "log:succeeded"]);
  });

  it("carries the amounts and identifiers on both lines", async () => {
    const { logger, log } = stubLogger();
    await withMoneyOperation(logger, "escrow.hold", FIELDS, async () => "held");

    const [[start], [outcome]] = log.mock.calls as [[Record<string, unknown>], [Record<string, unknown>]];
    expect(start).toMatchObject({
      msg: "escrow.hold start",
      event: MONEY_EVENT,
      operation: "escrow.hold",
      phase: "start",
      ...FIELDS,
    });
    expect(outcome).toMatchObject({
      msg: "escrow.hold succeeded",
      event: MONEY_EVENT,
      operation: "escrow.hold",
      phase: "succeeded",
      ...FIELDS,
    });
    expect(typeof outcome.durationMs).toBe("number");
    expect(start).not.toHaveProperty("durationMs");
  });

  it("returns the result of the work untouched", async () => {
    const { logger } = stubLogger();
    const payout = { id: "po-1", status: "COMPLETED" };
    await expect(withMoneyOperation(logger, "payout.initiate", {}, async () => payout)).resolves.toBe(payout);
  });

  it("adds what only the work could know to the outcome line", async () => {
    // A payment row id and a provider reference exist only once the work has run. `record` is how
    // they reach the outcome line without a second log call to keep in step.
    const { logger, log } = stubLogger();
    await withMoneyOperation(logger, "payment.initialize", { amountMinor: 500_000 }, async (record) => {
      record({ paymentId: "pay-9" });
      record({ reference: "sbr_ref_9", provider: "paystack" });
      return null;
    });

    const [[start], [outcome]] = log.mock.calls as [[Record<string, unknown>], [Record<string, unknown>]];
    expect(outcome).toMatchObject({ paymentId: "pay-9", reference: "sbr_ref_9", provider: "paystack" });
    // The start line was already written and must not be rewritten by a later `record`: the pair is
    // a before-and-after, and a start line that knows the answer is not one.
    expect(start).not.toHaveProperty("paymentId");
    expect(start).toMatchObject({ amountMinor: 500_000 });
  });

  it("logs the failure at error level and rethrows it unchanged", async () => {
    // This is an observer. Swallowing here would turn a failed release into a silent success for
    // the caller, which is the worst outcome available in this part of the codebase.
    const { logger, log, error } = stubLogger();
    const cause = new Error("provider rejected the transfer");

    await expect(
      withMoneyOperation(logger, "escrow.release", { transactionId: "tx-2" }, async (record) => {
        record({ escrowId: "esc-2" });
        throw cause;
      }),
    ).rejects.toBe(cause);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ phase: "start" });

    const [failure] = error.mock.calls[0] as [Record<string, unknown>];
    expect(failure).toMatchObject({
      msg: "escrow.release failed",
      event: MONEY_EVENT,
      operation: "escrow.release",
      phase: "failed",
      transactionId: "tx-2",
      escrowId: "esc-2",
      errorName: "Error",
      reason: "provider rejected the transfer",
    });
    expect(typeof failure.durationMs).toBe("number");
  });

  it("describes a thrown non-Error rather than logging [object Object]", async () => {
    const { logger, error } = stubLogger();
    await expect(
      withMoneyOperation(logger, "payment.verify", {}, async () => {
        throw "gateway timeout";
      }),
    ).rejects.toBe("gateway timeout");

    expect(error.mock.calls[0][0]).toMatchObject({ errorName: "string", reason: "gateway timeout" });
  });
});

/**
 * The criterion names the operations, not the call sites, so a refactor that quietly drops the
 * wrapper from one service would leave every test above passing. This walks the source instead.
 */
describe("MONEY_OPERATIONS coverage", () => {
  const sourceRoot = join(__dirname, "..", "..");

  function collectSources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) collectSources(path, found);
      else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts") && entry !== "money-operation.ts") {
        found.push(path);
      }
    }
    return found;
  }

  const sources = collectSources(sourceRoot).map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it.each(MONEY_OPERATIONS)("instruments %s at a real call site", (operation) => {
    const callers = sources.filter(({ text }) => text.includes(`"${operation}"`));
    expect(callers.map(({ path }) => path.replace(sourceRoot, "src"))).not.toHaveLength(0);
  });

  it("routes every money operation through the wrapper rather than a bare log call", () => {
    const wrapped = sources
      .filter(({ text }) => text.includes("withMoneyOperation("))
      .flatMap(({ text }) => MONEY_OPERATIONS.filter((operation) => text.includes(`"${operation}"`)));

    expect([...new Set(wrapped)].sort()).toEqual([...MONEY_OPERATIONS].sort());
  });
});
