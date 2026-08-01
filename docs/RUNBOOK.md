# Runbook, environment matrix and secrets checklist

**Story** E7-S5 · **Written** 2026-08-01 against `main` @ `8765b70` · **Companion to**
[`LOCAL_DEVELOPMENT.md`](LOCAL_DEVELOPMENT.md) (local stack), [`VERCEL_VALIDATION.md`](VERCEL_VALIDATION.md)
(deploy smoke) and [`MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md) (what is missing).

This is the on-call document: how a deploy happens, how to undo one, what to check when something
breaks, and who holds each secret. Every behavioural claim cites a file and line, because a runbook
that describes what the variable names suggest rather than what the code does is worse than none.

**Two things in here are findings rather than instructions.** Read [§7](#7-known-gaps-this-runbook-cannot-close)
before you rely on the rest.

---

## 1. What runs where

| Surface | Host | Deployed from | Entry point |
| --- | --- | --- | --- |
| Buyer/seller app | Vercel project `safebuyrealties-app` | repo root | `vercel.mjs` |
| API | Render, Docker | `backend/` | [`backend/Dockerfile`](../backend/Dockerfile) |
| Database | Prisma Data Platform Postgres | — | shared by local dev, previews **and** production |
| Object storage | local filesystem by default | — | [`storage.service.ts:29-44`](../backend/src/storage/storage.service.ts#L29-L44) |

The browser calls `/api/v1` **same-origin** on the Vercel app, and Vercel rewrites it to Render
using `API_PROXY_TARGET` ([`vercel.mjs:24-28`](../vercel.mjs#L24-L28)). This is not decoration:
session auth is cookie-based, so pointing `VITE_API_URL` at the Render hostname breaks login.

**Render is the API host, and the evidence is dated.** `backend/vercel.json` and
`backend/package.json`'s `vercel-build` script are from 2026-05-25 (`f394bb4`, `bc5df6b`); the Render
wiring replaced them on 2026-06-08 and 2026-06-16 (`ee56156`, `56141f0`). The backend has no
serverless entry point — `start:prod` is `node dist/main.js`, a long-running process — and
`backend/Dockerfile` is how Render builds it. **See [§7.3](#73-a-second-deploy-path-may-still-be-armed):
the older Vercel path still exists in the repo and would run migrations and a seed if it is still
connected.**

---

## 2. Deploy

### 2.1 Frontend

Merging to `main` deploys it. `vercel.mjs:8-13` throws at build time if `API_PROXY_TARGET` is unset,
so a frontend that cannot reach the API fails the build rather than serving a broken app.
`scripts/vercel-ignore-frontend.mjs` skips the build when only backend paths changed.

**After changing `API_PROXY_TARGET` you must redeploy.** It is read at build time, not at request time.

### 2.2 API

Render builds `backend/Dockerfile` and starts the container. The container command is:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

**Every container start migrates the shared database, then boots.** There is no separate migration
step to remember and no separate one to forget. Consequences worth holding in mind:

- A restart — not just a deploy — applies any pending migration.
- If `migrate deploy` fails, the container never starts, and the previous one keeps serving. That is
  the correct failure, and it means *a failed deploy is usually a schema problem, not a code problem*.

The image hard-codes `NODE_ENV=production` and `PORT=3001`, which is what arms the three boot guards
below. Nothing else is baked in; all other configuration comes from Render's environment.

### 2.3 The boot guards, in the order they fire

[`main.ts:9-11`](../backend/src/main.ts#L9-L11) runs three assertions **before** the Nest application
is created. Each calls `process.exit(1)` rather than throwing, so a misconfigured deploy dies loudly
at boot instead of serving wrong answers.

| Guard | Refuses to start when | Source |
| --- | --- | --- |
| `assertSafeDatabaseUrl` | *Non-production only:* `DATABASE_URL` is remote and `SBR_CONFIRM_CLOUD_DATABASE_URL` is not `true` | [`database-guard.ts`](../backend/src/config/database-guard.ts) |
| `assertCorsConfigured` | Production and `FRONTEND_URL` is empty | [`cors-config.ts:150-162`](../backend/src/config/cors-config.ts#L150-L162) |
| `assertPaymentsConfigured` | Production and no Paystack secret key of either kind | [`payments-guard.ts:77-100`](../backend/src/config/payments-guard.ts#L77-L100) |

**A restart loop on Render is almost always one of these three.** The exit message names the variable
and the fix; read the container log's first twenty lines before anything else.

Note the asymmetry: `assertSafeDatabaseUrl` returns early when `DATABASE_URL` is *empty*
([`database-guard.ts:9`](../backend/src/config/database-guard.ts#L9)). An unset database URL is not
caught by a guard — it fails later, inside Prisma.

---

## 3. Rollback

### 3.1 Frontend

Vercel dashboard → Deployments → the last known-good build → **Promote to Production**. Static assets
only; nothing else is affected.

### 3.2 API

Render dashboard → the previous image → **Redeploy**. Then confirm with §5.1.

### 3.3 The rollback caveat that matters

**Rolling back code does not roll back the database.** Prisma migrations here are forward-only: 22
migrations in [`backend/prisma/migrations/`](../backend/prisma/migrations/), none of which has a
`down.sql`, because Prisma's migrate workflow does not generate one.

So if deploy *N* added a migration and you roll back to *N−1*:

- The old code runs against the **new** schema.
- Additive migrations (new nullable column, new table) are usually survivable.
- A destructive one (dropped or renamed column, tightened constraint) will break the old code, and
  the only route forward is a **new** migration that reverses it — written by hand, reviewed, deployed
  forward.

**Before merging any PR that adds a migration, ask whether the previous release could still run
against the new schema.** If the answer is no, that PR has no rollback and its risk should be stated
in its description. Nothing in CI checks this today.

---

## 4. Migrations

The database is **shared between local development, previews and production**. There is one Postgres,
and every environment points at it.

| Task | Command | Where |
| --- | --- | --- |
| Create a migration without applying it | `cd backend && npx prisma migrate dev --create-only --name <feature>` | local |
| Apply pending migrations | `cd backend && npx prisma migrate deploy` | local, or automatic on container start |
| Regenerate the client after schema edits | `cd backend && npx prisma generate` | local |

**Never run `prisma migrate reset`.** It drops every table in the shared database, which includes
production. It is called out in [`AGENT_PROMPT.md:91`](AGENT_PROMPT.md) and
[`HANDOVER_WEEK.md`](HANDOVER_WEEK.md) rule 6 for the same reason.

### 4.1 The seed is a destructive command

`npm run prisma:seed` is `prisma db seed` → [`backend/prisma/seed.ts`](../backend/prisma/seed.ts).
Its first act is:

```ts
if (process.env.SEED_NO_WIPE !== "1") {
  await wipe();
}
```

[`seed.ts:189-192`](../backend/prisma/seed.ts#L189-L192). `wipe()` is 24 consecutive `deleteMany()`
calls covering `user`, `payment`, `payout`, `escrow`, `document`, `transaction` and everything else
([`seed.ts:32-55`](../backend/prisma/seed.ts#L32-L55)) — **the whole database, no filter, no
confirmation prompt, against whatever `DATABASE_URL` points at.**

**Set `SEED_NO_WIPE=1` unless you have confirmed the target database is disposable.**

```bash
cd backend && SEED_NO_WIPE=1 npm run prisma:seed
```

Two existing documents under-warn about this and should be read with this section in hand:
[`LOCAL_DEVELOPMENT.md:63`](LOCAL_DEVELOPMENT.md) offers `npx prisma db seed` with a parenthetical
"(empty or dev-only DB)", and [`VERCEL_VALIDATION.md:60`](VERCEL_VALIDATION.md) recommends
`npm run prisma:seed` for an "Empty DB on new env" with no warning at all. Neither is wrong about its
own case; both are one careless copy-paste away from an outage.

---

## 5. Incident triage

### 5.1 Start here, always

```bash
export SBR_API_BASE="https://safebuyrealties-app.vercel.app/api/v1"
curl -sS -o /dev/null -w '%{http_code}\n' "$SBR_API_BASE/health/live"
curl -sS "$SBR_API_BASE/health/ready" | jq .
```

`/health/live` touches nothing ([`health.controller.ts:43-46`](../backend/src/health/health.controller.ts#L43-L46)) —
it answers only "is the process up".

`/health/ready` checks all three dependencies, each behind its own timeout, and returns **503** when
any of them is unhappy ([`health.controller.ts:52-64`](../backend/src/health/health.controller.ts#L52-L64)).
The body names the broken one:

```json
{ "status": "unavailable", "checks": { "database": "ok", "storage": "misconfigured", "payments": "ok" } }
```

Budgets are database 2000 ms, storage 500 ms, payments 500 ms
([`health-check.ts:17-21`](../backend/src/health/health-check.ts#L17-L21)). The vocabulary is a closed
set — `ok`, `unavailable`, `timeout`, `misconfigured`, `mock` — chosen so the probe cannot leak a
bucket name, hostname or key fragment, so **the probe tells you which dependency, never which value.**

`mock` is a healthy status outside production and a `misconfigured` one inside it
([`health.controller.ts:76-82`](../backend/src/health/health.controller.ts#L76-L82)).

### 5.2 Symptom table

| Symptom | First check | Likely cause and fix |
| --- | --- | --- |
| API restart-looping, never serves | Container log, first 20 lines | One of the three boot guards (§2.3). The message names the variable |
| `/health/ready` → `database: unavailable` | Prisma Data Platform status; `DATABASE_URL` on Render | Wrong or rotated URL, or the platform is down. `timeout` instead means reachable but slow — check pool exhaustion before blaming the network |
| `/health/ready` → `storage: misconfigured` | `STORAGE_DRIVER` on Render | `s3` with `AWS_REGION`/`AWS_S3_BUCKET` missing, or exactly one of the credential pair set. Half a pair silently falls back to ambient credentials, which is why it is treated as broken ([`storage.service.ts:75-89`](../backend/src/storage/storage.service.ts#L75-L89)) |
| `/health/ready` → `payments: misconfigured` | Paystack keys on Render | Production with no secret key. The instance should not have booted at all — if it did, `NODE_ENV`/`VERCEL_ENV` do not say production and §7.2 applies |
| App loads, every API call fails, browser console shows CORS | `FRONTEND_URL` on Render | The origin is not on the allow-list. **There will be no server-side log** — a rejected origin is answered *without* CORS headers rather than with an error ([`cors-config.ts:166-170`](../backend/src/config/cors-config.ts#L166-L170)), so the browser blocks it and the API records a normal 200. Absence of server errors is not evidence against CORS |
| Login succeeds then every request is 401 | Cookie domain | `VITE_API_URL` pointing at the Render hostname instead of `/api/v1`. Cookies are same-origin |
| Preview deploy cannot reach the API | `VERCEL_TEAM_SLUG` on Render | In production only `*-{VERCEL_TEAM_SLUG}.vercel.app` is accepted. Unset means no preview origin is allowed at all, which is deliberate and not a startup failure ([`cors-config.ts:118-140`](../backend/src/config/cors-config.ts#L118-L140)) |
| Customer says they never got a receipt | Container log, search the Service ID | Almost certainly SMTP — see §6.2. **The full receipt text is in the log**, so the customer can be answered from it |
| PoA QR codes point at the wrong site | `POA_VERIFY_BASE_URL` on Render | Unset falls back to the first `FRONTEND_URL` origin + `/verify`, then to `https://safebuyrealties.com/verify` ([`poa-verify-config.ts:24-32`](../backend/src/config/poa-verify-config.ts#L24-L32)). Already-printed codes cannot be recalled |
| Uploaded documents 404 after a deploy | `STORAGE_DRIVER` on Render | If it is `local`, this is expected and unfixable at the config layer — see §7.1 |

---

## 6. Payment and payout failure paths

### 6.1 Mock mode, and how to tell

With no Paystack secret key the API **auto-succeeds payments and writes payouts as `COMPLETED`
without moving money** ([`payments-guard.ts:1-10`](../backend/src/config/payments-guard.ts#L1-L10)).
That is a useful local affordance and a financial fiction in production, which is why production
refuses to boot without a key (§2.3) — this is story E2-S4, ADR-0003.

Every reference minted in mock mode carries the prefix `mock_`
([`payments-guard.ts:59`](../backend/src/config/payments-guard.ts#L59)), and no live Paystack
reference does. **To audit whether any fictional money moved, search stored payment and payout
references for that prefix.** It is the only marker; there is no database column.

### 6.2 Email is best-effort and never blocks a payment

[`email.service.ts:85-117`](../backend/src/email/email.service.ts#L85-L117):

1. The full message is written to the application log **first**, before any send is attempted (`:92`).
2. If `SMTP_HOST` is unset, the method returns — no send, no error (`:94-95`).
3. If the send throws, it is caught and logged as a warning (`:113-116`).

So a payment never fails because email failed, and **no receipt is ever truly lost — it is in the
log.** When a customer reports a missing receipt, search the log for their Service ID and you have the
exact text they should have received.

There is no SMTP host configured today, because that needs a mail domain the client owns — EXT-3,
which blocks story E6-S1 and is the one first-week story the handover week did not land.

### 6.3 Staff alerts

Standalone DD alerts go to `STAFF_ALERT_EMAIL`, falling back to `SMTP_FROM`, falling back to the
literal `ops@safebuyrealties.com` ([`email.service.ts:50-53`](../backend/src/email/email.service.ts#L50-L53)).
The same §6.2 rules apply: with no SMTP host, the alert exists only in the log, so **a standalone DD
request can arrive with nobody notified.** Until EXT-3 lands, the staff queue must be checked by a
person rather than waited on.

---

## 7. Known gaps this runbook cannot close

### 7.1 On the `local` storage driver, documents do not survive a deploy

`STORAGE_DRIVER` defaults to `local` ([`storage.service.ts:60`](../backend/src/storage/storage.service.ts#L60)),
and on a serverless host a relative path is redirected to `/tmp/safebuyrealties-uploads`
([`storage.service.ts:34-42`](../backend/src/storage/storage.service.ts#L34-L42)). On Render's
container filesystem the files survive the process but not a redeploy, because the container is
replaced.

This is story **E3-S2**, durable object storage, blocked on ADR-0004 and external input EXT-2 (a
bucket and credentials). It is the earliest scheduling decision left in the backlog.

**Whether production is affected today depends on `STORAGE_DRIVER` in the Render dashboard, which
cannot be read from this repository.** Check it, and if it reads `local`, treat every uploaded
document as ephemeral until E3-S2 lands.

### 7.2 `JWT_SECRET` has no guard and a hard-coded fallback

Every other critical variable fails closed. This one does not:

```ts
secret: config.get<string>("JWT_SECRET") ?? "dev-secret-change-me",
```

[`auth.module.ts:17`](../backend/src/auth/auth.module.ts#L17), and identically at
[`jwt.strategy.ts:33`](../backend/src/auth/jwt.strategy.ts#L33). With `JWT_SECRET` unset the API
starts normally and signs every seven-day session token with a fixed string that is checked into this
repository. Anyone who can read the source can mint a valid token for any user id, including
`SUPER_ADMIN`, and nothing in the logs would distinguish it from a real login.

There is no boot guard, no test, and no mention of the fallback in any document — two docs list
`JWT_SECRET` as "min 32 characters", which is advice, not enforcement.

**Whether production is exposed depends on a Render environment variable this repository cannot
read — and needing the dashboard to answer "are our sessions forgeable" is itself the finding.**
Recorded as story **E5-S6** in the backlog. Check the dashboard now; do not wait for the story.

### 7.3 A second deploy path may still be armed

[`backend/package.json`](../backend/package.json)'s `vercel-build` script runs:

```text
prisma generate && nest build && node scripts/vercel-migrate.mjs && node scripts/vercel-seed-if-empty.mjs && …
```

If the Vercel project `safebuyrealties` listed in [`.vercel/repo.json`](../.vercel/repo.json) is still
connected to this repository, **every push touching `backend/` runs a migration and a conditional
seed against the shared production database**, independently of Render.

`vercel-seed-if-empty.mjs` is careful — it skips when the demo user exists, and sets `SEED_NO_WIPE=1`
when the user table is non-empty but the demo data is missing — so the destructive path needs an
empty `user` table to fire. That is a narrow window and a total blast radius.

**Confirm in the Vercel dashboard whether that project still builds.** If it does not, the scripts
are dead weight and deleting them is a small chore. If it does, there are two deploy paths and only
one of them is documented anywhere.

### 7.4 The container healthcheck does not use the readiness probe

`backend/Dockerfile`'s `HEALTHCHECK` polls `/api/v1/health` — the original bare endpoint at
[`health.controller.ts:25`](../backend/src/health/health.controller.ts#L25), which returns `200` from
static values and touches no dependency. E7-S6 (#101) added `/health/ready`, which is the endpoint
that would actually detect a broken deploy, and the Dockerfile was not updated to point at it.

**A container with an unreachable database therefore passes its own healthcheck.** Recorded as story
**E7-S6b**. It is a one-line change, but it is a change to a deploy file and this is a documentation
story, so it is written down rather than slipped in.

---

## 8. Environment matrix

**Owner** uses the vocabulary of the backlog's external-inputs table (§3.3): *Client* holds
commercial credentials, *Corne Labs* holds infrastructure the team provisions.

Legend: **R** required · **O** optional · **—** not applicable · **!** required but silently defaulted.

### 8.1 API (Render environment)

| Variable | Local | Preview | Production | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | R | R | R | Corne Labs | Pooled connection. Empty is **not** caught by a guard ([`database-guard.ts:9`](../backend/src/config/database-guard.ts#L9)) |
| `DATABASE_POSTGRES_URL` | R | R | R | Corne Labs | Direct connection, preferred by the deploy-time migration scripts |
| `SBR_CONFIRM_CLOUD_DATABASE_URL` | R | — | — | — | Local opt-in to a remote DB. Ignored in production |
| `JWT_SECRET` | ! | ! | **!** | Corne Labs | **No guard — falls back to `dev-secret-change-me`. See §7.2** |
| `PORT` | O | — | — | — | Defaults to 3001; the image sets it |
| `NODE_ENV` | O | O | R | — | The image sets `production`. Drives all three boot guards |
| `FRONTEND_URL` | R | R | R | Corne Labs | Comma-separated origins. **Production will not boot without it** |
| `VERCEL_TEAM_SLUG` | O | O | O | Corne Labs | The only thing admitting a preview origin in production. Unset = no previews |
| `VERCEL_ENV` | — | O | O | — | Platform-set. `production` counts as production for every guard |
| `PAYSTACK_SECRET_KEY` | O | O | R | Client (EXT-1) | **Production will not boot without this or the test key.** See §7.5 below |
| `PAYSTACK_PUBLIC_KEY` | O | O | R | Client (EXT-1) | Served to the browser by `platform-config` |
| `PAYSTACK_TEST_SECRET_KEY` | O | O | O | Client | Satisfies the production guard — deliberately, and see §7.5 |
| `PAYSTACK_TEST_PUBLIC_KEY` | O | O | O | Client | |
| `PAYSTACK_FORCE_MOCK` | O | — | — | — | Honoured only when `NODE_ENV` is `development` or `test`; elsewhere ignored with a startup warning |
| `PAYSTACK_PAYOUT_BANK_CODE` | O | O | O | Client | Defaults to Zenith `057` |
| `PAYSTACK_PAYOUT_ACCOUNT_NUMBER` | O | O | O | Client | Defaults to `0000000000` |
| `STORAGE_DRIVER` | O | O | **R** | Corne Labs | `local` or `s3`. An unknown value throws at construction. **`local` in production means §7.1** |
| `STORAGE_LOCAL_PATH` | O | O | — | — | Preferred over `UPLOAD_DIR` |
| `UPLOAD_DIR` | O | O | — | — | Legacy alias |
| `AWS_REGION` | — | — | R if `s3` | Client or Corne Labs (EXT-2) | |
| `AWS_S3_BUCKET` | — | — | R if `s3` | Client or Corne Labs (EXT-2) | |
| `AWS_ACCESS_KEY_ID` | — | — | R if `s3` | Client or Corne Labs (EXT-2) | Half a pair is treated as broken by the readiness probe |
| `AWS_SECRET_ACCESS_KEY` | — | — | R if `s3` | Client or Corne Labs (EXT-2) | |
| `AWS_S3_ENDPOINT` | — | — | O | Corne Labs | For non-AWS S3-compatible stores |
| `POA_VERIFY_BASE_URL` | O | R | R | Corne Labs | Unset falls back through `FRONTEND_URL` to `safebuyrealties.com`. **A wrong value is printed onto instruments that cannot be recalled** |
| `SMTP_HOST` | O | O | R | Client (EXT-3) | **Unset means every email is silently skipped** — §6.2 |
| `SMTP_PORT` | O | O | O | Client (EXT-3) | Defaults to 587; 465 switches on TLS |
| `SMTP_USER` | O | O | R | Client (EXT-3) | Auth is omitted unless both user and pass are set |
| `SMTP_PASS` | O | O | R | Client (EXT-3) | |
| `SMTP_FROM` | O | O | R | Client (EXT-3) | Defaults to `noreply@safebuyrealties.com` |
| `STAFF_ALERT_EMAIL` | O | O | O | Client | Falls back to `SMTP_FROM`, then `ops@safebuyrealties.com` |
| `SEED_NO_WIPE` | **use it** | — | — | — | `1` prevents the seed wiping every table. See §4.1 |

**§7.5 — a test key satisfies the production guard.** `hasPaymentSecretKey()` accepts either variable
([`payments-guard.ts:30-33`](../backend/src/config/payments-guard.ts#L30-L33)) and `secretKey()` falls back
from live to test ([`paystack.service.ts:46-50`](../backend/src/payments/paystack.service.ts#L46-L50)).
This is deliberate and covered by a test — `payments-guard.spec.ts:65`, *"accepts the test key variable
as a credential"*. The operational consequence is not written down anywhere else, so it is written
here: **a production deploy carrying only `PAYSTACK_TEST_SECRET_KEY` boots, transacts against Paystack
test mode, and stamps every record as live.** No money moves and no `mock_` prefix marks the records,
so §6.1's audit will not find them. Before go-live, confirm the production key begins `sk_live_`.

### 8.2 Frontend (Vercel project `safebuyrealties-app`)

| Variable | Local | Preview | Production | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| `API_PROXY_TARGET` | O | R | R | Corne Labs | Render service URL. **Build fails without it.** Redeploy after changing |
| `VITE_API_URL` | O | O | O | — | Defaults to `/api/v1`. **Keep it relative** — cookies are same-origin |
| `SBR_API_PROXY_TARGET` | O | — | — | — | Local-only alias for pointing Vite at a remote API |
| `VITE_DEV_HOST` | O | — | — | — | Local dev host binding |

### 8.3 Tooling only

`SBR_API_BASE`, `SBR_APP_URL`, `SBR_EMAIL`, `SBR_PASSWORD` and `CHROME_PATH` are read by the scripts in
[`scripts/`](../scripts/) (smoke tests, E2E journeys, PDF generation). None is read by the application.
`SBR_PASSWORD` is a seed-account password for E2E runs and must never hold a real credential.

---

## 9. Secrets checklist

### 9.1 The inventory

| Secret | Holder | Stored in | Rotation | On rotation you must also |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` / `DATABASE_POSTGRES_URL` | Corne Labs | Prisma Data Platform; Render env; each developer's `backend/.env` | On team change, or immediately on suspected exposure | Update Render **and** tell every developer — a stale local URL is a silent failure |
| `JWT_SECRET` | Corne Labs | Render env only | **90 days**, and immediately if §7.2 finds it unset | Rotation logs every user out — all tokens are seven-day and signed with the old value. Do it deliberately, not during an incident |
| `PAYSTACK_SECRET_KEY` | Client (EXT-1) | Paystack dashboard; Render env | Per Paystack policy; immediately on exposure | Rotate the public key with it and redeploy the frontend |
| `PAYSTACK_TEST_SECRET_KEY` | Client | Paystack dashboard; Render env; `backend/.env` | Not sensitive — test mode moves no money | Confirm it is not the only key in production (§7.5) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Client or Corne Labs (EXT-2) | Not yet provisioned | **90 days** once E3-S2 lands | Both halves together — one half alone fails the readiness probe |
| `SMTP_USER` / `SMTP_PASS` | Client (EXT-3) | Not yet provisioned | On mail-provider policy | Nothing else; email failure is non-blocking (§6.2) |
| Vercel deploy token | Corne Labs | Vercel dashboard | On team change | |
| Render deploy credentials | Corne Labs | Render dashboard | On team change | |

### 9.2 Standing rules

- **No secret is in git**, and the two `.env.example` files are templates carrying placeholders only.
  `.gitignore` covers every `.env*` name except those templates. Nothing enforces this automatically —
  it is a review responsibility.
- **`.vercel/README.txt` and `.vercel/repo.json` are tracked** despite `.vercel/*` being ignored, and
  `repo.json` carries project and org ids. Those are identifiers rather than credentials, so this is
  untidiness rather than an exposure, but it is the kind of untidiness worth not repeating.
- **The health endpoints never carry a secret.** `/health` reports `paymentsConfigured` as a bare
  boolean, deliberately, so it cannot narrow a guess ([`health.controller.ts:27-35`](../backend/src/health/health.controller.ts#L27-L35));
  `/health/ready` reports from a closed vocabulary of five literals for the same reason.
- **On suspected exposure of any credential:** rotate at the source first, update Render, redeploy,
  then confirm with §5.1. Rotating the environment variable without rotating the credential itself
  changes nothing.

### 9.3 Before go-live

Four things in this document need a dashboard nobody had during the handover week. Check them in this
order — the first two are security, the second two are correctness.

1. `JWT_SECRET` is set in Render and is not `dev-secret-change-me` (§7.2).
2. `PAYSTACK_SECRET_KEY` begins `sk_live_` and is not merely a test key (§7.5).
3. `STORAGE_DRIVER` is `s3`, not `local` (§7.1) — gated on E3-S2.
4. The Vercel `safebuyrealties` backend project is disconnected, or its second deploy path is
   documented (§7.3).

---

## 10. What this story did not need to do

Criterion 4 of E7-S5 asks for `docs/BUILD_CHECKLIST.md` to be reconciled against the backlog, closing
DOCS-1. **DOCS-1 did that on day 1** and it is verified rather than redone here: the file opens with a
dated accuracy notice, carries an *Audit corrections* table, and marks three overstated items `[!]`
against 59 `[x]`. It also states that it is no longer the work queue and points at the backlog.

That audit was run against `fc05e1e`, before the week's merges. Re-running it against HEAD is story
**DOCS-4**, deliberately scheduled last, and is not duplicated here.
