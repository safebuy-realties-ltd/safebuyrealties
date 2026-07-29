# ADR-0004 — Private documents move behind authorization

- **Status:** Proposed. Raised 2026-07-29.
- **Backlog reference:** decision D4, stories E3-S1, E3-S2, E3-S3, gate G3.

## Context

`main.ts:23` mounts `app.use("/uploads", express.static(resolveUploadRoot()))` before any guard.
`StorageService.getSignedUrl` returns a plain `/uploads/{key}` path for the local driver, which is the default
(`storage.service.ts:40`). Title deeds, government identity documents, KYC selfies, professional credentials and
due diligence reports all resolve to that path. Anyone who obtains or guesses a storage key can fetch the file
with no session.

Separately, when running on Vercel with no absolute upload directory the local root becomes
`/tmp/safebuyrealties-uploads` (`storage.service.ts:22`), which does not persist between serverless
invocations, so production uploads are effectively write-only.

The platform's proposition is document trust, and its clients were previously defrauded.

## Decision

Private files are reachable only through an authorization-checked endpoint that streams the object or issues a
short-lived pre-signed URL, and every access is audited. The unauthenticated static mount is removed. Public
listing imagery, if it stays public, moves to a separate prefix that only ever holds listing media.

Production requires an S3-compatible driver with public reads denied at the bucket policy. The application
refuses to start on a serverless platform with the local driver.

## Consequences

Development keeps the local driver, documented as development only. A migration pass must copy recoverable
objects and report the keys it cannot find rather than failing silently.

Region selection is an open sub-decision with NDPR data-residency implications.
