/**
 * E2E smoke: login buyer → initiate Paystack payment → verify access_code returned.
 *
 * Usage:
 *   SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 node scripts/test-paystack-e2e.mjs
 */
const API = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");

function jar() {
  const cookies = new Map();
  return {
    storeFrom(res) {
      for (const line of res.headers.getSetCookie?.() ?? []) {
        const part = line.split(";")[0];
        const eq = part.indexOf("=");
        if (eq > 0) cookies.set(part.slice(0, eq), part.slice(eq + 1));
      }
    },
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      const c = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      if (c) headers.set("Cookie", c);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
      this.storeFrom(res);
      return res;
    },
  };
}

async function main() {
  const session = jar();
  console.log(`[paystack-e2e] API: ${API}`);

  const loginRes = await session.fetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "buyer@safebuyrealties.test",
      password: "password123",
    }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(login)}`);
  console.log("[paystack-e2e] Login OK:", login.data.user.email);

  const cfgRes = await session.fetch("/payments/config");
  const cfgBody = await cfgRes.json();
  console.log("[paystack-e2e] Payment config:", cfgBody.data);

  const listingsRes = await session.fetch("/listings");
  const listingsBody = await listingsRes.json();
  const live = (listingsBody.data ?? []).find((l) => l.status === "LIVE");
  if (!live) throw new Error("No LIVE listing found");

  let txBody = { data: null };
  const txRes = await session.fetch("/transactions", {
    method: "POST",
    body: JSON.stringify({ listingId: live.id }),
  });
  txBody = await txRes.json();
  if (!txRes.ok) {
    const existing = await session.fetch("/transactions/me");
    const existingBody = await existing.json();
    const open = (existingBody.data ?? []).find(
      (t) =>
        t.listingId === live.id &&
        !["COMPLETED", "CANCELLED"].includes(t.status),
    );
    const anyOpen = (existingBody.data ?? []).find(
      (t) => !["COMPLETED", "CANCELLED"].includes(t.status),
    );
    const tx = open ?? anyOpen;
    if (!tx) throw new Error(`Could not create transaction: ${JSON.stringify(txBody)}`);
    txBody.data = tx;
    if (tx.listingId !== live.id) {
      console.log("[paystack-e2e] Using existing open transaction for listing:", tx.listingId);
    }
  }
  const txId = txBody.data?.id ?? txBody.id;
  console.log("[paystack-e2e] Transaction:", txId);

  const payRes = await session.fetch("/payments/initiate", {
    method: "POST",
    body: JSON.stringify({
      amount: 5000,
      currency: "NGN",
      transactionId: txId,
      listingId: live.id,
      callbackUrl: "https://safebuyrealties-app.vercel.app/dashboard/buyer/transactions",
      intent: "DD_SERVICE",
    }),
  });
  const pay = await payRes.json();
  if (!payRes.ok) throw new Error(`Initiate failed: ${JSON.stringify(pay)}`);

  const result = pay.data ?? pay;
  console.log("[paystack-e2e] Initiate OK");
  console.log("  reference:", result.reference);
  console.log("  accessCode:", result.accessCode ? `${result.accessCode.slice(0, 8)}…` : "(none)");
  console.log("  mock:", result.authorizationUrl?.includes("mock=1") ?? false);

  if (!result.accessCode && !result.authorizationUrl?.includes("mock=1")) {
    throw new Error("Expected Paystack accessCode or mock URL");
  }

  console.log("\n[paystack-e2e] PASS — use Paystack test card 4084084084084081 in popup checkout");
  console.log("See: https://paystack.com/docs/payments/test-payments/");
}

main().catch((e) => {
  console.error("[paystack-e2e] FAIL:", e.message);
  process.exit(1);
});
