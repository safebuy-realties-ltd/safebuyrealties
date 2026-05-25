# Demo Script Checklist

**Base URL (production):** https://safebuyrealties-app.vercel.app  
**API (direct):** https://safebuyrealties.vercel.app/api/v1  
**Preview:** use the frontend preview URL from the Vercel dashboard for your branch.

**Logins (seed):** `password123` — `staff@`, `seller@`, `buyer@`, `lawyer@` `@safebuyrealties.test`

See `docs/VERCEL_VALIDATION.md` for curl smoke and migration workflow without Docker.

Validated walkthrough paths (append to base URL):

## Seller

- Dashboard overview: `/dashboard/seller`
- Create listing draft CTA: `/dashboard/seller`
- Upload documents + submit verification: `/dashboard/seller/documents`

## Buyer

- Listings browser: `/dashboard/buyer/listings`
- API-backed listing detail: `/listings/:listingId` (example from browser row)
- Start transaction CTA: `/listings/:listingId` then `/dashboard/buyer/transactions`

## Staff

- Submission queue + approval persistence: `/dashboard/staff/submissions`
- Assignment workflow persistence: `/dashboard/staff/workflow`

## Professional

- Synced assigned tasks + status updates: `/dashboard/professional/tasks`
