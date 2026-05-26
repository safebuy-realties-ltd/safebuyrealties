# SafeBuyRealties — Build Checklist

This is the single source of truth for development progress.

**Legend:**
- `[ ]` = Not started
- `[~]` = In progress (current session working on this)
- `[x]` = Built and validated ✓

Any AI tool working on this project reads this file first, finds the first `[ ]` or `[~]`, and continues from there. See `AGENT_PROMPT.md` for the full working protocol.

**Validation (Vercel-first, no Docker):** Use `docs/VERCEL_VALIDATION.md`. Replace checklist `localhost:3001` curl examples with `https://safebuyrealties-app.vercel.app/api/v1` (or the current preview URL). Browser checks run on the deployed app after push.

**How we build:** TDD + PR + CI — see `docs/DEVELOPMENT_GUIDE.md`. Full-stack items need API **and** UI verification on preview before `[x]`.

---

## Last Session Notes

> *(Each session updates this section before stopping)*

- **Date:** 2026-05-26
- **Tool:** Cursor (Composer)
- **Last completed:** Step 2 — Object storage service (PR #27 merged; checklist marked `[x]` after production API validation)
- **Next:** Step 2 — Audit logging (Prisma `AuditLog` model + `AuditService`)
- **Blockers:** None

---

## Step 1 — Fix the Crashes

These four issues cause dashboard screens to crash on load. Fix them before anything else. Nothing can be demonstrated to the client until these are done.

- [x] **Professional dashboard — missing `useTaskKpiCounts` hook**
  - File to edit: `src/hooks/use-tasks.ts`
  - Add an exported function `useTaskKpiCounts()` that calls the existing `useMyTasksQuery()` internally and returns `{ pending: number, inProgress: number, completed: number, isLoading: boolean }` by filtering tasks by their status field
  - Validation: run `npx tsc --noEmit` (zero errors), navigate to `/dashboard/professional` — page must load without a console error

- [x] **Professional task list — same missing hook crash**
  - File to edit: `src/routes/dashboard.professional.tasks.tsx`
  - The same missing `useTaskKpiCounts` export from the item above causes this crash too — once the hook is added in the item above, confirm this route also loads
  - Validation: navigate to `/dashboard/professional/tasks` — page must load without a console error

- [x] **Staff workflow — two missing hooks**
  - File to edit: `src/hooks/use-tasks.ts` and `src/routes/dashboard.staff.workflow.tsx`
  - Part A: Add `useCreateTaskMutation()` export to `use-tasks.ts`. It should POST to `/tasks` with body `{ listingId, assigneeId, title, type, description }` and invalidate the tasks query on success
  - Part B: In `dashboard.staff.workflow.tsx`, find every reference to `patchStepMutation` and replace with the correct `usePatchVerificationStepMutation` from `@/hooks/use-verification` (already exported there). The mutation signature is `{ stepId, listingId, body: { status?, notes?, riskFlags? } }`
  - Validation: run `npx tsc --noEmit` (zero errors), navigate to `/dashboard/staff/workflow` — page must load, the assign action must be clickable without crashing

- [x] **Staff submissions — approve button crashes on click**
  - File to edit: `src/routes/dashboard.staff.submissions.tsx`
  - Add missing import: `import { useUpdateListingMutation } from "@/hooks/use-update-listing"`
  - Instantiate it: `const updateListing = useUpdateListingMutation()`
  - Define the `approve` function that maps current status to next status (`PENDING_REVIEW → ASSIGNED`, `IN_VERIFICATION → VERIFIED`, `VERIFIED → LIVE`) and calls `updateListing.mutate({ id, body: { status: nextStatus } })`
  - Validation: navigate to `/dashboard/staff/submissions`, click the approve button on a listing — it must trigger an API call (check network tab) and the listing status must update

- [x] **CI type-check gate**
  - Create `.github/workflows/ci.yml`
  - Must run `npx tsc --noEmit` on the frontend and `npx tsc --noEmit` in `backend/` on every push and PR
  - Also run `npx eslint src --max-warnings 0` on the frontend
  - Validation: push a branch — the Actions tab on GitHub must show the workflow running and passing

---

## Step 2 — Foundation Infrastructure

These are building blocks that other features depend on. Build them in order.

- [x] **Prisma schema — listing spec and media fields** (PR #25)
  - `Listing` spec fields + `ListingMedia` / `ListingMediaType`; migration `20260525143000_listing_spec_and_media`
  - Tests: `backend/src/listings/listings.service.spec.ts`
  - Validated: production deploy migrate OK (`dpl_5MCjDEtMJThyHSHQ4nEpTeeHYRuq`)

- [x] **Object storage service** (PR #27, #28; checklist closure PR)
  - `backend/src/storage/storage.service.ts`, `storage.module.ts` — `STORAGE_DRIVER` (`local` default, `s3`); local uses `STORAGE_LOCAL_PATH` / `UPLOAD_DIR` (Vercel: `/tmp/safebuyrealties-uploads` when relative)
  - S3: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; env `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_ENDPOINT`
  - Methods: `upload`, `getSignedUrl` (local → `/uploads/{key}`), `delete`
  - `DocumentsService.createFromUpload` uses `StorageService.upload` (no `fs.writeFileSync`)
  - Tests: `backend/src/storage/storage.service.spec.ts`, `backend/src/documents/documents.service.spec.ts`
  - Validated: `npm run validate:tsc`, `npm test` (3 FE), `cd backend && npm test` (10 BE), `npm run smoke:api`; production `POST /documents/upload` as seller → `storageKey` under `listings/{id}/…`, `GET /documents/listing/{id}` lists new doc (`2026-05-26`)

- [ ] **Audit logging**
  - Add `AuditLog` model to Prisma schema: `id`, `actorId String?`, `action String`, `entity String`, `entityId String`, `before Json?`, `after Json?`, `ipAddress String?`, `createdAt DateTime @default(now())`; add indexes on `[entity, entityId]`, `[actorId]`, `[createdAt]`
  - Run migration
  - Create `backend/src/audit/audit.service.ts` (Injectable, `log()` method that never throws — wraps in try/catch)
  - Create `backend/src/audit/audit-actions.constants.ts` with string constants for all action types: `LISTING_CREATED`, `LISTING_STATUS_CHANGED`, `LISTING_REJECTED`, `VERIFICATION_STEP_ASSIGNED`, `VERIFICATION_STEP_COMPLETED`, `TASK_CREATED`, `TASK_STATUS_CHANGED`, `PAYMENT_INITIATED`, `PAYMENT_SUCCEEDED`, `USER_ROLE_CHANGED`
  - Create `backend/src/audit/audit.module.ts` marked `@Global()` and exporting `AuditService`
  - Inject `AuditService` into `listings.service.ts` and call `log()` after status transitions
  - Validation: change a listing status via admin panel, confirm a row appears in the `audit_logs` table with correct `before` and `after` values

- [ ] **Platform configuration**
  - Add `PlatformConfig` singleton model to Prisma schema: `id String @id @default("singleton")`, `vatRate Decimal @default(0.075) @db.Decimal(5,4)`, `maxUploadMb Int @default(15)`, `paystackEnabled Boolean @default(true)`, `flutterwaveEnabled Boolean @default(false)`, `maintenanceMode Boolean @default(false)`, `updatedAt DateTime @updatedAt`
  - Run migration
  - Create `backend/src/platform-config/` module with service and controller
  - Service: `get()` upserts singleton on first call then caches for 60s; `update(dto, actorId)` invalidates cache; `getVatRate(): number`; `getMaxUploadBytes(): number`
  - Controller: `GET /platform-config` (any authenticated user), `PATCH /platform-config` (ADMIN only)
  - Validation: `curl -X GET http://localhost:3001/api/v1/platform-config -H "Cookie: <auth-cookie>"` returns `{ vatRate: "0.075", maxUploadMb: 15, ... }`

- [ ] **Property spec fields — frontend**
  - Update `ListingDto` type in `src/hooks/use-listings.ts` to include optional: `beds?: number | null`, `baths?: number | null`, `landAreaSqm?: number | null`, `buildType?: string | null`
  - Update listing detail page to display these values (already shows "—" fallback — now show the actual value when present)
  - Update seller create listing form (`src/routes/dashboard.seller.listings.tsx`) to include optional input fields for beds, baths, landAreaSqm, buildType
  - Include these in the POST body when present
  - Validation: create a new listing as a seller with beds=4, baths=3. View the listing detail page — the spec row must show "4 beds · 3 baths"

---

## Step 3 — Verification Pipeline Completion

- [ ] **Listing status vocabulary — database**
  - Add `UNDER_OFFER` and `SOLD` to the `ListingStatus` enum in `backend/prisma/schema.prisma`
  - Run migration
  - Validation: migration succeeds, existing listings are unaffected

- [ ] **Listing status vocabulary — frontend label mapping**
  - Create `src/lib/listing-status.ts` with three exported functions:
    - `statusLabel(status: string): string` — maps backend values to user-facing labels: `PENDING_REVIEW → "Pending Review"`, `ASSIGNED → "In Verification"`, `IN_VERIFICATION → "In Verification"`, `VERIFIED → "Verified"`, `LIVE → "Live"`, `UNDER_OFFER → "Under Offer"`, `SOLD → "Sold"`, `REJECTED → "Rejected"`, `DRAFT → "Draft"`, `ARCHIVED → "Archived"`
    - `statusBadgeClass(status: string): string` — returns Tailwind classes: green for LIVE/VERIFIED, amber for IN_VERIFICATION/ASSIGNED, red for REJECTED, blue for UNDER_OFFER, gray for DRAFT/ARCHIVED
    - `statusIsPublic(status: string): boolean` — true only for LIVE
  - Replace all inline status label/class logic in: `src/components/ListingCard.tsx`, `src/routes/dashboard.seller.tsx`, `src/routes/dashboard.admin.listings.tsx`, `src/routes/dashboard.buyer.listings.tsx`
  - Validation: seller dashboard shows "Pending Review" instead of "PENDING_REVIEW". Listing cards show correct badge colours.

- [ ] **Professional credential profile**
  - Add `ProfessionalProfile` model to Prisma schema: `id`, `userId String @unique`, `user User @relation(...)`, `regulatoryBody String` (NBA, SURCON, NIESV, NIQS, etc.), `licenseNumber String`, `licenseExpiry DateTime?`, `verifiedStatus String @default("PENDING")` (PENDING, VERIFIED, REJECTED), `verifiedById String?`, `verifiedAt DateTime?`, `rejectionNote String?`
  - Run migration
  - Backend: `GET /professionals/me/profile`, `PUT /professionals/me/profile`, `PATCH /professionals/:id/verify` (STAFF/ADMIN only)
  - Frontend: add a "My Credentials" section to the professional dashboard where they can view and update their profile and see their verification status
  - Frontend: add a credential review section to the staff dashboard listing professionals pending verification with approve/reject actions
  - Validation: register as a professional, fill in credentials, log in as staff, approve the credential — professional dashboard shows "Verified" credential status

- [ ] **Risk flag taxonomy and picker UI**
  - Create `src/lib/risk-flags.ts` exporting `RISK_FLAGS` array with objects `{ code: string, label: string, description: string }` for: `BOUNDARY_DISPUTE`, `GOVT_ACQUISITION`, `FLOOD_ZONE`, `OMO_ONILE_ACTIVITY`, `TITLE_ENCUMBRANCE`, `LITIGATION_PENDING`, `SURVEY_DISCREPANCY`, `INCOMPLETE_DOCUMENTS`
  - In professional task detail page: replace any hardcoded risk flag input with a multi-select checkbox picker using these constants
  - In staff workflow page: show flagged risks as labelled badges (not raw strings) when viewing a submitted step
  - Validation: as a professional, submit a report with two risk flags selected. As staff, view the step — both flags appear as readable labels.

- [ ] **Report acceptance and revision loop**
  - Backend: add `ACCEPTED` and `REVISION_REQUESTED` to verification step status enum (alongside existing statuses)
  - Add `revisionNote String?` field to `VerificationStep` model; run migration
  - Add endpoints: `PATCH /verification/steps/:stepId/accept` (STAFF only), `PATCH /verification/steps/:stepId/request-revision` (STAFF only, body: `{ note: string }`)
  - Frontend: in staff workflow, when viewing a SUBMITTED step, show "Accept" and "Request Revision" buttons. Revision button opens a textarea for the note.
  - Frontend: in professional task detail, when status is REVISION_REQUESTED, show the revision note prominently and allow resubmission
  - Validation: professional submits a report → staff requests revision with note → professional sees the note and resubmits → staff accepts → step shows ACCEPTED status

---

## Step 4 — Service Catalog

- [ ] **Service catalog — database and seed**
  - Add models to Prisma schema: `ServiceCatalogItem` (`id`, `code String @unique`, `name`, `description`, `basePrice Decimal @db.Decimal(18,2)`, `active Boolean @default(true)`, `sortOrder Int @default(0)`), `ServiceBundle` (`id`, `code String @unique`, `name`, `description`, `basePrice Decimal @db.Decimal(18,2)`, `active Boolean @default(true)`), `BundleItem` (`bundleId`, `itemId`, `@@id([bundleId, itemId])`)
  - Run migration
  - Create `backend/src/service-catalog/service-catalog.service.ts` with `onModuleInit()` that seeds default data if catalog is empty. Seed all 15 services (codes listed in the Master Plan) with base price 150000. Seed 3 bundles: STANDARD (2950000, services 1-5), PREMIUM (4200000, services 1-10), ELITE (5850000, all 15).
  - Validation: after server start, `SELECT COUNT(*) FROM service_catalog_items` returns 15, `SELECT COUNT(*) FROM service_bundles` returns 3

- [ ] **Service catalog — API endpoints**
  - `GET /service-catalog/items` — public, returns all active items sorted by sortOrder
  - `GET /service-catalog/bundles` — public, returns bundles with their included items
  - `POST /service-catalog/calculate` — authenticated, body: `{ itemIds?: string[], bundleId?: string }`, returns `{ subtotal: number, vat: number, total: number }` using the platform VAT rate from PlatformConfigService
  - `PATCH /service-catalog/items/:id` — ADMIN only, update name/description/price/active
  - Validation: `curl http://localhost:3001/api/v1/service-catalog/bundles` returns 3 bundles each with an `items` array. Calculate endpoint returns correct total with 7.5% VAT applied.

- [ ] **Service catalog — frontend selection UI**
  - Create `src/components/ServiceSelector.tsx` — a component that fetches bundles and items, presents three bundle cards (with names, included services listed, and price), and an "à-la-carte" section below where individual services can be checked/unchecked
  - Shows a live running total at the bottom: Services subtotal, VAT (7.5%), Total — all in ₦ formatted with commas
  - When a bundle is selected, the individual services within it are pre-checked (but still visible)
  - Exposes `onSelectionChange({ itemIds: string[], bundleId?: string, total: number })` callback prop
  - This component will be embedded in the DD Purchase Wizard in Step 10 — build it as a standalone reusable component for now
  - Validation: render the component on a test route or in Storybook, confirm bundles load, selecting Elite shows all 15 services checked and the correct total

---

## Step 5 — Payment Architecture

- [ ] **Two payment intent types — database**
  - Add `PaymentIntent` enum to Prisma schema: `DD_SERVICE`, `PROPERTY_PURCHASE`
  - Add `intent PaymentIntent @default(DD_SERVICE)` to `Payment` model
  - Add `DueDiligenceOrder` model: `id`, `transactionId String @unique`, `buyerId String`, `bundleId String?`, `itemIds Json @default("[]")`, `subtotal Decimal @db.Decimal(18,2)`, `vatAmount Decimal @db.Decimal(18,2)`, `total Decimal @db.Decimal(18,2)`, `status String @default("PENDING")` (PENDING, PAID, IN_PROGRESS, COMPLETE), `createdAt`, `updatedAt`
  - Update `Transaction` model status values: add `DD_PURCHASED`, `DD_IN_PROGRESS`, `DD_COMPLETE`, `PURCHASE_PENDING`, `PURCHASE_IN_ESCROW` to the enum (keep existing values)
  - Run migration — default all existing Payment records to `DD_SERVICE` intent (safe: all current payments are DD-style)
  - Validation: migration succeeds, existing records intact, `cd backend && npx tsc --noEmit` passes

- [ ] **Two payment intent types — backend service**
  - Update `PaymentsService.initiate()` to accept `intent: PaymentIntent` and optional `ddOrderId: string`
  - When `intent = DD_SERVICE` and a `DueDiligenceOrder` exists for the transaction, link the payment to it
  - Update the Paystack webhook handler: when a `DD_SERVICE` payment succeeds, transition `transaction.status → DD_PURCHASED` and `listing.status → UNDER_OFFER`; trigger notifications for buyer (DD started), seller (property reserved), and staff (begin verification work)
  - When `intent = PROPERTY_PURCHASE` payment succeeds: transition `transaction.status → PURCHASE_IN_ESCROW` (escrow model comes in Step 7 — for now, just record the status transition)
  - Add endpoint: `POST /due-diligence-orders` — authenticated buyer, body: `{ transactionId, itemIds?, bundleId? }`, creates a `DueDiligenceOrder` and returns it with calculated totals
  - Validation: using mock mode, initiate a DD payment, confirm webhook transitions transaction to `DD_PURCHASED` and listing to `UNDER_OFFER` — check both in the database

- [ ] **Two payment intent types — frontend**
  - Update `src/hooks/use-payments.ts` to include `intent` field in the initiate payment mutation payload
  - Update `src/hooks/use-transactions.ts` to include the new status values in any type definitions
  - On the buyer transaction detail page: display the payment intent label clearly — "Due Diligence Payment" or "Property Purchase Payment" — instead of a generic "Payment" label
  - Show the extended transaction status with a human-readable label matching the vocabulary in the Master Plan
  - Validation: start a transaction as a buyer, confirm the transaction detail page shows "Due Diligence Payment" and the correct status label

---

## Step 6 — Power of Attorney

- [ ] **PoA — database model**
  - Add `PowerOfAttorney` model: `id`, `transactionId String @unique`, `buyerId String`, `listingId String`, `pdfStorageKey String`, `documentHash String` (SHA-256 hex), `qrCodeStorageKey String`, `signatureMethod String` (DRAWN or TYPED), `signatureName String`, `consentFlags Json` (object with 4 boolean keys), `ipAddress String?`, `userAgent String?`, `executedAt DateTime @default(now())`
  - This model has no `updatedAt` — it is append-only and immutable
  - Run migration
  - Validation: migration succeeds

- [ ] **PoA — PDF generation backend**
  - Install `pdfkit` in the backend (`npm install pdfkit @types/pdfkit`)
  - Create `backend/src/poa/poa.service.ts` with method `generate(buyerName, listingTitle, listingAddress, executedAt): Buffer` that produces a PDF containing the full PoA instrument text (see Master Plan for the required clauses: scope of authority, revocation, indemnity, legal framework references)
  - The PDF should include: platform name and logo text at top, buyer's full name, property address, date of execution, and the four consent items confirmed
  - After generating the PDF buffer: compute SHA-256 hash using Node's built-in `crypto`, generate a QR code (install `qrcode` package) encoding `https://safebuyrealties.com/verify?hash={hash}`, upload all three (PDF, QR PNG) via StorageService
  - Create `POST /poa/execute` endpoint: authenticated buyer, body: `{ transactionId, signatureMethod, signatureName, consentFlags }` — generates PDF, hashes it, stores it, creates the `PowerOfAttorney` record, returns the record
  - Create `GET /poa/verify?hash={hash}` — public endpoint that looks up by hash and returns confirmation or "not found"
  - Validation: call `POST /poa/execute` with test data, confirm a PDF is created in storage, confirm the hash matches `sha256(pdf_buffer)`, confirm the record is in the database

- [ ] **PoA — frontend execution screen**
  - Create `src/components/PoAExecutionScreen.tsx` — a full-screen step component that:
    - Shows the platform name and scope statement at the top
    - Displays the PoA instrument text in a scrollable panel (firm name, scope of authority, revocation clause, indemnity clause, Nigerian legal references)
    - Shows 4 mandatory consent checkboxes (all must be checked to proceed): "I confirm I am of full legal capacity to execute this document", "I acknowledge this PoA will require independent witnessing to be legally binding", "I agree to register this document at the relevant Land Registry within 60 days", "I acknowledge this Power of Attorney is irrevocable once executed"
    - Shows a signature panel with two tabs: "Draw" (canvas where user draws signature) and "Type" (user types full legal name in a styled input)
    - The Execute button is disabled until all 4 checkboxes are checked and a signature is provided
    - On click: calls `POST /poa/execute`, shows a loading state, then a success confirmation with the document hash
  - Validation: render the screen as a buyer for a live listing, complete all steps, click Execute — confirm the PoA record is created and the success state shows with the hash

---

## Step 7 — Escrow and Payouts

- [ ] **Escrow — database model**
  - Add `Escrow` model: `id`, `transactionId String @unique`, `status String @default("AWAITING_FUNDS")` (AWAITING_FUNDS, HELD, RELEASED, REFUNDED), `heldAmount Decimal @db.Decimal(18,2)`, `releaseConditions Json @default("[]")`, `conditionsMet Json @default("[]")`, `heldAt DateTime?`, `releasedAt DateTime?`, `refundedAt DateTime?`, `releasedById String?`, `releaseNote String?`
  - Add `Payout` model: `id`, `transactionId String`, `sellerId String`, `grossAmount Decimal @db.Decimal(18,2)`, `platformFee Decimal @db.Decimal(18,2)`, `netAmount Decimal @db.Decimal(18,2)`, `status String @default("PENDING")` (PENDING, INITIATED, COMPLETED, FAILED), `gatewayReference String?`, `initiatedAt DateTime?`, `completedAt DateTime?`
  - Run migration
  - Validation: migration succeeds

- [ ] **Escrow — hold and release logic**
  - Create `backend/src/escrow/escrow.service.ts`
  - `hold(transactionId, amount)`: creates or updates Escrow record to HELD, records heldAt — called when a property purchase payment succeeds
  - `checkConditions(transactionId)`: returns array of unmet conditions based on the transaction state
  - `release(transactionId, staffId, note)`: ADMIN/STAFF only — verifies conditions are met, transitions to RELEASED, triggers `initiatePayout()`
  - `refund(transactionId, staffId, note)`: transitions to REFUNDED, transitions listing back to VERIFIED status, notifies buyer
  - `initiatePayout(transactionId)`: calculates seller's net amount (gross minus 5% platform fee), calls Paystack Transfer API, creates Payout record
  - Add endpoints: `GET /escrow/:transactionId` (buyer and seller see their own), `POST /escrow/:transactionId/release` (ADMIN/STAFF), `POST /escrow/:transactionId/refund` (ADMIN/STAFF)
  - Validation: manually create an escrow record in the database, call the release endpoint as an admin, confirm payout record is created with correct net amount

- [ ] **Property reservation — anti-double-sell**
  - When `listing.status → UNDER_OFFER`: add a check in `transactions.service.ts` `create()` that rejects new transactions for the same listing if it is already in UNDER_OFFER status
  - The rejection should return HTTP 409 with message: "This property is currently under offer and cannot be reserved by another buyer"
  - Frontend: handle this 409 on the buyer listing detail page — show a clear "Under Offer" state with disabled purchase button and appropriate messaging
  - Validation: start a transaction as buyer A for listing X. As buyer B (different account), attempt to start a transaction for the same listing — confirm the 409 error and the UI shows "Under Offer" correctly

- [ ] **Escrow — frontend status display**
  - On the buyer transaction detail page: add an escrow status section showing current escrow state (Awaiting Funds, Held, Released, Refunded), held amount, and if released — the release date
  - On the admin dashboard: add an escrow management section listing all HELD escrows with release/refund action buttons
  - Validation: after a purchase payment (mock), the transaction page shows escrow in HELD state with the correct amount

---

## Step 8 — Notifications

- [ ] **Notifications — database and backend service**
  - Add `Notification` model: `id`, `userId String`, `user User @relation(...)`, `type String`, `title String`, `body String`, `entityId String?`, `entityType String?` (Listing, Transaction, Task, VerificationStep), `readAt DateTime?`, `createdAt DateTime @default(now())`; index on `[userId, readAt]`
  - Add `notifications Notification[]` to `User` model
  - Run migration
  - Create `backend/src/notifications/notifications.service.ts` with: `create()` (never throws), `listForUser(userId, page, pageSize)` returning `{ notifications, unreadCount }`, `markRead(userId, notificationId)`, `markAllRead(userId)`
  - Create `backend/src/notifications/notification-types.constants.ts` (see Master Plan for the full list of type constants)
  - Create notification endpoints: `GET /notifications/me` (paginated), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
  - Make the notifications module `@Global()` so other services can inject it
  - Validation: `curl GET /notifications/me` with auth returns `{ data: [], meta: { unreadCount: 0, ... } }`

- [ ] **Notifications — trigger from events**
  - Inject `NotificationsService` into: `listings.service.ts`, `verification.service.ts`, `tasks.service.ts`, `payments.service.ts`
  - Add `create()` calls at each key event: listing submitted (→ notify all staff), listing verified (→ notify seller), listing rejected (→ notify seller with reason), task assigned (→ notify professional), report submitted (→ notify staff), revision requested (→ notify professional), DD payment succeeded (→ notify buyer, seller, staff), escrow released (→ notify buyer, seller)
  - Validation: submit a listing as a seller, confirm a notification row exists in the database for staff users; verify the listing as staff, confirm the seller gets a notification

- [ ] **Notifications — frontend bell**
  - Add a notification bell icon to `src/components/dashboard/DashboardLayout.tsx` in the top bar
  - Bell shows an unread count badge when there are unread notifications
  - Clicking the bell opens a dropdown panel showing the 10 most recent notifications, each with title, body, time ago, and a subtle unread indicator
  - Clicking a notification marks it as read and navigates to the relevant entity if `entityId` is present
  - "Mark all read" button at the top of the panel
  - Polling or refetch on window focus using TanStack Query's `refetchOnWindowFocus`
  - Validation: trigger a notification (e.g., submit a listing as seller), switch to staff account — the bell shows unread count 1. Click it — the notification appears. Click it again — it is marked read and count resets.

---

## Step 9 — KYC

- [ ] **KYC — database model and backend**
  - Add `KycRecord` model: `id`, `userId String @unique`, `user User @relation(...)`, `status String @default("NOT_SUBMITTED")` (NOT_SUBMITTED, SUBMITTED, VERIFIED, REJECTED), `documentKeys Json @default("[]")` (array of storage keys), `reviewerId String?`, `reviewNote String?`, `submittedAt DateTime?`, `reviewedAt DateTime?`
  - Run migration
  - Endpoints: `GET /kyc/me` (user's own KYC status), `POST /kyc/submit` (buyer submits documents — uploads via existing document endpoint then calls this to mark as submitted), `GET /kyc/queue` (STAFF only — all SUBMITTED records), `PATCH /kyc/:userId/verify` (STAFF only), `PATCH /kyc/:userId/reject` (STAFF only, body: `{ note: string }`)
  - Validation: submit KYC as a buyer (with a test document), check the staff queue — record appears. Staff verifies — user's KYC status updates to VERIFIED.

- [ ] **KYC — frontend user profile**
  - Add a "Verify Your Identity" section to the buyer profile or dashboard
  - Shows current KYC status with appropriate copy: NOT_SUBMITTED ("Please verify your identity to complete property purchases"), SUBMITTED ("Your documents are under review — we'll notify you when complete"), VERIFIED ("Identity Verified ✓"), REJECTED (shows rejection note and option to resubmit)
  - If NOT_SUBMITTED or REJECTED: show a document upload section for government ID and a selfie/utility bill
  - Validation: as a buyer, upload KYC documents — status changes to SUBMITTED and the prompt changes to the review-in-progress message

- [ ] **KYC — staff review queue frontend**
  - Add a "KYC Reviews" tab to the staff dashboard
  - Shows a table of users with SUBMITTED KYC records: name, email, submission date, documents link
  - Verify and Reject buttons with the reject action requiring a typed reason
  - Validation: staff can approve/reject KYC from the UI, buyer sees status update

---

## Step 10 — The DD Purchase Wizard

This is the main buyer journey. It is the most important screen in the product.

- [ ] **Wizard — route and state structure**
  - Create route `/purchase/:listingId` accessible only to authenticated buyers for listings with status LIVE
  - Create a wizard state machine with 7 steps: `PROPERTY_CONFIRMATION`, `BUYER_INFO`, `POA_EXECUTION`, `SERVICE_SELECTION`, `ORDER_SUMMARY`, `PAYMENT`, `SUCCESS`
  - Persist current step and collected data to `sessionStorage` (keyed by listingId) so the buyer can leave and return
  - On mount, read session storage and restore to the last step
  - A progress bar or step indicator shows which step the buyer is on
  - Validation: start the wizard, close the browser, reopen — wizard restores to the correct step

- [ ] **Wizard — Step 1: Property confirmation**
  - Shows: hero image, title, location, price, verification badge with date, brief description, key specs (beds/baths/area)
  - A "Proceed to verify identity and start due diligence" primary button
  - Validation: navigating to `/purchase/:listingId` for a LIVE listing shows the property details correctly

- [ ] **Wizard — Step 2: Buyer information**
  - Form: Full Legal Name, Email Address, Phone Number, Country, State
  - Pre-fill from the logged-in user's profile where available
  - Validation: required fields enforced client-side, data saves to wizard state on Next

- [ ] **Wizard — Step 3: Power of Attorney**
  - Embed the `PoAExecutionScreen` component built in Step 6
  - On successful execution, store the returned PoA ID in wizard state and advance to Step 4
  - If the user already has an executed PoA for this transaction (returning user), show a confirmation of the existing execution and allow them to proceed
  - Validation: complete the PoA step, confirm the PoA record exists in the database, confirm wizard advances to Step 4

- [ ] **Wizard — Step 4: Service selection**
  - Embed the `ServiceSelector` component built in Step 4
  - User's selection is saved to wizard state
  - Validation: select a bundle, confirm the total is correct with VAT, Next advances to Step 5

- [ ] **Wizard — Step 5: Order summary**
  - Shows: selected services or bundle name, each service with price, subtotal, VAT amount (7.5%), total in ₦
  - A "Confirm and Pay ₦X,XXX,XXX" primary button
  - On click: create the `DueDiligenceOrder` via `POST /due-diligence-orders`, then initiate the Paystack payment
  - Validation: the order is created in the database with correct amounts before payment is initiated

- [ ] **Wizard — Step 6: Payment**
  - Initiates Paystack/Flutterwave checkout for the DD service total
  - In development: use mock mode — a "Simulate Payment Success" button that calls the webhook handler manually
  - On payment success: advance to Step 7
  - On payment failure: show an error with a "Try Again" option that returns to Step 5
  - Validation: simulate payment success, confirm transaction status transitions to DD_PURCHASED, confirm listing status transitions to UNDER_OFFER

- [ ] **Wizard — Step 7: Success**
  - Shows: confirmation message, transaction reference number, brief explanation of next steps (team will begin verification, estimated timeline), link to transaction dashboard
  - Clears the session storage for this listing
  - Validation: success screen shows the correct transaction reference, sessionStorage for this listingId is cleared

---

## Step 11 — Remaining Screens

- [ ] **Advanced search with server-side filters**
  - Backend: update `GET /listings` to accept query params: `location`, `minPrice`, `maxPrice`, `buildType`, `minBeds`, `status` — apply as Prisma `where` conditions
  - Frontend: add a filter bar above the listings grid on the buyer listings page with inputs for each filter
  - Filters apply on change with debouncing (300ms)
  - Active filters shown as removable chips
  - Validation: filter by minBeds=3, confirm only listings with beds >= 3 are returned

- [ ] **Saved / liked properties**
  - Add `SavedProperty` model: `id`, `buyerId String`, `listingId String`, `createdAt`, `@@unique([buyerId, listingId])`; run migration
  - Backend: `POST /listings/:id/save`, `DELETE /listings/:id/save`, `GET /listings/saved` (buyer's saved list)
  - Frontend: heart icon on every listing card, filled when saved. Toggle saves/unsaves. Buyer dashboard has a "Saved Properties" tab.
  - Notify buyer when a saved property's status changes (e.g., goes LIVE, goes UNDER_OFFER)
  - Validation: save a listing, it appears in "Saved Properties" tab. Change listing to UNDER_OFFER as admin — buyer receives notification.

- [ ] **Inspection scheduling**
  - Add `InspectionSlot` model: `id`, `listingId`, `professionalId`, `requestedById`, `scheduledAt DateTime`, `status String @default("REQUESTED")` (REQUESTED, CONFIRMED, COMPLETED, CANCELLED), `outcome String?`, `notes String?`; run migration
  - Backend: `POST /listings/:id/inspection-requests`, `GET /listings/:id/inspection-requests`, `PATCH /inspection-slots/:id` (status update, outcome logging)
  - Frontend: "Schedule Inspection" button on the listing detail page (currently a disabled stub) — opens a date/time picker, submits request. Shows scheduled inspections and their status on the buyer's transaction page.
  - Validation: request an inspection as a buyer, confirm as staff, log an outcome — all status transitions visible in the UI

- [ ] **Analytics — seller performance**
  - Backend: `GET /listings/:id/analytics` returning `{ views: number, saves: number, transactionCount: number, ddPurchases: number }` — these can be approximate counts from existing data, no real view tracking needed yet
  - Frontend: add a performance summary section to each seller listing in their dashboard — views, saves, enquiries
  - Validation: listing shows analytics numbers (even if all zero — the section renders without crashing)

- [ ] **Analytics — admin overview**
  - Backend: `GET /admin/analytics` returning `{ totalListings, liveListings, totalTransactions, totalDdRevenue, pendingKyc, pendingVerifications }`
  - Frontend: update admin dashboard home page to show these numbers as stat cards (layout already exists via DashboardLayout StatCard component)
  - Validation: admin dashboard shows stat cards with real numbers from the database

---

## Completion

When all items above are checked, the platform is feature-complete for the initial scope. At that point:
- Run a full end-to-end test of the primary buyer journey (register → browse → purchase DD → complete wizard → track transaction)
- Run a full end-to-end test of the seller journey (register → list property → upload docs → submit → track verification)
- Run a full end-to-end test of the staff workflow (receive submission → assign professionals → review reports → approve listing)
- Document any remaining issues in a `docs/POST_BUILD_ISSUES.md` file
