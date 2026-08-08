# Security posture

**Assessed 2026-08-08 against `main` @ `dd64e55`.** Re-derive it with `npm run validate:security
-- --report`, which prints the current advisory set without failing, and by re-reading the code
citations below. Rule 11 in [docs/HANDOVER_WEEK.md](HANDOVER_WEEK.md) is the standing instruction
this document exists to serve.

## Read this first, because the heading is misleading

This is an internal assessment. The people who wrote it are the people who wrote the code, so it is
useful for exactly one thing: knowing what we already understand about our own attack surface, so
that the people we eventually pay to break it do not spend their first two days rediscovering it.

**It does not fulfil EXT-6 and no future version of it ever will.** E8-S3 criterion 1 asks for a
review by an independent party, gate G5 reads "no high findings outstanding", and only somebody who
was not paid to build this can attest to either. A green `npm run validate:security` means the
dependency gate held. It does not mean the application was reviewed.

Everything below is a claim with a file and a line behind it. If a claim is wrong, the fix is to
correct this document in the same pull request that proves it wrong, not to leave both versions
standing.

---

## 1. Dependency posture

Two npm trees, the frontend at the repository root and the backend under `backend/`. Counted as
distinct `(workspace, advisory, package)` rows rather than as vulnerable packages, because one
package commonly carries several advisories and the two counts differ by more than a factor of two.

| | Root | Backend | Total |
| --- | --- | --- | --- |
| Distinct advisories | 36 | 17 | **53** |
| Critical | 1 | 0 | 1 |
| High | 17 | 12 | 29 |
| Moderate | 14 | 4 | 18 |
| Low | 4 | 1 | 5 |
| **Reachable from application code** | **0** | **2** | **2** |

`npm audit` reports the same trees as 23 vulnerable packages at the root and 8 in the backend. Both
numbers are correct and they answer different questions. Quote the advisory count when talking about
findings and the package count when talking about upgrades.

Every one of the 53 is recorded in [docs/security/advisory-baseline.json](security/advisory-baseline.json)
with a CWE, an OWASP Top 10 (2021) category, a `reachable` verdict, the reasoning behind that
verdict, and who decided it. That file is the input to the CI gate.

### 1.1 The two that are reachable

Both are in `multer`, both are availability rather than disclosure, and both are filed as **CH-8**.

| Advisory | Severity | CWE | What it is |
| --- | --- | --- | --- |
| GHSA-72gw-mp4g-v24j | High | CWE-400 | Denial of service through deeply nested multipart field names |
| GHSA-3p4h-7m6x-2hcm | Moderate | CWE-459 | Denial of service through incomplete cleanup after an aborted upload |

`multer@2.1.1` arrives transitively under `@nestjs/platform-express@11.1.19`, and it is wired through
`FileInterceptor` or `FilesInterceptor` in five controllers:

- [backend/src/kyc/kyc.controller.ts](../backend/src/kyc/kyc.controller.ts)
- [backend/src/professionals/professionals.controller.ts](../backend/src/professionals/professionals.controller.ts)
- [backend/src/due-diligence/due-diligence-assignments.controller.ts](../backend/src/due-diligence/due-diligence-assignments.controller.ts)
- [backend/src/documents/documents.controller.ts](../backend/src/documents/documents.controller.ts)
- [backend/src/standalone-dd/standalone-dd.controller.ts](../backend/src/standalone-dd/standalone-dd.controller.ts)

The KYC identity-document upload sits on that path, which is the reason this is not being left to
drift. Fixed in `multer` 2.2.0. Because it is transitive the fix is either a `@nestjs/platform-express`
bump that pulls it, or a pinned `overrides` entry, and CH-8 has to say which.

### 1.2 The one critical

`seroval@1.5.2`, GHSA-mv8w-475r-vwqw, CWE-502 and CWE-843. `seroval.fromJSON()` resolves Promise
values in a way that lets a crafted payload invoke attacker-controlled methods during
deserialization. It is transitive under `@tanstack/react-router@1.168.21` and three
`@tanstack/start-*` packages, and the fix is `@tanstack/react-start` past 1.167.63 with
`@tanstack/start-server-core` at 1.167.30 or later.

**Verdict: unproven, not cleared.** The server-side render path deserializes on every render, so it
could not be ruled out the way its sibling below was. Filed as **CH-9**. Rule 11 treats an unproven
critical the same as a reachable one, which is why the baseline will not pass without a story
attached.

### 1.3 The negative findings, which are the point of doing this by hand

A scanner reports all 53. A person has to say which ones matter, and saying "no" in writing is the
part that saves the time later.

- **`@tanstack/start-server-core`, GHSA-9m65-766c-r333: not reachable.** The vulnerable path is the
  deserialization of an inbound server-function request. `createServerFn` and `createServerFileRoute`
  appear nowhere under `src/`. This application does not use server functions, so the entry point
  does not exist. A tool would have filed this as a finding.
- **`nodemailer`, GHSA-p6gq-j5cr-w38f: not reachable.** The bug needs the `raw` message option and
  `raw` is passed to nodemailer nowhere in `backend/src`. The five textual hits on `raw` are
  unrelated identifiers in `trust-proxy.ts`, `storage-guard.ts` and `feature-flags.constants.ts`.
- **`dompurify`: not reachable.** Zero imports under `src/`. The single `dangerouslySetInnerHTML` in
  the codebase is [src/components/ui/chart.tsx:73](../src/components/ui/chart.tsx#L73), which
  interpolates a theme string this repository generates.
- **`body-parser`, GHSA-v422-hmwv-36x6: not reachable.** It needs an invalid `limit` option and this
  application passes no limit at all.
- **`fast-uri`, five high advisories: not in the production tree.** `npm ls fast-uri --omit=dev` in
  `backend/` is empty.
- **`sharp` and `nanoid`: not reachable.** Neither is a direct dependency and neither is imported.
- **`undici`, eleven advisories: unproven, none reachable today.** The SOCKS5, shared-cache and
  WebSocket entries each need a deployment feature this project does not run. Revisit at the hosting
  cutover, because that is a deployment change and these verdicts are deployment-dependent.
- **`@babel/core`, `brace-expansion`, `esbuild`, `js-yaml`, `playwright`, `postcss`, `vite`, `ws`,
  `qs`: build toolchain or trusted input.** They run against this repository's own sources at build
  or test time and take nothing from a user.

---

## 2. Code posture, mapped to the OWASP Top 10 (2021)

What exists, with citations, and what is missing. A row with a gap is not a defect report, it is a
place a reviewer should look first.

### A01, broken access control

Four guards and a route inventory, all under `backend/src/common/guards/`: `roles.guard.ts`,
`permissions.guard.ts`, `feature.guard.ts`, `maintenance.guard.ts`. `route-inventory.ts` enumerates
every route and `privilege-matrix.spec.ts` asserts the role and permission required for each, so a
route added without a guard fails the backend test suite rather than shipping open. That test is the
strongest single control in this codebase and it is the first thing a reviewer should try to defeat.

### A02, cryptographic failures

`bcryptjs` at cost 10 for password hashing:
[auth.service.ts:123](../backend/src/auth/auth.service.ts#L123) on registration,
[:179](../backend/src/auth/auth.service.ts#L179) on login,
[:242](../backend/src/auth/auth.service.ts#L242) when an activation link sets the first password.
Guest accounts get a `randomBytes(32)` password nobody can use, at
[guest-checkout.service.ts:143](../backend/src/guest-checkout/guest-checkout.service.ts#L143).
`assertJwtSecret` in [backend/src/config/jwt-secret.ts](../backend/src/config/jwt-secret.ts)
requires 32 characters and rejects the example value by name, and it exits the process rather than
throwing, so a misconfigured deployment does not come up serving tokens signed with a guessable key.

### A03, injection

The SQL surface is close to nil. Prisma is the only data access path and the only raw query in the
backend is [health.controller.ts:76](../backend/src/health/health.controller.ts#L76),
a parameterless `$queryRaw` tagged template holding `SELECT 1`. Input is validated at the edge
by a global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true` and
`transform: true` at [app-bootstrap.ts:84-87](../backend/src/app-bootstrap.ts#L84-L87), so an
unexpected field is a 400 rather than something that reaches a service.

### A04, insecure design

Financial features ship behind flags that default to off, enforced by `feature.guard.ts` and named
in `backend/src/config/feature-flags.constants.ts`. Money-moving actions sit behind a KYC gate,
delivered in E4-S2.

### A05, security misconfiguration

`helmet` at [app-bootstrap.ts:76](../backend/src/app-bootstrap.ts#L76) with HSTS at 31536000 seconds,
`includeSubDomains` and `preload`. CSP is deliberately off on the API, which serves JSON and has no
document surface to protect. CORS is configured in `backend/src/config/cors-config.ts`. A storage
boot guard refuses to start with a half-configured bucket.

**Gap, known and open:** `securityHeadersMiddleware` in [src/start.ts](../src/start.ts) does not run
on a 404 or on a router redirect, so production answers `/dashboard` and any invented path with no
CSP, no `X-Frame-Options` and no `Referrer-Policy`. This was found during PR #130 and it is still
true. It is a clickjacking and framing exposure on exactly the paths an attacker picks.

### A06, vulnerable and outdated components

Section 1 above, plus the CI gate in section 4. **Before this branch there was no security tooling of
any kind in this repository:** no `dependabot.yml`, no CodeQL, no Snyk, no semgrep, no trivy, no
gitleaks, no OSV scan, and `.github/workflows/` held exactly one file. Rule 11 is the first thing to
close that, and it closes only the dependency half.

### A07, identification and authentication failures

Brute-force lockout in [backend/src/auth/login-attempts.service.ts](../backend/src/auth/login-attempts.service.ts),
with a spec. A hand-rolled `ThrottleGuard` at
[backend/src/common/guards/throttle.guard.ts](../backend/src/common/guards/throttle.guard.ts) is
wired globally in [app.module.ts:83-86](../backend/src/app.module.ts#L83-L86) and applied by name at
nine points, two of which are whole controllers. The seven buckets are `login`, `register`,
`refresh`, `activate`, `payment_initiate`, `webhook` and `guest_checkout`. **This project is not
missing rate limiting.** It is missing `@nestjs/throttler`, which is a different sentence and the
reason searching for the library name finds nothing. Search for the behaviour.

**Gap:** the auth cookie is `sameSite: "lax"` at
[auth.controller.ts:57](../backend/src/auth/auth.controller.ts#L57) rather than `strict`. Lax is a
defensible choice and it should be a recorded one rather than a default nobody revisited.

### A08, software and data integrity failures

The `seroval` critical in section 1.2 is this category. The Paystack webhook is throttled and its
signature is checked before the body is trusted:
[webhooks.controller.ts:24-26](../backend/src/payments/webhooks.controller.ts#L24-L26) reads
`x-paystack-signature` and rejects with a 401, and
[paystack.service.ts:113-116](../backend/src/payments/paystack.service.ts#L113-L116) verifies it
against the secret using the vendor SDK, returning false when either the secret or the header is
absent rather than falling open.

### A09, security logging and monitoring failures

Correlation-id middleware, a `RequestActorInterceptor` that attaches the acting user to everything
downstream, an `HttpExceptionFilter` that normalises errors including the `BAD_GATEWAY` case, and an
audit module that records privileged actions.

**Gap:** there is no alerting. Records are written and nobody is paged. That is a monitoring gap
rather than a logging one, and it belongs in the hosting cutover work rather than here.

### A10, server-side request forgery

There is exactly one `fetch` in the whole backend,
[error-tracker.service.ts:139](../backend/src/common/logging/error-tracker.service.ts#L139), and its
URL comes from `ERROR_TRACKER_WEBHOOK_URL` rather than from a request. It returns early when that
variable is unset and it carries a three second `AbortSignal.timeout`. Everything else outbound goes
through the Paystack SDK or the configured SMTP host. No user-supplied URL is fetched anywhere.

---

## 3. Pentest posture, and what EXT-6 still needs

**As of 2026-08-08, nothing is booked.** No vendor is engaged, no scope is agreed, no window is held,
no environment is nominated, no rules of engagement exist, and no report or re-test date is set.
EXT-6 depends on nothing upstream. It has been bookable on any working day since it was raised, and
the reason it has not moved is that it looks small.

The eight things that close it, listed in full in
[docs/MVP_OUTSTANDING_BACKLOG.md](MVP_OUTSTANDING_BACKLOG.md) under "EXT-6, what closes it":

1. The vendor and a named contact
2. A scope covering authentication, authorization, payments and document handling, explicitly
   including the escrow payment path and the KYC document store
3. Whether the engagement is black, grey or white box
4. The environment, which must not be production carrying live customer data
5. Start and end dates
6. Rules of engagement: the seeded test data set, any out-of-hours constraint, and who to call when
   something breaks mid-test
7. The date the report is due
8. **The date the re-test letter is due**, which is a separate artifact under E8-S3 criterion 4 and
   the thing that actually closes gate G5

Hand this document to the vendor when they are engaged. Sections 1.3 and 2 tell them what has already
been ruled out and where the two known gaps are, which is time they can spend somewhere useful.

---

## 4. The gate, and how to add an advisory

`npm run validate:security` runs [scripts/check-security.mjs](../scripts/check-security.mjs) against
both trees. It is a ratchet rather than a threshold: it does not require zero advisories, it requires
that every advisory has been judged by a person.

It fails when an advisory is present in the trees but absent from the baseline, and when a baseline
entry is either reachable at high or critical severity, or critical and not explicitly cleared, with
no `story` naming the work that fixes it. A resolved advisory still sitting in the baseline is a note
rather than a failure, and an unreachable registry exits 0 with a warning so a network outage does not
block a pull request.

To add one, append to [docs/security/advisory-baseline.json](security/advisory-baseline.json) with
every field filled in:

```json
{
  "id": "GHSA-xxxx-xxxx-xxxx",
  "package": "example",
  "workspace": "backend",
  "severity": "high",
  "cwe": "CWE-400",
  "owasp": "A06:2021",
  "reachable": "no",
  "why": "One or two sentences naming the code path, or naming what is absent.",
  "reviewBy": "Name, YYYY-MM-DD",
  "story": "CH-n"
}
```

`reachable` takes `yes`, `no` or `unproven` and it is the only field a tool cannot fill in for you.
`why` has to name the path or name what is missing. "Looks fine" is not a verdict, and a `reachable`
of `no` with no reasoning behind it is worse than no baseline at all, because it looks like a decision.
