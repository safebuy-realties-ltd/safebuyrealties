import * as path from "path";

/**
 * Which stored objects are private, who owns them, and where the authorized reader lives.
 *
 * E3-S1b closed the delivery half of E3-S1: a gate in front of the `/uploads` static mount
 * serves public listing imagery and 404s everything else. That stopped the leak, it did not
 * give private documents a way in. This is the other half — the table that sends a private key
 * to an endpoint which checks who is asking, on every request.
 *
 * The routing table and the policy table are deliberately the same table. A family cannot be
 * routed to the reader without also stating its policy, which is what has kept each of the five
 * additions honest: `kyc/` and `professionals/` in E3-S1c, `due-diligence/` in E3-S1d-1, `poa/`
 * in E3-S1d-2, and `listings/` here in E3-S1d-3.
 *
 * **Every family the application writes now has an entry.** That is what let E3-S1d-3 delete the
 * `/uploads` mount rather than keep gating it: with no key resolving to a static path, there is
 * no static path left to protect. `getSignedUrl()`'s local-driver fallback is now unreachable by
 * construction, and `private-document.controller.spec.ts` asserts that with a walk over every
 * key shape the writers produce.
 *
 * This module stays free of Nest and Prisma on purpose: `storage.service.ts` imports it to decide
 * routing, and a database dependency here would put the storage layer behind the ORM. Families
 * whose readers need a lookup name the lookup and stop; performing it is
 * `private-document-authorizer.ts`.
 */

/** Must match `app.setGlobalPrefix()` in app-bootstrap.ts. */
const API_PREFIX = "api/v1";

/** Route path of PrivateDocumentController, without the global prefix. */
export const PRIVATE_DOCUMENT_ROUTE = "documents/file";

/** The URL StorageService.getSignedUrl() hands out for a private key. */
export const PRIVATE_DOCUMENT_URL = `/${API_PREFIX}/${PRIVATE_DOCUMENT_ROUTE}`;

/**
 * What the id in the key names, and therefore how the readers of the object are worked out.
 *
 * `user` is the E3-S1c case and needs no lookup: the id in the key is the owner's. Anything else
 * names an entity, and the readers are whoever that entity's relations say they are, which only
 * the database knows.
 *
 * `listing-document` is the only subject whose lookup also decides *whether the object is private
 * at all* — see the `listings` entry below.
 */
export type PrivateDocumentSubject =
  | "user"
  | "due-diligence-order"
  | "transaction"
  | "listing-document";

export type PrivateDocumentPolicy = {
  /** What the id at `subjectSegment` names. */
  readonly subject: PrivateDocumentSubject;
  /** Index of the path segment carrying that id. */
  readonly subjectSegment: number;
  /** Segments a well-formed key of this family has, at minimum. */
  readonly minSegments: number;
  /** Value written to `AuditLog.entity` when an object of this family is read. */
  readonly auditEntity: string;
};

/**
 * Keyed by the first path segment of the storage key.
 *
 * For the two `user` families, ownership is read out of the key rather than the database because
 * the writer puts it there: `kyc.service.ts:74` and `professionals.service.ts:117` both build the
 * key from the uploader's own JWT subject, and `kyc.service.ts:203` already relies on that same
 * invariant to reject a submission naming another user's documents. There is no path by which a
 * `kyc/<a>/…` key holds user `<b>`'s document.
 *
 * `due-diligence` cannot work that way, because the id in the key is an order id and the readers
 * of an order are a buyer and a set of professionals that only the database knows. Both of its
 * key shapes carry the same `DueDiligenceOrder.id` in the same position
 * (`standalone-dd.service.ts:1107` and `:1275`), so one entry covers both. Deliberately no
 * validation of the third segment: authorization is per order, every object under
 * `due-diligence/<orderId>/` belongs to that order whatever the subpath, and a key naming a
 * subpath that was never written simply 404s at the storage layer.
 *
 * `poa` is the same shape of problem as `due-diligence`: the id in the key is a transaction id
 * (`poa.service.ts:217` and `:222` build both keys from `transaction.id`), and the readers of a
 * transaction are a buyer and a seller the database holds. Both objects of an executed deed live
 * under the same prefix, so one entry covers the PDF and its QR code — which matters, because the
 * QR code is a picture of the same private instrument and leaking it leaks the verification link.
 *
 * `listings` is different in kind from all four, and the difference is why E3-S1d-3 was a story of
 * its own. `documents.service.ts:101` writes every listing document to the same
 * `listings/<listingId>/` prefix whatever its category, so a title deed and a gallery photograph
 * are indistinguishable as keys. Privacy is a property of the `Document` row, not of the path, and
 * splitting the prefix would need a data migration against the shared cloud Postgres that the
 * handover working agreement forbids.
 *
 * So this family is routed to the reader *unconditionally* — public imagery included — and the
 * reader decides per row. That is deliberately not the same as calling every listing document
 * private: `decideListingDocument()` admits anyone, session or not, to a public category on a
 * publicly visible listing, which is precisely the rule the E3-S1b middleware gate used to apply
 * in front of the static mount. One route, one decision, one place to get it wrong.
 */
export const PRIVATE_DOCUMENT_POLICIES: Readonly<Record<string, PrivateDocumentPolicy>> = {
  // kyc/<userId>/<timestamp>_<filename>
  kyc: { subject: "user", subjectSegment: 1, minSegments: 3, auditEntity: "KycDocument" },
  // professionals/<userId>/<license|id>/<timestamp>_<filename>
  professionals: {
    subject: "user",
    subjectSegment: 1,
    minSegments: 4,
    auditEntity: "ProfessionalDocument",
  },
  // due-diligence/<orderId>/reports/<timestamp>-<filename>
  // due-diligence/<orderId>/assignments/<assignmentId>/<timestamp>-<filename>
  "due-diligence": {
    subject: "due-diligence-order",
    subjectSegment: 1,
    minSegments: 4,
    auditEntity: "DueDiligenceReport",
  },
  // poa/<transactionId>/<executedAtMs>_<hash12>.pdf
  // poa/<transactionId>/<hash12>_qr.png
  poa: {
    subject: "transaction",
    subjectSegment: 1,
    minSegments: 3,
    auditEntity: "PowerOfAttorney",
  },
  // listings/<listingId>/<uploadedAtMs>_<safeFileName>
  listings: {
    subject: "listing-document",
    subjectSegment: 1,
    minSegments: 3,
    auditEntity: "Document",
  },
};

export type PrivateDocumentTarget = {
  /** The normalized key, safe to hand to StorageService. */
  key: string;
  /**
   * The id the key carries at the subject segment.
   *
   * Only a user id when `policy.subject` is `"user"`. Never compare it to a session subject
   * without checking that first: for every other family it is an entity id, and a caller whose
   * own user id happened to collide with one would otherwise be reading someone else's file.
   */
  subjectId: string;
  policy: PrivateDocumentPolicy;
};

/**
 * Parse a caller-supplied key into the object it names, or null if it names nothing private.
 *
 * Null covers three different situations on purpose — malformed, traversing, and "not a family
 * with a policy" — because the caller is told the same thing in all three: 404. Distinguishing
 * them would turn the endpoint into an oracle for what the storage layout looks like.
 */
export function resolvePrivateDocumentTarget(
  rawKey: string | undefined | null,
): PrivateDocumentTarget | null {
  if (typeof rawKey !== "string" || rawKey.length === 0) return null;
  if (rawKey.includes("\0")) return null;

  const segments = rawKey.replace(/\\/g, "/").replace(/^\/+/, "").split("/");
  // An empty, "." or ".." segment is either a traversal or a key no upload could have produced.
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  const policy = PRIVATE_DOCUMENT_POLICIES[segments[0]];
  if (!policy) return null;
  if (segments.length < policy.minSegments) return null;

  const subjectId = segments[policy.subjectSegment];
  if (!subjectId) return null;

  return { key: segments.join("/"), subjectId, policy };
}

/**
 * Whether this key must be served by the authorized reader rather than by a URL.
 *
 * "Must be served by the reader", not "is private to somebody": since E3-S1d-3 the `listings/`
 * family routes here whatever its category, because the key cannot say and only the reader can
 * look it up. A public gallery photograph is still true for this predicate — it is served by the
 * reader, which then admits everyone.
 */
export function isPrivateDocumentKey(key: string): boolean {
  return resolvePrivateDocumentTarget(key) !== null;
}

export function privateDocumentUrl(key: string): string {
  return `${PRIVATE_DOCUMENT_URL}?key=${encodeURIComponent(key)}`;
}

/**
 * Content type is derived from the stored extension, never from anything the uploader supplied.
 *
 * Neither KYC nor credential uploads validate or store a MIME type — that is E3-S3 — so the
 * only type information that survives to read time is the file name, and even that is
 * uploader-chosen. An `.html` file uploaded as a government ID must not come back as
 * `text/html` from the API origin, where it would execute alongside the session cookie. Hence:
 * a closed map, `attachment` for anything not on the render list, and `nosniff` on the way out.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/** Types a browser renders safely in a tab. Everything else downloads. */
const INLINE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type PrivateDocumentDelivery = {
  contentType: string;
  disposition: "inline" | "attachment";
  fileName: string;
};

export function describePrivateDocument(key: string): PrivateDocumentDelivery {
  const fileName = path.posix.basename(key).replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
  const contentType =
    CONTENT_TYPES[path.posix.extname(fileName).toLowerCase()] ?? "application/octet-stream";

  return {
    contentType,
    disposition: INLINE_TYPES.has(contentType) ? "inline" : "attachment",
    fileName,
  };
}
