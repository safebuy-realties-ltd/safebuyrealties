import { Injectable } from "@nestjs/common";
import { resolveJwtSecret } from "../config/jwt-secret";
import {
  DOCUMENT_GRANT_TTL_SECONDS,
  type DocumentGrant,
  type DocumentGrantVerdict,
  issueDocumentGrant,
  verifyDocumentGrant,
} from "./document-grants";

/**
 * The one place that holds the grant signing key and the lifetime (E1-S3 criterion 2).
 *
 * `document-grants.ts` is the algorithm and takes its secret as an argument, which is what keeps it
 * testable without a module. This is the part that knows where the secret comes from and how long a
 * link should live, so neither answer is duplicated between the route that issues grants and the
 * controller that checks them. Two consumers, one setting.
 *
 * Resolved once at construction rather than per call. `resolveJwtSecret()` is already read this way
 * by the auth module at boot, and a key that could change under a running process would mean grants
 * issued a minute ago stop verifying for no reason a reader could work out.
 */
@Injectable()
export class DocumentGrantService {
  private readonly secret = resolveJwtSecret();

  /** Fifteen minutes. Exposed so a caller can state the window without restating the number. */
  readonly ttlSeconds = DOCUMENT_GRANT_TTL_SECONDS;

  /**
   * A grant for this actor to read this one key, good until `expiresAt`.
   *
   * `now` is injectable so a caller issuing several grants in one response can stamp them all from
   * a single instant, which is what makes "these three links expire together" true rather than
   * approximately true.
   */
  issue(key: string, actorId: string, now?: Date): DocumentGrant {
    return issueDocumentGrant({
      key,
      actorId,
      secret: this.secret,
      ttlSeconds: this.ttlSeconds,
      now,
    });
  }

  /** Whether a presented grant covers this key for this actor, right now. */
  verify(
    token: string | undefined | null,
    key: string,
    actorId: string,
    now?: Date,
  ): DocumentGrantVerdict {
    return verifyDocumentGrant({ token, key, actorId, secret: this.secret, now });
  }
}
