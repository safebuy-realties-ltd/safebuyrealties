import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived, single-purpose permission to fetch one stored object (E1-S3 criterion 2).
 *
 * `PrivateDocumentController` already decides who may read a document, per request, from the live
 * session. That is the control and this does not replace it. What the session check cannot express
 * is *when*: a URL handed to a buyer stays as good as their session, which for a report they paid
 * for is months. E1-S3 asks for a link that stops working in fifteen minutes, so this is the second
 * constraint, layered on top of the first rather than instead of it.
 *
 * A grant is bound to three things and useless without all three:
 *
 *   the key      — a grant for one report opens that report and nothing else, which is what
 *                  "single-purpose" means. Swapping the key in the URL invalidates the signature.
 *   the actor    — a grant issued to one buyer is not a bearer token. Forwarding the whole URL to
 *                  somebody else fails on the signature before the session check even matters, so
 *                  a leaked link is not a leaked document.
 *   the expiry   — signed, not merely stated, so it cannot be edited forward.
 *
 * No table, no row, no migration: everything needed to check a grant is in the grant and the
 * request. That is deliberate — the database here is a shared cloud Postgres the working agreement
 * forbids migrating, and a per-download row would be a write on the read path anyway.
 *
 * Nest-free and Prisma-free on purpose, matching `private-documents.ts` next door: the controller
 * and the issuing service both import it, and neither should have to stand a module up to test it.
 */

/** Fifteen minutes, the ceiling E1-S3 criterion 2 sets. */
export const DOCUMENT_GRANT_TTL_SECONDS = 15 * 60;

/**
 * Mixed into the derivation so a grant key can never be the session-signing key itself. Sharing one
 * secret across two purposes is how a signature from one system becomes a valid token in another;
 * the version suffix means a future change of scheme invalidates old grants rather than accepting
 * both.
 */
const GRANT_KEY_DOMAIN = "sbr.document-grant.v1";

/** Prefix on the signed message, so a signature can only ever be read back as a grant. */
const GRANT_MESSAGE_DOMAIN = "document-grant.v1";

export type DocumentGrant = {
  /** The value to put in the `grant` query parameter. */
  token: string;
  /** When it stops working, for the response body so the browser can say so. */
  expiresAt: Date;
};

export type DocumentGrantRejection = "malformed" | "expired" | "mismatched";

export type DocumentGrantVerdict = { ok: true } | { ok: false; reason: DocumentGrantRejection };

/**
 * Derives the signing key from the session secret rather than adding a second one to configure.
 *
 * `JWT_SECRET` already has a boot guard that refuses to start production on a missing, short or
 * example-file value (`config/jwt-secret.ts`), so deriving from it inherits that guarantee. A new
 * `DOCUMENT_GRANT_SECRET` would be one more thing to set, one more thing to leave unset, and the
 * failure would be silent rather than at boot.
 */
function grantKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(GRANT_KEY_DOMAIN).digest();
}

function sign(secret: string, key: string, actorId: string, expiresAtMs: number): string {
  // Newline-separated with a length-prefixed key, so no pair of different (key, actor) inputs can
  // produce the same message. Without the length a key ending in a newline could impersonate a
  // different key and actor.
  const message = [
    GRANT_MESSAGE_DOMAIN,
    String(key.length),
    key,
    actorId,
    String(expiresAtMs),
  ].join("\n");
  return createHmac("sha256", grantKey(secret)).update(message).digest("base64url");
}

/**
 * Issues a grant for one object, one reader, one short window.
 *
 * `now` is an argument rather than a call to the clock so the caller can pin it, which is what lets
 * a route report the same `expiresAt` it signed instead of one a millisecond later.
 */
export function issueDocumentGrant(input: {
  key: string;
  actorId: string;
  secret: string;
  ttlSeconds?: number;
  now?: Date;
}): DocumentGrant {
  const ttl = input.ttlSeconds ?? DOCUMENT_GRANT_TTL_SECONDS;
  const issuedAtMs = (input.now ?? new Date()).getTime();
  const expiresAtMs = issuedAtMs + ttl * 1000;
  const signature = sign(input.secret, input.key, input.actorId, expiresAtMs);

  return { token: `${expiresAtMs}.${signature}`, expiresAt: new Date(expiresAtMs) };
}

/**
 * Checks a grant against the request that presented it.
 *
 * The key and the actor come from the request being served, never from the token, so a grant cannot
 * assert what it is for. It can only agree or disagree with what is already known.
 *
 * The three rejections are told apart here because the caller wants them in an audit row, not
 * because the caller should tell them apart to the client: an expired grant and a forged one are
 * both 403 on the wire.
 */
export function verifyDocumentGrant(input: {
  token: string | undefined | null;
  key: string;
  actorId: string;
  secret: string;
  now?: Date;
}): DocumentGrantVerdict {
  if (typeof input.token !== "string" || input.token.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const separator = input.token.indexOf(".");
  if (separator <= 0) return { ok: false, reason: "malformed" };

  const expiresAtRaw = input.token.slice(0, separator);
  const presented = input.token.slice(separator + 1);
  if (!/^\d{1,15}$/.test(expiresAtRaw) || presented.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const expiresAtMs = Number(expiresAtRaw);
  const expected = sign(input.secret, input.key, input.actorId, expiresAtMs);

  // Constant time, and length-checked first because timingSafeEqual throws on a length mismatch.
  // A caller who can measure the difference between "wrong signature" and "wrong length" learns
  // nothing useful, but the throw would be a 500 rather than a 403, which they could measure.
  const presentedBytes = Buffer.from(presented);
  const expectedBytes = Buffer.from(expected);
  if (presentedBytes.length !== expectedBytes.length) return { ok: false, reason: "mismatched" };
  if (!timingSafeEqual(presentedBytes, expectedBytes)) return { ok: false, reason: "mismatched" };

  // Expiry is checked after the signature on purpose. Checking it first would answer "is this
  // deadline in the past" for a deadline nobody signed, which turns the endpoint into a clock
  // oracle and, worse, reports "expired" for a token that was forged rather than issued.
  if ((input.now ?? new Date()).getTime() >= expiresAtMs) return { ok: false, reason: "expired" };

  return { ok: true };
}
