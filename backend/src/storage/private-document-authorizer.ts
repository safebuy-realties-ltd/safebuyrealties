import { Injectable } from "@nestjs/common";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateDocumentTarget } from "./private-documents";

/**
 * Who may read a private document, for the families where the key alone cannot say (E3-S1d).
 *
 * E3-S1c could decide `kyc/` and `professionals/` from the key, because the id those keys carry is
 * the owner's own user id. `due-diligence/` carries an order id, and the readers of an order are a
 * buyer and a set of assigned professionals that only the database knows. So the decision moves
 * here, where Prisma is available, and `private-documents.ts` stays a pure routing table.
 *
 * Refusal is always 403, never 404, including when the subject entity does not exist. A logged-in
 * caller must not be able to walk order ids and learn which ones are real; the endpoint only
 * answers 404 for a key that is malformed or belongs to no private family at all, which is a
 * static property of the key and reveals nothing about the data.
 */

/** Why a request was allowed or refused. Recorded in the audit trail, never sent to the caller. */
export type PrivateDocumentAccessReason =
  | "owner"
  | "operator"
  | "assigned-professional"
  | "not-a-reader"
  | "subject-unknown";

export type PrivateDocumentAccess = {
  allowed: boolean;
  /** The document's owner, when one is known. Null when the subject entity was not found. */
  ownerId: string | null;
  reason: PrivateDocumentAccessReason;
};

@Injectable()
export class PrivateDocumentAuthorizer {
  constructor(private prisma: PrismaService) {}

  async decide(target: PrivateDocumentTarget, user: JwtPayload): Promise<PrivateDocumentAccess> {
    switch (target.policy.subject) {
      case "user":
        return this.decideUserOwned(target, user);
      case "due-diligence-order":
        return this.decideDueDiligenceOrder(target, user);
    }
  }

  /**
   * `kyc/<userId>/…` and `professionals/<userId>/…`. No lookup: both key builders take the id from
   * the uploader's own JWT subject (`kyc.service.ts:74`, `professionals.service.ts:117`), so the
   * key is the ownership record.
   *
   * Operators are readers because both families exist to be reviewed by them, and both review
   * screens already sit behind `@Roles(STAFF, ADMIN, …)`.
   */
  private decideUserOwned(target: PrivateDocumentTarget, user: JwtPayload): PrivateDocumentAccess {
    if (target.subjectId === user.sub) {
      return { allowed: true, ownerId: target.subjectId, reason: "owner" };
    }
    if (isInternalRole(user.role)) {
      return { allowed: true, ownerId: target.subjectId, reason: "operator" };
    }
    return { allowed: false, ownerId: target.subjectId, reason: "not-a-reader" };
  }

  /**
   * `due-diligence/<orderId>/…`, covering both reports and assignment attachments.
   *
   * Granularity is the order, not the individual file, because that is already the granularity of
   * the API: `listAssignmentsForProfessional()` serializes the whole parent order to every
   * assigned professional (`standalone-dd.service.ts:1248`), report URLs included. A per-file rule
   * would not be a tightening, it would break the professional dashboard while the wider data is
   * still handed out by a different endpoint.
   *
   * The buyer is checked before the role, so a staff member reading their own order is audited as
   * the owner rather than as an operator.
   */
  private async decideDueDiligenceOrder(
    target: PrivateDocumentTarget,
    user: JwtPayload,
  ): Promise<PrivateDocumentAccess> {
    const order = await this.prisma.dueDiligenceOrder.findUnique({
      where: { id: target.subjectId },
      select: { buyerId: true, assignments: { select: { professionalId: true } } },
    });

    if (!order) {
      // Operators may read anything in this family, so "no such order" costs them only a 404 from
      // the storage layer. For everyone else the answer is the same 403 an existing order they do
      // not own would produce, which is what keeps the endpoint from confirming id guesses.
      return isInternalRole(user.role)
        ? { allowed: true, ownerId: null, reason: "operator" }
        : { allowed: false, ownerId: null, reason: "subject-unknown" };
    }

    if (order.buyerId === user.sub) {
      return { allowed: true, ownerId: order.buyerId, reason: "owner" };
    }
    if (isInternalRole(user.role)) {
      return { allowed: true, ownerId: order.buyerId, reason: "operator" };
    }
    if (order.assignments.some((assignment) => assignment.professionalId === user.sub)) {
      return { allowed: true, ownerId: order.buyerId, reason: "assigned-professional" };
    }
    return { allowed: false, ownerId: order.buyerId, reason: "not-a-reader" };
  }
}
