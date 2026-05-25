/**
 * Smoke-test auth + CRUD against a running API (local or production).
 * Usage: node scripts/validate-api.mjs [baseUrl]
 * Default baseUrl: http://localhost:3001/api/v1
 */
const base = (process.argv[2] ?? "http://localhost:3001/api/v1").replace(/\/$/, "");

async function req(path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const jar = new Map();
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const [name, value] = pair.split("=");
    if (name && value) jar.set(name.trim(), value.trim());
  }
}
function cookieHeader() {
  if (jar.size === 0) return {};
  return { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") };
}

async function main() {
  console.log(`Validating ${base} …`);

  const health = await req("/health");
  assert(health.res.ok, `health failed: ${health.res.status}`);

  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "buyer@safebuyrealties.test",
      password: "password123",
    }),
  });
  if (login.res.status === 401) {
    console.warn("Login 401 — database may be empty; run `cd backend && npm run prisma:seed`.");
  } else {
    assert(login.res.ok, `login failed: ${login.res.status} ${JSON.stringify(login.body)}`);
    storeCookies(login.res);
    console.log("✓ login");
  }

  const me = await req("/auth/me", { headers: cookieHeader() });
  if (login.res.ok) {
    assert(me.res.ok, `auth/me failed: ${me.res.status}`);
    console.log("✓ auth/me", me.body.data?.email);
  }

  const listings = await req("/listings", { headers: cookieHeader() });
  assert(listings.res.ok, `listings GET failed: ${listings.res.status}`);
  console.log("✓ listings", Array.isArray(listings.body.data) ? listings.body.data.length : "?");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
