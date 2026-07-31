import * as path from "path";

/**
 * Which stored objects are private, who owns them, and where the authorized reader lives.
 *
 * E3-S1b closed the delivery half of E3-S1: a gate in front of the `/uploads` static mount
 * serves public listing imagery and 404s everything else. That stopped the leak, it did not
 * give private documents a way in. This is the other half — the table that sends a private key
 * to an endpoint which checks who is asking, on every request.
 *
 * The routing table and the policy table are deliberately the same table. A key is handed to
 * the private reader exactly when the reader knows who may read it; anything else keeps its
 * `/uploads` URL and stays 404 behind the gate. E3-S1d adds `due-diligence/`, `poa/` and
 * private `listings/` documents by adding entries here, and cannot route a family to the reader
 * without also stating its policy.
 */

/** Must match `app.setGlobalPrefix()` in app-bootstrap.ts. */
const API_PREFIX = "api/v1";

/** Route path of PrivateDocumentController, without the global prefix. */
export const PRIVATE_DOCUMENT_ROUTE = "documents/file";

/** The URL StorageService.getSignedUrl() hands out for a private key. */
export const PRIVATE_DOCUMENT_URL = `/${API_PREFIX}/${PRIVATE_DOCUMENT_ROUTE}`;

export type PrivateDocumentPolicy = {
  /** Index of the path segment carrying the owning user's id. */
  readonly ownerSegment: number;
  /** Segments a well-formed key of this family has, at minimum. */
  readonly minSegments: number;
  /** Value written to `AuditLog.entity` when an object of this family is read. */
  readonly auditEntity: string;
};

/**
 * Keyed by the first path segment of the storage key.
 *
 * Ownership is read out of the key rather than the database because the writer puts it there:
 * `kyc.service.ts:74` and `professionals.service.ts:117` both build the key from the uploader's
 * own JWT subject, and `kyc.service.ts:203` already relies on that same invariant to reject a
 * submission naming another user's documents. There is no path by which a `kyc/<a>/…` key holds
 * user `<b>`'s document.
 */
export const PRIVATE_DOCUMENT_POLICIES: Readonly<Record<string, PrivateDocumentPolicy>> = {
  // kyc/<userId>/<timestamp>_<filename>
  kyc: { ownerSegment: 1, minSegments: 3, auditEntity: "KycDocument" },
  // professionals/<userId>/<license|id>/<timestamp>_<filename>
  professionals: { ownerSegment: 1, minSegments: 4, auditEntity: "ProfessionalDocument" },
};

export type PrivateDocumentTarget = {
  /** The normalized key, safe to hand to StorageService. */
  key: string;
  /** The user whose document this is. */
  ownerId: string;
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

  const ownerId = segments[policy.ownerSegment];
  if (!ownerId) return null;

  return { key: segments.join("/"), ownerId, policy };
}

/** Whether this key must be served by the authorized reader rather than by a URL. */
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
