import {
  DOCUMENT_GRANT_TTL_SECONDS,
  issueDocumentGrant,
  verifyDocumentGrant,
} from "./document-grants";

/**
 * The grant is the whole of E1-S3 criterion 2, so these tests are written as the attacks rather
 * than as the happy path with a few negatives after it. Each one is somebody trying to get a
 * document they are not entitled to at this moment: the buyer coming back tomorrow, the friend the
 * link was forwarded to, the caller editing the URL.
 */
describe("document grants", () => {
  const SECRET = "test-secret-value-for-document-grants";
  const KEY = "due-diligence/order-1/reports/1700000000000-report.pdf";
  const ACTOR = "buyer-1";
  const NOW = new Date("2026-01-01T12:00:00.000Z");

  const issue = (over: Partial<Parameters<typeof issueDocumentGrant>[0]> = {}) =>
    issueDocumentGrant({ key: KEY, actorId: ACTOR, secret: SECRET, now: NOW, ...over });

  const verify = (over: Partial<Parameters<typeof verifyDocumentGrant>[0]> = {}) =>
    verifyDocumentGrant({
      token: issue().token,
      key: KEY,
      actorId: ACTOR,
      secret: SECRET,
      now: NOW,
      ...over,
    });

  it("accepts the grant it issued, for the key and actor it was issued to", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("expires fifteen minutes out and not a second later", () => {
    expect(DOCUMENT_GRANT_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
    expect(issue().expiresAt.getTime() - NOW.getTime()).toBe(DOCUMENT_GRANT_TTL_SECONDS * 1000);
  });

  it("holds up to the last moment of its window and refuses the first moment past it", () => {
    const grant = issue();
    const lastGood = new Date(grant.expiresAt.getTime() - 1);

    expect(verify({ token: grant.token, now: lastGood })).toEqual({ ok: true });
    expect(verify({ token: grant.token, now: grant.expiresAt })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses a forwarded link, because the grant names the reader", () => {
    // The whole URL, grant and all, handed to somebody else with a valid session of their own.
    expect(verify({ actorId: "buyer-2" })).toEqual({ ok: false, reason: "mismatched" });
  });

  it("refuses a grant pointed at a different document", () => {
    // Single-purpose: the token opens one key, so swapping the key in the query string fails.
    expect(verify({ key: "due-diligence/order-1/reports/1700000000000-other.pdf" })).toEqual({
      ok: false,
      reason: "mismatched",
    });
  });

  it("refuses an expiry edited forward, because the deadline is signed", () => {
    const grant = issue();
    const signature = grant.token.slice(grant.token.indexOf(".") + 1);
    const nextYear = new Date("2027-01-01T12:00:00.000Z").getTime();

    expect(verify({ token: `${nextYear}.${signature}`, now: NOW })).toEqual({
      ok: false,
      reason: "mismatched",
    });
  });

  it("refuses a grant signed with another secret", () => {
    expect(verify({ secret: "a-different-secret-entirely" })).toEqual({
      ok: false,
      reason: "mismatched",
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["no separator", "1767268800000"],
    ["no expiry", ".signature"],
    ["no signature", "1767268800000."],
    ["a non-numeric expiry", "soon.signature"],
    ["a negative expiry", "-1.signature"],
  ])("rejects a token that is %s without pretending it expired", (_label, token) => {
    expect(verify({ token })).toEqual({ ok: false, reason: "malformed" });
  });

  it("calls a forged token forged rather than expired, whatever deadline it claims", () => {
    // Reporting "expired" here would tell an attacker their signature was accepted and only the
    // clock stopped them, which is the opposite of true.
    const longGone = new Date("2020-01-01T00:00:00.000Z").getTime();

    expect(verify({ token: `${longGone}.not-a-real-signature-at-all` })).toEqual({
      ok: false,
      reason: "mismatched",
    });
  });

  it("gives two readers of the same document different grants", () => {
    expect(issue().token).not.toEqual(issue({ actorId: "buyer-2" }).token);
  });

  it("does not let a key and an actor be confused for one another", () => {
    // Naive concatenation would sign the same bytes for both of these. The length prefix on the
    // key is what stops one caller's grant verifying for a different caller and document.
    const a = issueDocumentGrant({ key: "kyc/a", actorId: "b/c", secret: SECRET, now: NOW });
    const b = issueDocumentGrant({ key: "kyc/a\nb", actorId: "c", secret: SECRET, now: NOW });

    expect(a.token).not.toEqual(b.token);
  });
});
