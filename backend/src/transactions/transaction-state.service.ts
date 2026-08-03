import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TransactionStatus } from "@prisma/client";
import {
  allowedTransactionTransitions,
  isTerminalTransactionStatus,
  transactionPredecessors,
} from "./transaction-state.constants";

/**
 * Whatever can write the `transaction` table: the Prisma client itself, or the client handed to the
 * callback of an interactive transaction. Callers that have to move a transaction and something
 * else together pass the second, which is what makes the two writes one unit of work.
 *
 * It is spelled out as the two calls this service makes rather than as a slice of Prisma's own
 * client type. Prisma's delegates carry sixteen methods and a result type that changes shape with
 * the arguments, so borrowing the whole thing would force every test double to implement fourteen
 * methods nobody calls to satisfy a compiler.
 */
export type TransactionStateWriter = {
  transaction: {
    updateMany(args: {
      where: { id: string; status: { in: TransactionStatus[] } };
      data: { status: TransactionStatus };
    }): Promise<{ count: number }>;
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: TransactionStatus } | null>;
  };
};

/**
 * What happened. `changed` is false when the transaction was already at the requested status, which
 * is a replay rather than a move, and callers use it to decide whether anybody needs to be told.
 */
export type TransactionMove = {
  status: TransactionStatus;
  changed: boolean;
};

/**
 * The one place a transaction status is allowed to move.
 *
 * The table next door says what is legal. This says how a legal move is written, and it is written
 * as a single conditional update rather than a read followed by a write. `updateMany` carries the
 * legal predecessors in its `where`, so the row moves only if it was somewhere the table permits,
 * and two requests arriving together cannot both read `DD_IN_PROGRESS` and both write
 * `DD_COMPLETE`. The read only happens when the update matched nothing, and then only to work out
 * which of the two harmless-looking failures it was: a transaction already at the status asked for,
 * which is a replay and returns quietly, or a transaction somewhere else entirely, which is a 409.
 *
 * The 409 matters. An illegal move is a conflict between what the caller believes and what the row
 * says, not a malformed request and not a server fault, and a state machine that answers 500 to a
 * double-clicked button teaches operators to ignore errors.
 */
@Injectable()
export class TransactionStateService {
  /**
   * Moves one transaction to `to`, or explains why it cannot.
   *
   * `db` is the client to write through. Pass the callback client of an open interactive
   * transaction when this move has to succeed or fail alongside another write, and the plain
   * service when it stands alone.
   */
  async advance(
    db: TransactionStateWriter,
    transactionId: string,
    to: TransactionStatus,
  ): Promise<TransactionMove> {
    const from = transactionPredecessors(to);
    if (from.length > 0) {
      const moved = await db.transaction.updateMany({
        where: { id: transactionId, status: { in: from as TransactionStatus[] } },
        data: { status: to },
      });
      if (moved.count > 0) return { status: to, changed: true };
    }

    const current = await db.transaction.findUnique({
      where: { id: transactionId },
      select: { status: true },
    });
    if (!current) {
      throw new NotFoundException("Transaction not found");
    }
    if (current.status === to) {
      return { status: to, changed: false };
    }
    throw new ConflictException(this.describeRejection(current.status, to));
  }

  /** The message on a rejected move, which names what would have been legal instead. */
  private describeRejection(from: TransactionStatus, to: TransactionStatus): string {
    if (isTerminalTransactionStatus(from)) {
      return `Transaction is ${from} and is final, so it cannot move to ${to}`;
    }
    const allowed = allowedTransactionTransitions(from);
    const options = allowed.length > 0 ? allowed.join(" or ") : "nothing";
    return `Cannot move transaction from ${from} to ${to}. From ${from} it can only move to ${options}`;
  }
}
