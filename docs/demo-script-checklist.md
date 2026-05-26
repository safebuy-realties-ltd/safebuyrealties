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
