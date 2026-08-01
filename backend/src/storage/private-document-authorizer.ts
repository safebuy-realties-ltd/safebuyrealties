import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { isPublicListingAssetCategory } from "../documents/document-categories";
import { isPubliclyVisible } from "../listings/listings-public.helper";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateDocumentTarget } from "./private-documents";

/**
 * Who may read a stored document, for the families where the key alone cannot say (E3-S1d).
 *
 * E3-S1c could decide `kyc/` and `professionals/` from the key, because the id those keys carry is
 * the owner's own user id. `due-diligence/` carries an order id, and `poa/` a transaction id; the
 * readers of either are people the database knows about and the key does not. So the decision moves
 * here, where Prisma is available, and `private-documents.ts` stays a pure routing table.
 *
 * Refusal is always 403, never 404, including when the subject entity does not exist. A logged-in
 * caller must not be able to walk order or transaction ids and learn which ones are real; the
 * endpoint only answers 404 for a key that is malformed or belongs to no routed family at all,
 * which is a static property of the key and reveals nothing about the data.
 *
 * **E3-S1d-3 widened this from "private documents" to "documents".** `listings/` mixes a seller's
 * title deeds with the gallery photographs the marketplace shows to anonymous visitors, under one
 * prefix, so the reader had to absorb the public rule rather than let a second gate keep it. That
 * makes `user` nullable throughout: a caller with no session now reaches this class instead of
 * being stopped at the guard. `decide()` funnels every one of them through a single check before
 * any family-specific code runs, so "what may be read without a session" is four lines in one
 * place rather than a property of five separate branches.
 */

/** Why a request was allowed or refused. Recorded in the audit trail, never sent to the caller. */
export type PrivateDocumentAccessReason =
  | "owner"
  | "operator"
  | "assigned-professional"
  | "transaction-counterparty"
  | "public-listing-asset"
  | "not-a-reader"
  | "no-session"
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

  async decide(
    target: PrivateDocumentTarget,
    user: JwtPayload | null,
  ): Promise<PrivateDocumentAccess> {
    // The single anonymous choke point. Exactly one thing on this endpoint is readable without a
    // session — public listing media on a publicly visible listing, which is what the marketplace
    // renders to visitors — and it is named here rather than left to each branch to remember. A
    // family added later is refused to anonymous callers by default, which is the direction a
    // mistake in this file should fail.
    if (!user) {
      if (target.policy.subject !== "listing-document") {
        return { allowed: false, ownerId: null, reason: "no-session" };
      }
      return this.decideListingDocument(target, null);
    }

    switch (target.policy.subject) {
      case "user":
        return this.decideUserOwned(target, user);
      case "due-diligence-order":
        return this.decideDueDiligenceOrder(target, user);
      case "transaction":
        return this.decideTransaction(target, user);
      case "listing-document":
        return this.decideListingDocument(target, user);
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

  /**
   * `poa/<transactionId>/…`, covering the executed deed and the QR code that verifies it.
   *
   * A power of attorney is an instrument of the transaction, not of one party, so the reader set is
   * the transaction's two sides plus the operators who have to support it: the buyer who executed
   * it, the seller of the listing it is drawn against, and internal staff. That matches how the
   * backlog describes this family ("POA buyer, transaction counterparty, operators",
   * `MVP_OUTSTANDING_BACKLOG.md:490`) and how the record is related — `PowerOfAttorney.transactionId`
   * to `Transaction.listingId` to `Listing.sellerId`.
   *
   * The seller is read through the listing rather than from a column on the transaction because
   * there is no such column: a standalone transaction has `listingId` null (`schema.prisma:242`),
   * and one with no listing simply has no counterparty to admit. The buyer is checked before the
   * role, so a staff member reading their own deed is audited as its owner rather than as an
   * operator, exactly as in the due diligence case above.
   */
  private async decideTransaction(
    target: PrivateDocumentTarget,
    user: JwtPayload,
  ): Promise<PrivateDocumentAccess> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: target.subjectId },
      select: { buyerId: true, listing: { select: { sellerId: true } } },
    });

    if (!transaction) {
      // Same oracle defence as due diligence: operators fall through to a 404 from the storage
      // layer, everyone else gets the 403 a real transaction they are not party to would give.
      return isInternalRole(user.role)
        ? { allowed: true, ownerId: null, reason: "operator" }
        : { allowed: false, ownerId: null, reason: "subject-unknown" };
    }

    if (transaction.buyerId === user.sub) {
      return { allowed: true, ownerId: transaction.buyerId, reason: "owner" };
    }
    if (isInternalRole(user.role)) {
      return { allowed: true, ownerId: transaction.buyerId, reason: "operator" };
    }
    if (transaction.listing?.sellerId === user.sub) {
      return { allowed: true, ownerId: transaction.buyerId, reason: "transaction-counterparty" };
    }
    return { allowed: false, ownerId: transaction.buyerId, reason: "not-a-reader" };
  }

  /**
   * `listings/<listingId>/…`, covering everything `documents.service.ts` uploads — hero images,
   * gallery photographs, survey plans, deeds of assignment, certificates of occupancy.
   *
   * This is the family the key cannot classify. The id it carries is a listing id, and a listing
   * has both public imagery and private paperwork under the one prefix, so the row has to be
   * fetched before anything can be said about who may read it. Note the lookup is by
   * `storageKey`, not by the listing id in the key: the category lives on the `Document` row and
   * a request naming a key with no row is a request for an object the application never wrote.
   *
   * **The public branch is the E3-S1b gate, moved.** Until E3-S1d-3 that rule lived in Express
   * middleware in front of the static mount (`public-listing-asset.gate.ts`, deleted by this
   * story) and this endpoint refused the whole family. Two places deciding one prefix is how the
   * next leak gets in, so the mount went and the rule came here. It is the same rule to the
   * letter — public category, publicly visible listing — and it admits a caller with no session,
   * because the marketplace listing page is public and its photographs have to load.
   *
   * The private branch is the reader set the backlog specifies for this family
   * (`MVP_OUTSTANDING_BACKLOG.md:491`): the seller, whoever uploaded it, a buyer with a
   * transaction on the listing, a professional assigned to it, and operators. The professional
   * test is deliberately the same pair of relations `DocumentsService.getListingOrThrow()` already
   * uses (`documents.service.ts:72`), so a professional who can see a document listed can also
   * open it — a narrower rule here would not be a tightening, it would be a broken dashboard with
   * the metadata still handed out by a different endpoint.
   *
   * There is no cancelled or void state in `TransactionStatus` (`schema.prisma:77`), so "a
   * counterparty in an active transaction" is any transaction at all. Recorded rather than
   * silently narrowed: if that enum ever gains a terminal state, this is the line to revisit.
   */
  private async decideListingDocument(
    target: PrivateDocumentTarget,
    user: JwtPayload | null,
  ): Promise<PrivateDocumentAccess> {
    const doc = await this.prisma.document.findFirst({
      where: { storageKey: target.key },
      select: {
        category: true,
        listingId: true,
        uploadedById: true,
        listing: { select: { sellerId: true, status: true, isPublished: true } },
      },
    });

    if (!doc) {
      // Same oracle defence as the other looked-up families, with one addition: an anonymous
      // caller is refused here too, so a key that names nothing is indistinguishable from a
      // private one. Operators fall through to a 404 from the storage layer.
      if (!user) return { allowed: false, ownerId: null, reason: "no-session" };
      return isInternalRole(user.role)
        ? { allowed: true, ownerId: null, reason: "operator" }
        : { allowed: false, ownerId: null, reason: "subject-unknown" };
    }

    const ownerId = doc.listing.sellerId;

    if (isPublicListingAssetCategory(doc.category) && isPubliclyVisible(doc.listing)) {
      return { allowed: true, ownerId, reason: "public-listing-asset" };
    }

    // Everything below needs a session. Reached when the document is private, or when it is
    // public media on a listing that is not visible yet — a draft's hero image is the seller's
    // business, not the public's.
    if (!user) return { allowed: false, ownerId, reason: "no-session" };

    if (ownerId === user.sub || doc.uploadedById === user.sub) {
      return { allowed: true, ownerId, reason: "owner" };
    }
    if (isInternalRole(user.role)) {
      return { allowed: true, ownerId, reason: "operator" };
    }

    const engagement = await this.listingEngagement(doc.listingId, user);
    if (engagement) return { allowed: true, ownerId, reason: engagement };

    return { allowed: false, ownerId, reason: "not-a-reader" };
  }

  /**
   * How this caller is engaged with the listing, or null if they are not.
   *
   * Split out so the branch above reads as the policy it is. Each lookup is scoped to the role
   * that can satisfy it, so a buyer never costs two counts and a professional never costs three:
   * this runs on the request path of every private listing document.
   */
  private async listingEngagement(
    listingId: string,
    user: JwtPayload,
  ): Promise<Extract<
    PrivateDocumentAccessReason,
    "transaction-counterparty" | "assigned-professional"
  > | null> {
    if (user.role === UserRole.BUYER) {
      const transactions = await this.prisma.transaction.count({
        where: { listingId, buyerId: user.sub },
      });
      return transactions > 0 ? "transaction-counterparty" : null;
    }

    if (user.role === UserRole.PROFESSIONAL) {
      const [steps, tasks] = await Promise.all([
        this.prisma.verificationStep.count({
          where: { listingId, assignedProfessionalId: user.sub },
        }),
        this.prisma.task.count({ where: { listingId, assigneeId: user.sub } }),
      ]);
      return steps + tasks > 0 ? "assigned-professional" : null;
    }

    return null;
  }
}
