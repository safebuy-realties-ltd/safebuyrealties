# QA findings log

> Maintained by the visual QA agent. Do not delete historical runs — add new sections per run.

## QA run — _pending_

### Summary

- **Environment:** _not started_
- **Branch:** `cursor/visual-qa-fixes-e4ea`
- **Tester:**

### Issues

| ID | Severity | Role | Route | Steps | Expected | Actual | Status | Fix |
|----|----------|------|-------|-------|----------|--------|--------|-----|
| QA-001 | P0 | seller | `/dashboard/seller/listings` | Login → My Listings | Single sidebar + header | Nested duplicate dashboard (see VISUAL_QA_AGENT_PROMPT) | open | Remove duplicate `DashboardLayout` in child routes |

### Paystack test run

| Field | Value |
|-------|-------|
| Test keys configured | |
| Transaction ID | |
| Payment ID | |
| Paystack reference | |
| Popup opened | |
| Verify endpoint | |
| Final tx/listing status | |

### Checklist / PRD gaps (product debt, not necessarily bugs)

| Item | Notes |
|------|-------|
| DD purchase wizard `/purchase/:listingId` | Not built (Step 10) |
| Admin settings UI | Placeholder; API exists |
| Notification bell | No backend |
| Make an offer / Schedule visit | Disabled stubs on listing detail |
