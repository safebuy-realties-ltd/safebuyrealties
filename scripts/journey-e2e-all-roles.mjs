#!/usr/bin/env node
/**
 * API-based smoke for each persona journey (guest → register/login → role actions).
 *
 *   npm run test:journey-e2e
 *   SBR_API_BASE=http://localhost:3001/api/v1 npm run test:journey-e2e
 */
const base = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const PASSWORD = process.env.SBR_PASSWORD ?? "password123";
// E7-S3. Against a shared database "partial" means the data happened not to be there, which is not
// the script's fault and should not fail a developer's run. Against the freshly migrated and seeded
// database CI provisions, the data is always there, so a partial is a regression. CI sets this.
const STRICT = process.env.SBR_E2E_STRICT === "1";

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

function clearSession() {
  cookie = "";
}

async function loginAs(email) {
  clearSession();
  const { res, json } = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok || !cookie) return { ok: false, json, status: res.status };
  const { res: meRes, json: me } = await req("/auth/me");
  return { ok: meRes.ok, json: me, status: meRes.status, user: me?.data };
}

async function registerBuyer(email) {
  clearSession();
  const { res, json } = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      firstName: "Journey",
      lastName: "Buyer",
      role: "BUYER",
    }),
  });
  if (!res.ok) return { ok: false, json, status: res.status };
  const { res: meRes, json: me } = await req("/auth/me");
  return { ok: meRes.ok, user: me?.data, status: meRes.status };
}

const WORKFLOW_STATUSES = [
  "PENDING_REVIEW",
  "ASSIGNED",
  "IN_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "LIVE",
];

async function main() {
  console.log(`\nJourney E2E (API): ${base}\n`);

  let liveListingId = null;

  // Guest: public listings (no auth)
  {
    clearSession();
    const { res, json } = await req("/listings?page=1&pageSize=20");
    const list = json?.data ?? [];
    const live = list.filter((l) => l.status === "LIVE");
    liveListingId = live[0]?.id ?? list[0]?.id ?? null;
    record(
      "guest.listings",
      res.ok ? (live.length > 0 ? "pass" : "partial") : "fail",
      `${list.length} total, ${live.length} LIVE (no auth)`,
    );
  }

  // Buyer: register → browse → create transaction
  {
    const buyerEmail = `journey-buyer-${Date.now()}@safebuyrealties.test`;
    const reg = await registerBuyer(buyerEmail);
    if (!reg.ok) {
      record("buyer.register", "fail", `HTTP ${reg.status}`);
    } else {
      record("buyer.register", reg.user?.role === "buyer" ? "pass" : "partial", buyerEmail);
    }

    const { res: listRes, json: listJson } = await req("/listings?page=1&pageSize=20");
    const listings = listJson?.data ?? [];
    record(
      "buyer.browse",
      listRes.ok ? "pass" : "fail",
      `${listings.length} listing(s) after register`,
    );

    const targetId = liveListingId ?? listings.find((l) => l.status === "LIVE")?.id;
    if (targetId) {
      const { res, json } = await req("/transactions", {
        method: "POST",
        body: JSON.stringify({ listingId: targetId }),
      });
      if (res.status === 409) {
        record("buyer.createTransaction", "pass", "409 guard (under offer or duplicate)");
      } else {
        record(
          "buyer.createTransaction",
          res.ok ? "pass" : "partial",
          res.ok ? `id=${json?.data?.id}` : `HTTP ${res.status}`,
        );
      }
    } else {
      record("buyer.createTransaction", "partial", "no LIVE listing available");
    }
  }

  // Seller: login → create draft listing
  {
    const login = await loginAs("seller@safebuyrealties.test");
    if (!login.ok) {
      record("seller.login", "fail", `HTTP ${login.status}`);
    } else {
      record("seller.login", login.user?.role === "seller" ? "pass" : "partial", "seller");
    }

    const { res, json } = await req("/listings", {
      method: "POST",
      body: JSON.stringify({
        title: `Journey draft ${Date.now()}`,
        description: "E2E journey draft listing",
        location: "Lagos",
        price: 0,
        currency: "NGN",
      }),
    });
    record(
      "seller.createDraft",
      res.ok ? "pass" : "fail",
      res.ok ? `id=${json?.data?.id}` : `HTTP ${res.status}`,
    );
  }

  // Professional: login → get tasks
  {
    const login = await loginAs("lawyer@safebuyrealties.test");
    if (!login.ok) {
      record("professional.login", "fail", `HTTP ${login.status}`);
    } else {
      record(
        "professional.login",
        login.user?.role === "professional" ? "pass" : "partial",
        login.user?.professionalType ?? "professional",
      );
    }

    const { res, json } = await req("/tasks/me?page=1&pageSize=20");
    const tasks = json?.data ?? [];
    record("professional.tasks", res.ok ? "pass" : "fail", `${tasks.length} task(s)`);
  }

  // Staff: login → staff queue data (listings in workflow)
  {
    const login = await loginAs("staff@safebuyrealties.test");
    if (!login.ok) {
      record("staff.login", "fail", `HTTP ${login.status}`);
    } else {
      record("staff.login", login.user?.role === "staff" ? "pass" : "partial", "staff");
    }

    const { res, json } = await req("/listings?page=1&pageSize=100");
    const rows = json?.data ?? [];
    const inQueue = rows.filter((l) => WORKFLOW_STATUSES.includes(l.status));
    record("staff.queue", res.ok ? "pass" : "fail", `${inQueue.length} listing(s) in workflow`);

    if (inQueue[0]?.id) {
      const { res: vRes, json: vJson } = await req(`/verification/listing/${inQueue[0].id}`);
      const steps = vJson?.data ?? [];
      record(
        "staff.verificationSteps",
        vRes.ok ? "pass" : "partial",
        `${steps.length} step(s) for first queue item`,
      );
    }
  }

  // Admin: login → analytics
  {
    const login = await loginAs("admin@safebuyrealties.test");
    if (!login.ok) {
      record("admin.login", "fail", `HTTP ${login.status}`);
    } else {
      record("admin.login", login.user?.role === "admin" ? "pass" : "partial", "admin");
    }

    const { res, json } = await req("/admin/analytics");
    const hasData = json?.data && typeof json.data === "object";
    record(
      "admin.analytics",
      res.ok && hasData ? "pass" : res.ok ? "partial" : "fail",
      res.ok ? "analytics payload OK" : `HTTP ${res.status}`,
    );
  }

  // Super admin: login if seeded
  {
    const login = await loginAs("superadmin@safebuyrealties.test");
    if (!login.ok) {
      record("super_admin.login", "partial", "superadmin@ not seeded or login failed");
    } else {
      const role = login.user?.role;
      record(
        "super_admin.login",
        role === "super_admin" || role === "admin" ? "pass" : "partial",
        `role=${role}`,
      );
      const { res } = await req("/admin/analytics");
      record(
        "super_admin.analytics",
        res.ok ? "pass" : "partial",
        res.ok ? "analytics accessible" : `HTTP ${res.status}`,
      );
    }
  }

  const fails = results.filter((r) => r.status === "fail").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const pass = results.filter((r) => r.status === "pass").length;
  console.log(`\n--- Summary: ${pass} pass, ${partial} partial, ${fails} fail ---\n`);
  if (STRICT && partial > 0) {
    console.log(`Strict mode: ${partial} partial result(s) counted as failures.`);
    results.filter((r) => r.status === "partial").forEach((r) => console.log(`  ${r.id}`));
  }
  process.exit(fails > 0 || (STRICT && partial > 0) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
