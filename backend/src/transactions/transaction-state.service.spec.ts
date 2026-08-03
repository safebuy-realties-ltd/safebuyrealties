import { ConflictException, NotFoundException } from "@nestjs/common";
import { TransactionStatus } from "@prisma/client";
import { TransactionStateService } from "./transaction-state.service";
import {
  TRANSACTION_TRANSITIONS,
  allowedTransactionTransitions,
  canTransitionTransaction,
  isTerminalTransactionStatus,
  transactionPredecessors,
} from "./transaction-state.constants";

const ALL_STATUSES = Object.values(TransactionStatus);

/**
 * A writer double standing in for whichever client the caller passed, which in production is
 * usually the one handed to an open interactive transaction rather than the plain service.
 *
 * `updateMany` answers from `row`, matching on the `where` the service built, so the test exercises
 * the real conditional write instead of a mock that says yes to everything. That is the whole point
 * of the guard: a double that always reports one row updated would pass every illegal move.
 */
function writerFor(row: { status: TransactionStatus } | null) {
  const updateMany = jest.fn(
    async ({ where }: { where: { id: string; status: { in: TransactionStatus[] } } }) => ({
      count: row && where.status.in.includes(row.status) ? 1 : 0,
    }),
  );
  const findUnique = jest.fn(async () => row);
  return { transaction: { updateMany, findUnique } };
}

describe("TransactionStateService", () => {
  const service = new TransactionStateService();

  describe("the state table", () => {
    it("declares every status the schema has, and no status it does not", () => {
      expect(Object.keys(TRANSACTION_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    });

    it("names only real statuses on the right hand side", () => {
      for (const targets of Object.values(TRANSACTION_TRANSITIONS)) {
        for (const target of targets) {
          expect(ALL_STATUSES).toContain(target);
        }
      }
    });

    it("has COMPLETED as the only status with no way out", () => {
      const terminal = ALL_STATUSES.filter((status) => isTerminalTransactionStatus(status));
      expect(terminal).toEqual([TransactionStatus.COMPLETED]);
    });

    it("derives predecessors from the table rather than restating them", () => {
      expect(transactionPredecessors(TransactionStatus.DD_COMPLETE)).toEqual([
        TransactionStatus.DD_PURCHASED,
        TransactionStatus.DD_IN_PROGRESS,
      ]);
      expect(transactionPredecessors(TransactionStatus.INITIATED)).toEqual([]);
    });

    it("treats a move to the status already held as legal and as nothing happening", () => {
      for (const status of ALL_STATUSES) {
        expect(canTransitionTransaction(status, status)).toBe(true);
      }
    });
  });

  // E1-S2 criterion 6. The table is the specification, so the test walks it rather than restating
  // it. Every legal move is asserted to pass and every illegal move is asserted to throw, which is
  // what keeps a row added to the table from going untested.
  describe("every legal move and every rejected move", () => {
    const legal: Array<[TransactionStatus, TransactionStatus]> = [];
    const illegal: Array<[TransactionStatus, TransactionStatus]> = [];
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        (canTransitionTransaction(from, to) ? legal : illegal).push([from, to]);
      }
    }

    it("has something to walk in both directions", () => {
      expect(legal.length).toBeGreaterThan(0);
      // Far more than the four the story asks for, and all of them from the table.
      expect(illegal.length).toBeGreaterThan(4);
    });

    it.each(legal)("allows %s to %s", async (from, to) => {
      const db = writerFor({ status: from });

      await expect(service.advance(db, "txn-1", to)).resolves.toEqual({
        status: to,
        changed: true,
      });
      expect(db.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: "txn-1", status: { in: transactionPredecessors(to) } },
        data: { status: to },
      });
      // The legal move never reads the row. The read is the failure path and nothing else.
      expect(db.transaction.findUnique).not.toHaveBeenCalled();
    });

    it.each(illegal)("rejects %s to %s", async (from, to) => {
      const db = writerFor({ status: from });

      await expect(service.advance(db, "txn-1", to)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // The four the story names by hand, spelled out so the reason each one is wrong is written down
  // rather than left implied by the walk above.
  describe("the rejections that matter most", () => {
    it("refuses to drag a completed purchase back into due diligence", async () => {
      // Escrow has released and the listing is sold. A transaction that can be reopened is a sale
      // that can be unsold with no record of who unsold it.
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.COMPLETED }),
          "txn-1",
          TransactionStatus.DD_IN_PROGRESS,
        ),
      ).rejects.toThrow("is COMPLETED and is final");
    });

    it("refuses to reopen a signed-off case", async () => {
      // The buyer has been told the answer. Moving back to DD_IN_PROGRESS would change a verdict
      // they have already read.
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.DD_COMPLETE }),
          "txn-1",
          TransactionStatus.DD_IN_PROGRESS,
        ),
      ).rejects.toThrow("Cannot move transaction from DD_COMPLETE to DD_IN_PROGRESS");
    });

    it("refuses to complete due diligence nobody has paid for", async () => {
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.INITIATED }),
          "txn-1",
          TransactionStatus.DD_COMPLETE,
        ),
      ).rejects.toThrow("From INITIATED it can only move to IN_PROGRESS or DD_PURCHASED");
    });

    it("refuses to jump from a paid case to a completed purchase", async () => {
      // Skipping escrow would mark a property sold with the money still sitting with the buyer.
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.DD_PURCHASED }),
          "txn-1",
          TransactionStatus.COMPLETED,
        ),
      ).rejects.toThrow("Cannot move transaction from DD_PURCHASED to COMPLETED");
    });

    it("refuses to send money already in escrow back to due diligence", async () => {
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.PURCHASE_IN_ESCROW }),
          "txn-1",
          TransactionStatus.DD_COMPLETE,
        ),
      ).rejects.toThrow("Cannot move transaction from PURCHASE_IN_ESCROW to DD_COMPLETE");
    });

    it("names what would have been legal instead", async () => {
      await expect(
        service.advance(
          writerFor({ status: TransactionStatus.DD_PURCHASED }),
          "txn-1",
          TransactionStatus.INITIATED,
        ),
      ).rejects.toThrow("it can only move to DD_IN_PROGRESS or DD_COMPLETE");
      expect(allowedTransactionTransitions(TransactionStatus.DD_PURCHASED)).toEqual([
        TransactionStatus.DD_IN_PROGRESS,
        TransactionStatus.DD_COMPLETE,
      ]);
    });
  });

  // E1-S2 criterion 5, at the level the transaction move owns. A replay is not a conflict: the
  // caller asked for a state the row is already in, and answering 409 would turn a retried webhook
  // or a double-clicked button into an error page.
  describe("replays", () => {
    it("reports that nothing changed rather than throwing", async () => {
      const db = writerFor({ status: TransactionStatus.DD_COMPLETE });

      await expect(
        service.advance(db, "txn-1", TransactionStatus.DD_COMPLETE),
      ).resolves.toEqual({ status: TransactionStatus.DD_COMPLETE, changed: false });
    });

    it("writes nothing on the second run", async () => {
      const db = writerFor({ status: TransactionStatus.DD_IN_PROGRESS });

      await service.advance(db, "txn-1", TransactionStatus.DD_IN_PROGRESS);

      expect(db.transaction.updateMany.mock.results[0]).toEqual(
        expect.objectContaining({ type: "return" }),
      );
      await expect(db.transaction.updateMany.mock.results[0].value).resolves.toEqual({ count: 0 });
    });
  });

  describe("a transaction that is not there", () => {
    it("is a 404 rather than a conflict", async () => {
      await expect(
        service.advance(writerFor(null), "txn-gone", TransactionStatus.DD_COMPLETE),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // INITIATED has no predecessors, so there is no conditional write to make and the service must
  // not build an `IN ()` clause that matches nothing and then reports a phantom conflict.
  describe("a status nothing can move to", () => {
    it("rejects a move to INITIATED without attempting the write", async () => {
      const db = writerFor({ status: TransactionStatus.IN_PROGRESS });

      await expect(
        service.advance(db, "txn-1", TransactionStatus.INITIATED),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.transaction.updateMany).not.toHaveBeenCalled();
    });

    it("still treats a transaction already at INITIATED as a replay", async () => {
      const db = writerFor({ status: TransactionStatus.INITIATED });

      await expect(service.advance(db, "txn-1", TransactionStatus.INITIATED)).resolves.toEqual({
        status: TransactionStatus.INITIATED,
        changed: false,
      });
    });
  });
});
