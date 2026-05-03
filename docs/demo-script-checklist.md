# Demo Script Checklist

Validated walkthrough URLs:

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
