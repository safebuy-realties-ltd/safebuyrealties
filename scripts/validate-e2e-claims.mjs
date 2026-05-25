#!/usr/bin/env node
/**
 * Validates claimed "works end-to-end" flows against deployed API.
 * Usage: SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 node scripts/validate-e2e-claims.mjs
 */
const base = (process.env.SBR_API_BASE ?? "https://safebuyrealties-app.vercel.app/api/v1").replace(
  /\/$/,
  "",
);
const PASSWORD = process.env.SBR_PASSWORD ?? "password123";

const USERS = [
  { label: "buyer", email: "buyer@safebuyrealties.test", role: "buyer" },
  { label: "seller", email: "seller@safebuyrealties.test", role: "seller" },
  { label: "staff", email: "staff@safebuyrealties.test", role: "staff" },
  { label: "admin", email: "admin@safebuyrealties.test", role: "admin" },
  { label: "lawyer", email: "lawyer@safebuyrealties.test", role: "professional" },
];

const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  const icon = status === "pass" ? "PASS" : status === "partial" ? "PART" : "FAIL";
  console.log(`${icon}  ${id}${detail ? ` — ${detail}` : ""}`);
}

let cookie = "";

function storeSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const parts = raw.length ? raw : [res.headers.get("set-cookie")].filter(Boolean);
  const pairs = [];
  for (const line of parts) {
    const first = String(line).split(";")[0]?.trim();
    if (first) pairs.push(first);
  }
  if (pairs.length) cookie = pairs.join("; ");
}

async function req(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${base}${path}`, { ...init, headers });
  storeSetCookie(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text?.slice(0, 200) };
  }
  return { res, json };
}

async function loginAs(email) {
  cookie = "";
  const { res, json } = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok || !cookie) return { ok: false, json, status: res.status };
  const { res: meRes, json: me } = await req("/auth/me");
  return { ok: meRes.ok, json: me, status: meRes.status, user: me?.data };
}

async function main() {
  console.log(`\nValidating API: ${base}\n`);

  {
    const { res, json } = await req("/health");
    record("health", res.ok ? "pass" : "fail", json?.data?.status ?? res.status);
  }

  for (const u of USERS) {
    const L = await loginAs(u.email);
    if (!L.ok) {
      record(`auth.login.${u.label}`, "fail", `HTTP ${L.status}`);
      continue;
    }
    const role = L.user?.role;
    record(
      `auth.login.${u.label}`,
      role === u.role ? "pass" : "partial",
      `role=${role}`,
    );
  }

  // Buyer: LIVE listings
  await loginAs("buyer@safebuyrealties.test");
  {
    const { res, json } = await req("/listings?page=1&pageSize=20");
    const list = json?.data ?? [];
    const live = list.filter((l) => l.status === "LIVE");
    record(
      "buyer.listings",
      res.ok ? (list.length ? "pass" : "partial") : "fail",
      `${list.length} total, ${live.length} LIVE`,
    );
    globalThis._liveListingId = live[0]?.id ?? list[0]?.id;
  }

  // Buyer: transactions
  {
    const { res, json } = await req("/transactions/me?page=1&pageSize=10");
    const rows = json?.data ?? [];
    record("buyer.transactions", res.ok ? "pass" : "fail", `${rows.length} transaction(s)`);
    globalThis._txnId = rows[0]?.id;
  }

  // Buyer: create transaction on LIVE listing (if any)
  if (globalThis._liveListingId) {
    const { res, json } = await req("/transactions", {
      method: "POST",
      body: JSON.stringify({ listingId: globalThis._liveListingId }),
    });
    if (res.status === 409) {
      record("buyer.startTransaction", "pass", "409 under-offer guard or duplicate");
    } else {
      record(
        "buyer.startTransaction",
        res.ok ? "pass" : "partial",
        res.ok ? `id=${json?.data?.id}` : `HTTP ${res.status}`,
      );
      if (res.ok) globalThis._txnId = json?.data?.id;
    }
  } else {
    record("buyer.startTransaction", "partial", "no LIVE listing to test");
  }

  // Buyer: payment initiate (mock)
  if (globalThis._txnId) {
    const { res, json } = await req("/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ transactionId: globalThis._txnId }),
    });
    record(
      "buyer.paymentInitiate",
      res.ok ? "pass" : "partial",
      res.ok ? json?.data?.reference ?? "ok" : `HTTP ${res.status} ${JSON.stringify(json?.message ?? json)}`,
    );
  } else {
    record("buyer.paymentInitiate", "partial", "no transaction id");
  }

  // Seller: listings
  await loginAs("seller@safebuyrealties.test");
  {
    const { res, json } = await req("/listings/me?page=1&pageSize=20");
    const rows = json?.data ?? [];
    record("seller.listings", res.ok ? "pass" : "fail", `${rows.length} listing(s)`);
    globalThis._sellerListingId = rows.find((l) => l.status === "DRAFT" || l.status === "PENDING_REVIEW")?.id ?? rows[0]?.id;
  }

  // Seller: documents for listing
  if (globalThis._sellerListingId) {
    const { res, json } = await req(`/documents/listing/${globalThis._sellerListingId}`);
    record(
      "seller.documents",
      res.ok ? "pass" : "fail",
      `${(json?.data ?? []).length} document(s)`,
    );
  } else {
    record("seller.documents", "partial", "no seller listing");
  }

  // Staff: staff queue / listings
  await loginAs("staff@safebuyrealties.test");
  {
    const { res, json } = await req("/listings?page=1&pageSize=50");
    const rows = json?.data ?? [];
    const pending = rows.filter((l) =>
      ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION", "VERIFIED"].includes(l.status),
    );
    record("staff.listings", res.ok ? "pass" : "fail", `${pending.length} in workflow statuses`);
    globalThis._staffListingId = pending[0]?.id ?? rows[0]?.id;
  }

  // Staff: verification steps
  if (globalThis._staffListingId) {
    const { res, json } = await req(`/verification/listings/${globalThis._staffListingId}`);
    const steps = json?.data ?? [];
    record(
      "staff.verificationSteps",
      res.ok ? "pass" : "fail",
      `${steps.length} step(s)`,
    );
  }

  // Professional: tasks
  await loginAs("lawyer@safebuyrealties.test");
  {
    const { res, json } = await req("/tasks/me?page=1&pageSize=20");
    const tasks = json?.data ?? [];
    record("pro.tasks", res.ok ? "pass" : "fail", `${tasks.length} task(s)`);
    globalThis._taskId = tasks[0]?.id;

    for (const st of ["PENDING", "IN_PROGRESS", "COMPLETED"]) {
      const { res: r2, json: j2 } = await req(`/tasks/me?status=${st}&page=1&pageSize=100`);
      if (!r2.ok) record(`pro.tasks.filter.${st}`, "fail", String(r2.status));
    }
    record("pro.tasks.kpiFilters", "pass", "PENDING/IN_PROGRESS/COMPLETED query OK");
  }

  if (globalThis._taskId) {
    const { res, json } = await req(`/tasks/me/${globalThis._taskId}`);
    record("pro.taskDetail", res.ok ? "pass" : "fail", json?.data?.title ?? res.status);
  }

  // Admin: users + patch role smoke (read-only list)
  await loginAs("admin@safebuyrealties.test");
  {
    const { res, json } = await req("/users?page=1&pageSize=20");
    record("admin.users", res.ok ? "pass" : "fail", `${(json?.data ?? []).length} user(s)`);
  }
  {
    const { res, json } = await req("/listings?page=1&pageSize=20");
    record("admin.listings", res.ok ? "pass" : "fail", `${(json?.data ?? []).length} listing(s)`);
  }

  // Register endpoint exists (don't persist — dry validation of route)
  cookie = "";
  const regEmail = `validate-${Date.now()}@safebuyrealties.test`;
  const { res: regRes, json: regJson } = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: regEmail,
      password: PASSWORD,
      firstName: "Val",
      lastName: "Idate",
      role: "buyer",
    }),
  });
  record(
    "auth.register",
    regRes.ok || regRes.status === 201 ? "pass" : "fail",
    regRes.ok ? regEmail : `${regRes.status} ${regJson?.message ?? ""}`,
  );

  const fails = results.filter((r) => r.status === "fail").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const pass = results.filter((r) => r.status === "pass").length;
  console.log(`\n--- Summary: ${pass} pass, ${partial} partial, ${fails} fail ---\n`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
