#!/usr/bin/env node
/**
 * Smoke-test deployed API (Vercel). No Docker required.
 *
 *   SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 node scripts/vercel-api-smoke.mjs
 *   SBR_EMAIL=staff@safebuyrealties.test SBR_PASSWORD=password123 node scripts/vercel-api-smoke.mjs
 */
const base = (process.env.SBR_API_BASE ?? "https://safebuyrealties-app.vercel.app/api/v1").replace(
  /\/$/,
  "",
);
const email = process.env.SBR_EMAIL ?? "staff@safebuyrealties.test";
const password = process.env.SBR_PASSWORD ?? "password123";

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
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  storeSetCookie(res);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json };
}

function ok(label, res) {
  if (!res.ok) {
    console.error(`FAIL ${label}: HTTP ${res.status}`);
    process.exit(1);
  }
  console.log(`OK   ${label}`);
}

async function main() {
  console.log(`API  ${base}`);
  {
    const { res, json } = await req("/health");
    ok("GET /health", res);
    console.log("     ", JSON.stringify(json));
  }
  {
    const { res, json } = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    ok("POST /auth/login", res);
    if (!cookie) {
      console.error("FAIL login: no Set-Cookie (session not established)");
      process.exit(1);
    }
    console.log("     ", json?.data?.email ?? json);
  }
  {
    const { res, json } = await req("/auth/me");
    ok("GET /auth/me", res);
    console.log("     ", json?.data?.role ?? json);
  }
  console.log("Smoke passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
