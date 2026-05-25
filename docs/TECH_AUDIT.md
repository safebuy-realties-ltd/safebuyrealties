# Technical Audit — SafeBuyRealties (MVP PoC)

Date: 2026-05-02

This audit reviews implementation across frontend, backend, database, and PRD alignment.

## 1) System overview

### Backend implemented

- NestJS modules: auth, users, listings, documents, verification, tasks, payments, health.
- JWT auth with role-aware guards and global request validation.
- Prisma/PostgreSQL data model for users/listings/documents/verification steps/tasks/transactions/payments.

### Frontend implemented

- React + Vite + TanStack Router/Query shell with role-based dashboard routes.
- Auth provider with token persistence and `/auth/me` hydration.
- Buyer listings page wired to backend listings API.

### End-to-end flows that actually work

- Register/login/me flow (buyer/seller self-registration only).
- Authenticated listing CRUD with role and status-transition constraints.
- Document upload metadata + local filesystem storage via `/documents/upload`.
- Verification assignment/read/update APIs.
- Staff task creation + professional task updates.
- Payment initiation + paystack webhook status update path.

## 2) What is working well

- Good backend baseline structure: modules are separated by domain and share Prisma service cleanly.
- DTO + global validation (whitelist + forbidNonWhitelisted + transform) is correctly configured.
- Listing access/mutation logic is more robust than typical PoC projects (visibility by role, seller transition guardrails).
- Verification template auto-creation when listing enters review state is sensible for workflow consistency.
- Payments include signature verification logic for webhooks and handle mock mode when key absent.

## 3) What is broken or incomplete

- Major frontend surfaces are mostly static/mock and not integrated:
  - Seller dashboard uses hardcoded listing/docs stats and fake items.
  - Seller document page simulates uploads in state only and never calls backend.
  - Buyer transactions page is entirely static and disconnected from payments/transactions APIs.
- No frontend wiring found for verification assignment/patching or tasks endpoints.
- Documents API path in PRD (`GET /documents/:listingId`) differs from implementation (`GET /documents/listing/:listingId`).
- Transaction domain is modeled in DB but no transaction controller/service API is implemented, blocking true due-diligence-to-payment flow.
- `Task.documentId` exists in Prisma but has no relation/foreign key and is unused in service logic.

## 4) Frontend ↔ Backend alignment

- API envelope alignment is mostly correct: frontend expects `{data, meta?}` and backend interceptor/services return that shape.
- Auth alignment is correct for login/register/me and bearer token handling.
- Critical mismatch: frontend “25MB” upload expectation conflicts with backend hard 15MB limit.
- Critical product gap: frontend role dashboards don’t consume backend workflow APIs; only buyer listings currently queries live backend data.
- Potential query mismatch risk: listings hook does not pass pagination/status filters though backend supports them; not broken now but limits scalability/UI behavior.

## 5) Database & backend quality

- Prisma schema covers core entities and role enums well for MVP.
- Missing/weak constraints:
  - No uniqueness on verification step `(listingId, type)` — duplicates possible if manual inserts/migrations drift.
  - No uniqueness on `(listingId, order)` for workflow ordering integrity.
  - `Task.documentId` not relationally constrained.
- Lifecycle modeling gaps:
  - `Transaction` exists but is not connected to a full API/service lifecycle.
  - Payment can be linked to listing or transaction, but there’s no enforced invariant tying status transitions to transaction state.

## 6) Security risks (important)

- JWT persistence in localStorage is vulnerable to token theft via XSS; no refresh-token or rotation strategy.
- Uploaded files are written to local disk with metadata stored, but there is no virus scanning, extension/MIME validation hardening, or signed URL access pattern.
- Verification/task updates allow staff override (expected), but there is no immutable audit trail/event log for high-trust workflow actions.
- Webhook endpoint rejects invalid signatures properly, but no idempotency/event replay protection table exists.
- CORS configuration is permissive in non-prod for localhost/127.0.0.1 (fine for dev), but production safety depends entirely on `FRONTEND_URL` correctness.

## 7) Performance & scalability (MVP level)

- Documents stored on app filesystem will fail in multi-instance/containerized deployment without shared volume/object storage.
- Listings/task queries are paginated (good), but frontend doesn’t use pagination controls → large payloads over time.
- Verification/listing access checks can trigger extra count queries per request (acceptable at MVP scale; should be optimized later with joins/cached permissions).
- No background jobs/queues for heavy operations (file processing, notification fanout, payment reconciliation).

## 8) Deviation from PRD

Implemented vs PRD:

- Auth endpoints: implemented.
- Users endpoints: implemented.
- Listings CRUD + status model: implemented.
- Documents upload/list: partially implemented (route signature differs from PRD).
- Verification assign/get/patch: implemented with slight route naming differences.
- Tasks me/patch (+ create): implemented.
- Payments initiate/webhook/get: implemented.

Missing or materially incomplete for PRD intent:

- End-to-end buyer due-diligence initiation flow is not implemented in frontend.
- Professional workflow UI is mostly presentational; no full report upload/risk decision integration.
- Internal staff workflow UI appears mostly static and not fully wired.
- Notifications module is absent (noted as “later” in PRD, acceptable for MVP but still missing).
- Transaction lifecycle (offer → due diligence → payment → release) is not fully implemented despite schema support.

## 9) Top-priority fixes (ordered)

1. Wire seller documents UI to real upload/list APIs and fix file-size expectation mismatch (15MB vs 25MB).
2. Replace static buyer transactions UI with real backend-backed transaction/payment state.
3. Implement transaction service/controller lifecycle and connect payments to transaction state transitions.
4. Add DB constraints for verification step uniqueness/order and clean up `Task.documentId` relation.
5. Add security hardening for auth/session strategy (move away from localStorage-only JWT for production).
6. Add audit logging for critical verification/task/payment actions.
7. Implement frontend integration for verification and tasks workflows per role (staff/professional).
8. Move document storage to object storage abstraction (S3-compatible) with secure retrieval strategy.
9. Add webhook idempotency/replay protection for payment events.
10. Add contract tests/e2e tests for core role flows (seller listing, staff assign, pro complete, buyer pay).

## 10) Recommended next steps (MVP-focused)

1. **Integration pass**: remove mock data on seller/buyer dashboards and connect existing APIs.
2. **Transaction completion pass**: implement missing backend transaction lifecycle endpoints and state machine.
3. **Stability pass**: align API contracts + constraints + DTOs; add DB unique indexes and migrations.
4. **Security pass**: auth/session hardening, upload validation, webhook idempotency.
5. **Demo readiness pass**: scripted seed data and happy-path demo across all 5 roles.
6. **Quality pass**: add automated e2e smoke tests for the demo-critical workflows.
