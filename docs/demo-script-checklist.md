> **Still usable, and incomplete.** Dated 2026-05-26. Every route below still exists in
> `src/routeTree.gen.ts` and `password123` is still the seed default, so the walkthrough works as
> written. What it does not cover is everything built after it: standalone due diligence, escrow, power
> of attorney, KYC and notifications. The five logins it names are five of the 27 accounts in
> [`DEMO_TEST_ACCOUNTS.csv`](DEMO_TEST_ACCOUNTS.csv), so a super admin or company demo needs that file
> instead. Treat this as a subset of the demo rather than the demo.
> (Banner added 2026-08-02 by story DOCS-4.)

# Demo Script Checklist

**Base URL (local — primary):** http://localhost:8080  
**API (local):** http://localhost:3001/api/v1  

Start stack: `cd backend && npm run start:dev` and `npm run dev` (see `docs/LOCAL_DEVELOPMENT.md`).

**Optional production:** https://safebuyrealties-app.vercel.app — `docs/VERCEL_VALIDATION.md`

**Logins (seed):** `password123` — `staff@`, `seller@`, `buyer@`, `lawyer@`, `admin@` `@safebuyrealties.test`

Validated walkthrough paths (append to base URL):

## Seller

- Dashboard overview: `/dashboard/seller`
- Create listing draft CTA: `/dashboard/seller`
- Upload documents + submit verification: `/dashboard/seller/documents`
- Create listing with beds/baths → public detail shows spec summary

## Buyer

- Listings browser: `/dashboard/buyer/listings`
- API-backed listing detail: `/listings/:listingId`
- Start transaction CTA: `/listings/:listingId` then `/dashboard/buyer/transactions`

## Staff

- Submission queue + approval persistence: `/dashboard/staff/submissions`
- Assignment workflow persistence: `/dashboard/staff/workflow`

## Professional

- Synced assigned tasks + status updates: `/dashboard/professional/tasks`

## Admin / platform

- `GET /api/v1/platform-config` (authenticated) — VAT and upload limits
