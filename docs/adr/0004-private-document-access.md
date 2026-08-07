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

> **Closed 2026-08-07 by ADR-0006.** The sentence above is left as it was written, because it was true
> for nine days and the record of what was open matters as much as the answer.
> `0006-deployment-target-and-runtime-environment.md` puts the bucket in a **Nigerian region** and moves
> the application off Vercel onto self-managed Nigerian infrastructure. The residency implication is
> discharged rather than satisfied: with the data in Nigeria there is no transfer, so §12 of the client's
> data protection policy never engages and none of its three conditions has to be met. That also disposes
> of the half of EXT-11 Legal did not answer, which asked which of the three conditions the running
> infrastructure sits under.
>
> This ADR is otherwise unchanged and still reads **Proposed**. Its access half shipped as E3-S1 and its
> six sub-stories, #103 to #112; its storage half is E3-S2, which now waits on EXT-2, the bucket and its
> credentials, and on nothing else. **Nothing here is a ratification of the access half.** Backlog
> decision D4 is answered; this ADR's own acceptance is not, and the closure schedule still asks for it.
>
> One residual survives the close. EXT-11 established that the NDPA 2023 and the GAID 2025 govern rather
> than either company policy, so the statutory closed list of transfer conditions applies and the
> published policy's "reasonable steps" wording does not. A Nigerian region needs no transfer instrument,
> which is why this is discharged; but if production data is ever placed outside Nigeria, it may not go
> until an NDPC-approved Cross-Border Data Transfer Instrument or standard contractual clauses are
> executed with the hosting provider and the relevant subprocessors, and documented. No such instrument
> exists in this repository. Until one does, no production transfer may rely on general consent or on
> reasonable steps.
