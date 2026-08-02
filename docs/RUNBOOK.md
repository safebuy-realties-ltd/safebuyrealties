# Runbook, environment matrix and secrets checklist

**Story** E7-S5 · **Written** 2026-08-01 against `main` @ `8765b70` · **Companion to**
[`LOCAL_DEVELOPMENT.md`](LOCAL_DEVELOPMENT.md) (local stack), [`VERCEL_VALIDATION.md`](VERCEL_VALIDATION.md)
(deploy smoke) and [`MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md) (what is missing).

This is the on-call document: how a deploy happens, how to undo one, what to check when something
breaks, and who holds each secret. Every behavioural claim cites a file and line, because a runbook
that describes what the variable names suggest rather than what the code does is worse than none.

**[§7](#7-known-gaps-this-runbook-cannot-close) is findings rather than instructions** — gaps this
document can describe but not close. Read it before you rely on the rest. Two entries, §7.2 and §7.4,
are now closed and kept there for the follow-ups the fixes cannot do for you — both need somebody
holding the Render dashboard.

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

The image hard-codes `NODE_ENV=production` and `PORT=3001`, which is what arms the four boot guards
below. Nothing else is baked in; all other configuration comes from Render's environment.

**Health checks: what the image does, and what Render does. These are two different mechanisms.**

The image's `HEALTHCHECK` polls `/api/v1/health/ready` and treats anything other than `200` as
unhealthy ([`Dockerfile:50-51`](../backend/Dockerfile#L50-L51), E7-S6b). Its `--start-period` is 180s
because the container migrates before it serves and readiness cannot pass until it has. That is what
Docker runs — `docker run`, Compose, anything that reads the image's own metadata.

**Render does not run it.** Render sends its own checks every few seconds, configured outside the
image: a **Health Check Path** on the service's Settings page, or `healthCheckPath` in a Blueprint.
There is no `render.yaml` in this repository, so the live value is whatever is set in the dashboard
and nothing here can tell you what that is. **With no path set, Render's check is a TCP probe against
the open port** — which a container with a dead database passes, exactly as the old image healthcheck
did. Fixing the image did not fix that; only the dashboard can.

What Render does when its own check fails ([health checks](https://render.com/docs/health-checks)):

| Render | When |
| --- | --- |
| Withholds traffic from a new deploy's instances | Until all of them pass at the same time |
| **Cancels the deploy**, old instances keep serving | If that has not happened within **15 minutes** |
| **Stops routing** to a running instance | After it fails consecutively for **15 seconds** |
| **Restarts** the instance | After it fails consecutively for **60 seconds** |

So on Render the probe is a remedy and not only a signal — with one consequence worth expecting.
**A restart does not fix a dependency, and this service migrates on every start.** Point the dashboard
at `/health/ready` and a genuinely unreachable database gives you a container restarting every 60
seconds, each restart re-running `prisma migrate deploy` against the database that is down. That is
loud, which is the point, but read it as a restart loop rather than a recovery, and go to §5.1.

**Open item for whoever holds the Render dashboard:** set Health Check Path to
`/api/v1/health/ready`, then record here that it is set. Until then the image is right and the
platform is not using it.

### 2.3 The boot guards, in the order they fire

[`main.ts:10-13`](../backend/src/main.ts#L10-L13) runs four assertions **before** the Nest application
is created. Each calls `process.exit(1)` rather than throwing, so a misconfigured deploy dies loudly
at boot instead of serving wrong answers.

| Guard | Refuses to start when | Source |
| --- | --- | --- |
| `assertSafeDatabaseUrl` | *Non-production only:* `DATABASE_URL` is remote and `SBR_CONFIRM_CLOUD_DATABASE_URL` is not `true` | [`database-guard.ts`](../backend/src/config/database-guard.ts) |
| `assertCorsConfigured` | Production and `FRONTEND_URL` is empty | [`cors-config.ts:150-162`](../backend/src/config/cors-config.ts#L150-L162) |
| `assertPaymentsConfigured` | Production and no Paystack secret key of either kind | [`payments-guard.ts:77-100`](../backend/src/config/payments-guard.ts#L77-L100) |
| `assertJwtSecret` | Production and `JWT_SECRET` is unset, empty, under 32 characters, or still the development default | [`jwt-secret.ts`](../backend/src/config/jwt-secret.ts) |

**A restart loop on Render is almost always one of these four.** The exit message names the variable
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
| API restart-looping, never serves | Container log, first 20 lines | One of the four boot guards (§2.3). The message names the variable |
| API boots cleanly, serves briefly, restarts every ~60s | `/health/ready` on the instance | Not a boot guard — the container started. Render restarts an instance that fails its health check for 60 seconds (§2.2), so if the dashboard path is `/health/ready` a broken dependency now recycles the container instead of serving 200s. **The restart cannot fix the dependency**; read the `checks` object and fix that. Each restart also re-runs `prisma migrate deploy` |
| `/health/ready` → `database: unavailable` | Prisma Data Platform status; `DATABASE_URL` on Render | Wrong or rotated URL, or the platform is down. `timeout` instead means reachable but slow — check pool exhaustion before blaming the network |
| `/health/ready` → `storage: misconfigured` | `STORAGE_DRIVER` on Render | `s3` with `AWS_REGION`/`AWS_S3_BUCKET` missing, or exactly one of the credential pair set. Half a pair silently falls back to ambient credentials, which is why it is treated as broken ([`storage.service.ts:75-89`](../backend/src/storage/storage.service.ts#L75-L89)) |
| `/health/ready` → `payments: misconfigured` | Paystack keys on Render | Production with no secret key. The instance should not have booted at all — if it did, `NODE_ENV`/`VERCEL_ENV` do not say production and §7.2 applies |
| App loads, every API call fails, browser console shows CORS | `FRONTEND_URL` on Render | The origin is not on the allow-list. **There will be no server-side log** — a rejected origin is answered *without* CORS headers rather than with an error ([`cors-config.ts:166-170`](../backend/src/config/cors-config.ts#L166-L170)), so the browser blocks it and the API records a normal 200. Absence of server errors is not evidence against CORS |
| Login succeeds then every request is 401 | Cookie domain | `VITE_API_URL` pointing at the Render hostname instead of `/api/v1`. Cookies are same-origin |
| Preview deploy cannot reach the API | `VERCEL_TEAM_SLUG` on Render | In production only `*-{VERCEL_TEAM_SLUG}.vercel.app` is accepted. Unset means no preview origin is allowed at all, which is deliberate and not a startup failure ([`cors-config.ts:118-140`](../backend/src/config/cors-config.ts#L118-L140)) |
| Customer says they never got a receipt | Container log, search the Service ID | Almost certainly SMTP — see §6.2. **The full receipt text is in the log**, so the customer can be answered from it |
| PoA QR codes point at the wrong site | `POA_VERIFY_BASE_URL` on Render | Unset falls back to the first `FRONTEND_URL` origin + `/verify`, then to `https://safebuyrealties.com/verify` ([`poa-verify-config.ts:24-32`](../backend/src/config/poa-verify-config.ts#L24-L32)). Already-printed codes cannot be recalled |
| Uploaded documents 404 after a deploy | `STORAGE_DRIVER` on Render | If it is `local`, this is expected and unfixable at the config layer — see §7.1 |
| An operator can see a screen but an action 403s | The response body — it names the privilege | `Missing privilege: escrows.write` and the like come from `PermissionsGuard`. This is working as designed: the menu is hidden by privilege but the menu is not the control, so an operator who reaches the endpoint another way is still refused. Grant it under **Roles & Privileges**, or move the account to a role that carries it. The dashboard reads privileges from the login response, so the operator must sign out and back in |
| A 403 reads `<Controller>.<handler> declares no required privilege` | The container log — the same line is logged at `error` | **A bug, not a permissions problem.** An operator-facing route shipped without `@RequirePermissions`, and the guard refused it rather than guessing. No privilege grant will fix it; the route needs the decorator. `backend/src/common/guards/operator-routes.spec.ts` fails CI on exactly this, so it should not be reachable in a deployed build |
| Audit log full of `SUPER_ADMIN_PRIVILEGE_BYPASS` | Nothing — this is expected | `resolvePermissions` hands a `SUPER_ADMIN` every privilege before it reads a grant, so no privilege setting can constrain that account. One row is written per privileged call it makes, naming the route and what the route required. Volume is normal; the rows exist so the account is reviewable, not because something failed |

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

### 7.2 `JWT_SECRET` has a guard — closed in E5-S6

**The finding.** Every other critical variable failed closed; this one did not. Both call sites read
`config.get<string>("JWT_SECRET") ?? "dev-secret-change-me"`, so with `JWT_SECRET` unset the API
started normally and signed every seven-day session token with a fixed string checked into this
repository. Anyone who could read the source could mint a valid token for any user id, including
`SUPER_ADMIN`, and nothing in the logs would distinguish it from a real login. Two documents
described `JWT_SECRET` as "min 32 characters", which was advice, not enforcement.

**What changed.** [`backend/src/config/jwt-secret.ts`](../backend/src/config/jwt-secret.ts) now
holds the rule, and `assertJwtSecret()` runs from
[`main.ts`](../backend/src/main.ts) alongside the database, CORS and payment guards — before Nest is
created. In production the process exits non-zero when `JWT_SECRET` is unset, empty, shorter than 32
characters, or equal to the development default. The literal `"dev-secret-change-me"` is gone from
both call sites; they resolve through `resolveJwtSecret()`, and a missing secret outside production
falls back to one clearly-named development value in one place.

The development default is a real 45-character string, not a placeholder, and
[`backend/.env.example`](../backend/.env.example) ships that exact value. Copying the example into
production therefore fails at boot rather than passing a length check with a public key — the case a
"change-me-in-production-min-32-chars-long" placeholder would have sailed through.

**What still needs the dashboard.** The guard protects every deploy from now on. It cannot tell you
what production was signing tokens with *before* this shipped. If `JWT_SECRET` was unset on Render at
any point, tokens minted then are forgeable and remain valid for seven days: **set the variable,
confirm the service restarts, and rotate the value** — which logs every user out, and is the point.
See §9.3.

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

### 7.4 The container healthcheck uses the readiness probe — closed in E7-S6b

**The finding.** `backend/Dockerfile`'s `HEALTHCHECK` polled `/api/v1/health`, the bare endpoint at
[`health.controller.ts:25`](../backend/src/health/health.controller.ts#L25), which returns `200` from
static values and touches no dependency. E7-S6 (#101) added `/health/ready` — the endpoint that would
actually detect a broken deploy — and the Dockerfile was never pointed at it, so **a container with an
unreachable database passed its own healthcheck.**

**What changed.** The `HEALTHCHECK` now polls `/api/v1/health/ready`, where a failing dependency is a
`503` and anything other than `200` exits non-zero. `--start-period` went from 20s to 180s: the
container runs `prisma migrate deploy` against the shared cloud Postgres before it serves, readiness
cannot pass until that finishes, and 20s could mark a healthy container unhealthy mid-migration.
[`dockerfile-healthcheck.spec.ts`](../backend/src/health/dockerfile-healthcheck.spec.ts) extracts the
real command out of the Dockerfile and runs it against a stub server, so the `200`-passes and
`503`-fails behaviour is executed rather than asserted about, and the polled path is derived from the
controller's own routing metadata — renaming the route fails the suite instead of production.

**What still needs the dashboard.** Render does not read the image's `HEALTHCHECK`; its check is a
dashboard setting, and unset it is a TCP probe that a container with a dead database still passes.
**§2.2 has the table of what Render does on failure and the one setting to change.** The gap this
section described is closed in the image and still open on the platform until somebody sets it.

---

## 8. Environment matrix

**Owner** uses the vocabulary of the backlog's external-inputs table (§3.3): *Client* holds
commercial credentials, *Corne Labs* holds infrastructure the team provisions.

Legend: **R** required · **O** optional · **—** not applicable.

There is no longer a "required but silently defaulted" column value. `JWT_SECRET` was the last
variable in that state, and E5-S6 closed it — every variable marked **R** for production now fails
the boot rather than defaulting to something.

### 8.1 API (Render environment)

| Variable | Local | Preview | Production | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | R | R | R | Corne Labs | Pooled connection. Empty is **not** caught by a guard ([`database-guard.ts:9`](../backend/src/config/database-guard.ts#L9)) |
| `DATABASE_POSTGRES_URL` | R | R | R | Corne Labs | Direct connection, preferred by the deploy-time migration scripts |
| `SBR_CONFIRM_CLOUD_DATABASE_URL` | R | — | — | — | Local opt-in to a remote DB. Ignored in production |
| `JWT_SECRET` | O | O | R | Corne Labs | Min 32 chars, and not the development default. **Production will not boot without it** ([`jwt-secret.ts`](../backend/src/config/jwt-secret.ts)). See §7.2 |
| `ACCESS_TOKEN_TTL` | O | O | O | Corne Labs | Default `15m`. Read only while `auth_sessions` is on. An unparseable value warns and the default stands. §11.4 |
| `REFRESH_TOKEN_TTL_DAYS` | O | O | O | Corne Labs | Default 7. The real session length, and how long a stolen refresh token is worth something. §11.4 |
| `REFRESH_REUSE_LEEWAY_MS` | O | O | O | Corne Labs | Default 10000. How long a rotated token still works, so two tabs waking together do not revoke the family. §11.4 |
| `PORT` | O | — | — | — | Defaults to 3001; the image sets it |
| `NODE_ENV` | O | O | R | — | The image sets `production`. Drives all four boot guards |
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
| `FEATURE_<KEY>` | O | O | O | Corne Labs | One per registry key, upper-cased. Unset means the registry default, which is off for every roadmap flag. §11 |
| `FEATURE_STANDALONE_DD_PUBLIC_ORDER_READ` | O | O | O | Corne Labs | The exception: defaults **on**, because the route is live. Setting it off closes an unauthenticated route and costs the guest receipt view. §11.3 |
| `FEATURE_AUTH_SESSIONS` | O | O | **leave it off** | Corne Labs | Short access token, rotating refresh, session list and revoke. **No client refreshes yet, so turning it on signs everybody out every fifteen minutes.** §11.4 |
| `FEATURE_FLAGS_KILL_SWITCH` | O | O | O | Corne Labs | Turns every flag off at once. It cannot turn anything on. §11.2 |
| `THROTTLE_<KEY>` | O | O | O | Corne Labs | One per policy, `"<requests>:<seconds>"`. Unset means the default in the registry. §12 |
| `THROTTLE_DISABLED` | O | O | O | Corne Labs | Turns the request limiter off. Does not touch the login lockout. §12.3 |
| `TRUST_PROXY_HOPS` | O | O | **set it to 1** | Corne Labs | How many proxies sit in front. Wrong value puts every caller in one rate-limit bucket. §12.4 |

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
| `VITE_FEATURE_<KEY>` | O | O | O | Corne Labs | The value a flag has before `GET /feature-flags` answers. Inlined at build time, so changing one needs a rebuild. The API wins once it answers. §11 |

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
| `JWT_SECRET` | Corne Labs | Render env only | **90 days**, and immediately if §9.3 finds it was ever unset | Rotation logs every user out — all tokens are seven-day and signed with the old value. Do it deliberately, not during an incident |
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

1. `JWT_SECRET` is set in Render. The guard from §7.2 now enforces this at boot, so a running
   production instance proves it — but it cannot tell you whether the variable was missing *before*
   the guard shipped. If nobody can confirm it was always set, rotate it and accept the logout.
2. `PAYSTACK_SECRET_KEY` begins `sk_live_` and is not merely a test key (§7.5).
3. `STORAGE_DRIVER` is `s3`, not `local` (§7.1) — gated on E3-S2.
4. The Vercel `safebuyrealties` backend project is disconnected, or its second deploy path is
   documented (§7.3).

---

## 10. What this story did not need to do

Criterion 4 of E7-S5 asks for `docs/BUILD_CHECKLIST.md` to be reconciled against the backlog, closing
DOCS-1. **DOCS-1 did that on day 1** and it is verified rather than redone here: the file opens with a
dated accuracy notice and carries an *Audit corrections* table of seven overstatements, each with the
story that closes it. All 59 items in the file remain `[x]`, and the corrections live in the table
rather than in a marker on the item, so there is no `[!]` in the file to look for. It also states that
it is no longer the work queue and points at the backlog.

That audit was run against `fc05e1e`, before the week's merges. Re-running it against HEAD is story
**DOCS-4**, deliberately scheduled last, and is not duplicated here.

---

## 11. Feature flags

CH-1. Four inputs decide whether a feature is on, and the highest one that has an opinion wins:

1. the kill switch, which forces every flag off
2. a runtime override, set through the admin API and held in memory
3. `FEATURE_<KEY>` in the environment
4. the default in
   [`feature-flags.constants.ts`](../backend/src/feature-flags/feature-flags.constants.ts), which is
   the list of what exists

**Two of those survive a restart and two do not.** The environment variables do, and they reach
every instance, so they are how a flag is really flipped. A runtime override applies to the one
process that answered the request and is gone when it restarts, so it is the lever you pull while
the durable change is still deploying. `GET /feature-flags` says which is which rather than leaving
you to remember.

There is no flag table in the database. A row would need a migration, and §4 is why a migration on
this project is a scheduled event rather than part of an afternoon.

### 11.1 Reading what a process believes

```bash
curl -s "$SBR_API_BASE/feature-flags" -H "Authorization: Bearer $TOKEN" | jq
```

Signed in as STAFF, ADMIN or SUPER_ADMIN you get every flag with its value, the source that decided
it, the variable that would set it, and the state of the kill switch. Anyone else, including a
caller with no session at all, gets the client-visible flags and their values and nothing about how
they were reached.

`source` is the field to read first. `default` means nothing is configured. `env` means a variable
set it. `override` means somebody flipped it on this process. `kill-switch` means the switch is on
and the flag's own setting is not being consulted.

`envValueIgnored` appears when the variable holds something the API could not read. The flag is
running on whatever the layer below said, not on what somebody typed. It is also warned about at
boot, naming both the variable and the value it dropped. Accepted values are `on`, `true`, `1`,
`yes`, `enabled` and their opposites `off`, `false`, `0`, `no`, `disabled`.

### 11.2 Turning something off in a hurry

An override takes effect in the time of one HTTP call:

```bash
curl -s -X PATCH "$SBR_API_BASE/feature-flags/payouts" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

If more than one thing is wrong, arm the kill switch instead:

```bash
curl -s -X PUT "$SBR_API_BASE/feature-flags/kill-switch" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"armed": true}'
```

**Then do the durable half.** Both of those live in one process's memory. Render runs one instance
today, so one call is the whole fleet, but a restart or a scale-up loses it. Set `FEATURE_PAYOUTS=off`
in the Render environment, or `FEATURE_FLAGS_KILL_SWITCH=on` for the switch, and let the redeploy
land behind you. `DELETE /feature-flags/<key>` drops the override afterwards so the flag reads from
the environment again.

Both routes need ADMIN or SUPER_ADMIN and the `platform.config` privilege, the same one that gates
`PATCH /platform-config`, and both write an audit row. That row is the only durable record that an
override happened, so do not expect to reconstruct it from anywhere else.

The kill switch can only turn flags off. A switch that could also turn one on would be a second way
to enable a feature, which is not a kill switch.

### 11.3 The one flag that is on

`FEATURE_STANDALONE_DD_PUBLIC_ORDER_READ` gates `GET /standalone-dd/orders/:serviceId`. That route
mounts no guard, declares no role, and the service behind it takes no actor, so **anybody holding a
service id can read that order.** It is an open finding from E4-S3 and it is listed as such in
[`cross-role-authz.spec.ts`](../backend/src/common/authz/cross-role-authz.spec.ts).

The flag is not the fix. Closing the route properly is a product decision, either a signed expiring
link or an email-plus-reference check. What the flag buys is the ability to shut it in one API call
while that decision is pending, at the cost of the guest receipt view. Before CH-1 the only way to
close it was a deploy.

A route whose flag is off answers `404` with the message Nest emits for a path it does not serve,
not `403`. A caller cannot tell a switched-off feature from one that was never built, which is what
shipping dark means.

### 11.4 `auth_sessions`, and the one that cannot go on yet

`FEATURE_AUTH_SESSIONS` gates the whole of E5-S5: server-side sessions, a short access token, a
rotating refresh token, and the two routes a person uses to see and end their own sessions. **It
ships off and it has to stay off until a browser-side refresh client exists.** There is no code in
the frontend today that calls `POST /auth/refresh`, so turning this on would sign every user out
fifteen minutes after they signed in, with no way back except signing in again, every fifteen
minutes, forever. That is the single most important line in this subsection.

**Off is the behaviour that has always shipped.** Login mints one seven-day access token and nothing
else. `POST /auth/refresh`, `GET /auth/sessions` and `DELETE /auth/sessions/:id` answer `404`, the
same shape as a path the API does not serve, so a caller cannot tell the feature is built. No session
rows are written and no refresh cookie is set.

**On changes four things at once**, which is why it is one flag rather than four:

| | Off | On |
| --- | --- | --- |
| Access token | 7 days | 15 minutes, `ACCESS_TOKEN_TTL` |
| Refresh | none | `sbr_refresh` cookie, httpOnly, path `/api/v1/auth`, 7 days |
| Revocation | wait for the token to expire | immediate, checked on every request |
| Session routes | `404` | live |

#### Turning it off in a hurry

Same two steps as §11.2, and in this order:

```bash
curl -sS -X PATCH "$API/feature-flags/auth_sessions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```

Then set `FEATURE_AUTH_SESSIONS=off` in the Render environment so the next deploy or restart agrees
with the override. The override is in memory and does not survive a restart.

**What it costs, honestly.** Anybody who signed in while the flag was on is holding a fifteen-minute
access token. Turning the flag off does not invalidate it, so it keeps working until it expires,
which is at most fifteen minutes. After that they sign in once more and get a seven-day token like
everybody else. That is the whole blast radius: one extra sign-in, for the people who happened to be
signed in during the window.

**What is left behind, and why none of it matters.** Refresh cookies already in browsers are never
read again, because the route that reads them is answering `404`; the cookie expires on its own after
seven days and the browser drops it. Session rows stay in `AuditLog` as `entity = 'AuthSession'` and
are simply no longer consulted. Nothing is deleted and there is no cleanup step, which is what makes
this a flag flip rather than a rollback: turning it back on within the seven-day window picks up the
sessions that were already open.

The one asymmetry worth knowing: a token minted while the flag was on carries a session id, and the
liveness check on that id runs whether or not the flag is on. That is deliberate. A session somebody
revoked while the feature was live stays revoked through the flip, rather than coming back because an
operator changed an environment variable.

### 11.5 The browser half

The frontend reads the same endpoint and lays the answer over whatever `VITE_FEATURE_<KEY>` was
baked into the build. The API wins, because the API is the half an operator can change without a
deploy. Values are re-checked every minute and on window focus, so a tab that has been open all
afternoon follows a flip without a reload.

Hiding a control is a courtesy to the person looking at the screen. It is not what stops the
request: that is `FeatureGuard` on the server, and it holds whether or not the browser ever
rendered.

---

## 12. Rate limiting and account lockout

**Two things can answer `429`, and they count different things.** Confusing them wastes the first
ten minutes of an incident, so start here.

| | Request throttle | Login lockout |
| --- | --- | --- |
| Counts | requests per client address | failed logins per account, and per address |
| Window | seconds to minutes | one hour ([`login-attempts.service.ts:66`](../backend/src/auth/login-attempts.service.ts#L66)) |
| Where | [`throttle.guard.ts`](../backend/src/common/guards/throttle.guard.ts), third `APP_GUARD` | [`login-attempts.service.ts`](../backend/src/auth/login-attempts.service.ts), inside `AuthService.login` |
| Survives a restart | no, the counters are in memory | yes, the counters are `AuditLog` rows |
| Applies to | every route | `POST /auth/login` only |
| Can be switched off | yes, `THROTTLE_DISABLED` | no |

Both answer the same shape: `429`, code `TOO_MANY_REQUESTS`, `Retry-After` in seconds, and the same
number again in `error.details.retryAfterSeconds` for a client that ignores headers. The header is
set in one place, [`http-exception.filter.ts:91`](../backend/src/common/filters/http-exception.filter.ts#L91),
so any 429 raised anywhere gets it.

Neither says why. The message names no address, no policy and no count, because a limiter that
explains itself is telling an attacker how close they are.

### 12.1 The limits, and where they came from

Defaults live in [`throttle.constants.ts`](../backend/src/common/throttle/throttle.constants.ts),
one entry per policy with a sentence saying what it protects. Every one is overridable through
`THROTTLE_<KEY>` set to `"<requests>:<seconds>"`.

| Policy | Default | Route |
| --- | --- | --- |
| `global` | 300 / 60s | everything that says nothing |
| `login` | 10 / 60s | `POST /auth/login` |
| `refresh` | 60 / 60s | `POST /auth/refresh`, and deliberately loose. See below |
| `register` | 5 / 300s | `POST /auth/register` |
| `activate` | 10 / 300s | `GET /auth/activate/:token`, `POST /auth/activate` |
| `password_reset` | 5 / 900s | declared ahead of the routes E5-S3 builds |
| `payment_initiate` | 10 / 60s | `POST /payments/initiate` |
| `guest_checkout` | 10 / 300s | the whole of `/guest-checkout` |
| `webhook` | 240 / 60s | `POST /webhooks/payments/:provider` |

The counts are per address per policy, not shared, so spending the login allowance leaves the rest
of the API open to that caller.

**`refresh` is sized for browsers, not for people.** One tab asks about every fifteen minutes, and a
laptop waking with eight tabs open asks eight times in the same second. A tight limit there signs
innocent people out, which is the failure this policy exists to avoid rather than cause. What
actually defends that route is reuse detection: the first replayed refresh token revokes the whole
family, so somebody grinding tokens gets one attempt rather than sixty. The limit is here to stop
pointless volume. It only applies while `auth_sessions` is on, since the route is a `404` otherwise.

**A bad value is ignored, not fatal.** `THROTTLE_LOGIN="lots"` leaves the default in place and warns
at boot naming the variable and the value it dropped. The API booting with a limit somebody meant to
change is bad; the API not booting at all is worse.

**Two routes are deliberately not on the global limit.** Webhooks have their own high ceiling,
because Paystack retries from a small set of addresses and a refused retry strands a payment a buyer
has already made; the signature check is what actually guards that route. `/health` is exempt
outright, because the platform reads a 429 as a failed probe and enough failed probes is a restart.
A rate limit that can restart the service it protects is worse than no rate limit.

The store holds at most 50,000 keys ([`throttle-store.ts:37`](../backend/src/common/throttle/throttle-store.ts#L37)),
sweeps expired windows when it reaches that, and evicts oldest-first if the sweep frees nothing. The
key is something a caller chooses, so it needs a ceiling.

### 12.2 When somebody says they are locked out

Ask for the wall-clock minute and the email. Then:

```bash
psql "$DATABASE_POSTGRES_URL" -c "
  select action, \"entityId\", \"createdAt\"
  from \"AuditLog\"
  where entity = 'AuthAttempt'
  order by \"createdAt\" desc limit 40;"
```

`entityId` is `account:<sha256>` or `address:<sha256>`. **The email and the address are hashed and
nothing readable is stored**, so you cannot search this table by email and you cannot read a
password out of it, which is the point. To confirm it is a given account, hash it the same way: trim
it, lower-case it, `sha256`, and prefix `account:`.

A `LOGIN_LOCKED_OUT` row marks the failure that crossed a tier and carries the tier in `after`. The
ladders are 5 / 10 / 20 failures per account for 60 / 300 / 1800 seconds, and 20 / 40 / 80 per
address for the same durations. The lock runs from the newest failure, so a caller who keeps trying
keeps it alive.

**There is no unlock command and that is deliberate.** The lock expires on its own, and the longest
one is thirty minutes. A `LOGIN_SUCCEEDED` row clears the count for that key, so the moment the real
person gets in, the ladder resets. Nothing is deleted to make that happen.

If the lockout is firing wrongly for everybody at once, read §12.4 before anything else: one address
for the whole world is exactly what a wrong `TRUST_PROXY_HOPS` looks like.

**If the database cannot be read, this tier fails open** and logs a warning. Counts it cannot read
would otherwise refuse every login in the product rather than the attacker's. The request throttle
is still up in that state.

### 12.3 Turning the throttle off

```bash
THROTTLE_DISABLED=on
```

Set it in the Render environment and redeploy. Everything passes, and the API warns at boot on every
start while it is set, so this cannot be left on quietly.

It does not touch the login lockout, which has no off switch. If the lockout is the problem, widen
the ladder in code and ship it; there is no environment variable that disables brute-force
protection on a live product.

Prefer raising one policy to disabling all of them. `THROTTLE_GUEST_CHECKOUT="60:300"` is a smaller
blast radius than opening the whole API.

### 12.4 `TRUST_PROXY_HOPS`, and why it matters more than it looks

Everything in this section counts per client address, and the address comes from `req.ip`. Express
only knows the real caller if it is told how many proxies sit in front of it
([`app-bootstrap.ts:69`](../backend/src/app-bootstrap.ts#L69)).

**Set it to 1 on Render.** Render puts exactly one load balancer in front of the container. Unset it
defaults to 1 anyway, so the failure mode is a deployment that adds a proxy, or one that removes
them, and nobody updating this.

Wrong high and every caller collapses into the proxy's own address: one bucket for the whole
internet, the global limit trips within seconds, and legitimate traffic is refused. Wrong low, the
same. Either way the symptom is everyone being throttled at once, which is why it is the first thing
to check.

It is a hop count rather than a boolean on purpose. `trust proxy: true` believes the whole
`X-Forwarded-For` header including the part the client wrote, which would let a caller pick which
rate-limit bucket to be counted in and defeat both tiers at once. A number never can.

This also fixes four audit call sites that were recording the proxy's address rather than the
caller's: [`private-document.controller.ts:94`](../backend/src/storage/private-document.controller.ts#L94)
and `:126`, [`permissions.guard.ts:157`](../backend/src/common/guards/permissions.guard.ts#L157), and
[`poa.controller.ts:22`](../backend/src/poa/poa.controller.ts#L22). Rows written before this story
carry the wrong address; nothing backfills them.

### 12.5 What this did not close

`POST /auth/login` answers *"Account is deactivated"* for a deactivated account and *"Invalid email
or password"* for everything else, which tells an unauthenticated caller that an email is registered
here. The lockout is enumeration-safe on its own account — the lock is checked before the user is
looked up, so a locked answer is identical for a real address and an invented one — but that older
message is not, and changing it is a frontend-visible behaviour change outside this story. It is
listed in [`MVP_OUTSTANDING_BACKLOG.md`](MVP_OUTSTANDING_BACKLOG.md) rather than fixed here.
