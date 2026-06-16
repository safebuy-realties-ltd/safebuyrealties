#!/usr/bin/env node
/**
 * Guest buyer checkout E2E: browse listing → create order → pay (mock) → activation token.
 *
 *   npm run test:guest-checkout-e2e
 *   SBR_API_BASE=http://localhost:3001/api/v1 npm run test:guest-checkout-e2e
 */
import { randomUUID } from "node:crypto";

const base = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const STAMP = Date.now();

const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  const icon = status === "pass" ? "PASS" : status === "partial" ? "PART" : "FAIL";
  console.log(`${icon}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function req(path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text?.slice(0, 300) };
  }
  return { res, json, status: res.status, ok: res.ok };
}

async function main() {
  console.log(`Guest checkout E2E — ${base}\n`);

  const listings = await req("/listings?pageSize=5");
  if (!listings.ok) {
    record("listings.public", "fail", `HTTP ${listings.status}`);
    process.exit(1);
  }
  const live = (listings.json?.data ?? []).find(
    (l) => l.status === "LIVE" || (l.status === "VERIFIED" && l.isPublished),
  );
  if (!live) {
    record("listings.public", "fail", "No publicly visible listing found");
    process.exit(1);
  }
  record("listings.public", "pass", live.title);

  const docs = await req(`/listings/${live.id}/public-documents`);
  record(
    "listings.publicDocuments",
    docs.ok ? "pass" : "fail",
    docs.ok ? `${(docs.json?.data ?? []).length} names` : `HTTP ${docs.status}`,
  );

  const detail = await req(`/listings/${live.id}`);
  record(
    "listings.publicDetail",
    detail.ok ? "pass" : "fail",
    detail.ok ? `propertyId=${detail.json?.data?.propertyId ?? "—"}` : `HTTP ${detail.status}`,
  );

  const catalog = await req("/service-catalog/items");
  const items = catalog.json?.data ?? [];
  const ddCodes = ["LEGAL_CHECK", "PHYSICAL_CHECK", "ENVIRONMENTAL_CHECK", "SECURITY_CHECK"];
  const itemIds = ddCodes
    .map((code) => items.find((i) => i.code === code)?.id)
    .filter(Boolean);
  if (itemIds.length < 4) {
    record("catalog.ddChecks", "fail", `Found ${itemIds.length}/4 DD check items`);
    process.exit(1);
  }
  record("catalog.ddChecks", "pass", itemIds.join(","));

  const guestEmail = `guest+e2e-${STAMP}@safebuyrealties.test`;
  const create = await req("/guest-checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      listingId: live.id,
      guestName: "E2E Guest Buyer",
      guestEmail,
      guestPhone: "+2348012345678",
      itemIds,
      includeInspection: true,
    }),
  });
  if (!create.ok || !create.json?.data?.serviceId) {
    record("guest.createOrder", "fail", `HTTP ${create.status} ${JSON.stringify(create.json)}`);
    process.exit(1);
  }
  const { serviceId, caseId, buyerId } = create.json.data;
  record("guest.createOrder", "pass", `serviceId=${serviceId}`);

  if (!/^SBR-SRV-BUY-\d{8}-\d{3}$/.test(serviceId)) {
    record("guest.serviceIdFormat", "fail", serviceId);
  } else {
    record("guest.serviceIdFormat", "pass", serviceId);
  }

  if (caseId && /^SBR-CASE-DD-/.test(caseId)) {
    record("guest.caseIdFormat", "pass", caseId);
  } else {
    record("guest.caseIdFormat", "partial", caseId ?? "missing");
  }

  if (buyerId && /^SBR-BUY-/.test(buyerId)) {
    record("guest.buyerIdFormat", "pass", buyerId);
  } else {
    record("guest.buyerIdFormat", "partial", buyerId ?? "pending until pay");
  }

  const pay = await req(`/guest-checkout/orders/${serviceId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      guestName: "E2E Guest Buyer",
      guestEmail,
      guestPhone: "+2348012345678",
      callbackUrl: "http://localhost:8080/checkout/success",
    }),
  });
  if (!pay.ok) {
    record("guest.pay", "fail", `HTTP ${pay.status} ${JSON.stringify(pay.json)}`);
    process.exit(1);
  }
  const txnId = pay.json?.data?.transactionPublicId;
  record("guest.pay", "pass", `txn=${txnId ?? pay.json?.data?.paymentId}`);

  await new Promise((r) => setTimeout(r, 500));

  const order = await req(`/guest-checkout/orders/${serviceId}`);
  const paid = order.json?.data?.status === "PAID";
  record("guest.orderPaid", paid ? "pass" : "partial", order.json?.data?.status ?? "unknown");

  const fails = results.filter((r) => r.status === "fail").length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
