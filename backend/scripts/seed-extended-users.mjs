/**
 * Idempotently upsert demo users (3–5 per role) via the live API.
 * Requires an existing admin session or admin credentials.
 *
 * Usage:
 *   SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 \
 *   SBR_ADMIN_EMAIL=admin@safebuyrealties.test \
 *   SBR_ADMIN_PASSWORD=password123 \
 *   node backend/scripts/seed-extended-users.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PASSWORD = process.env.SBR_DEMO_PASSWORD?.trim() || "password123";
const API_BASE = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SBR_ADMIN_EMAIL ?? "admin@safebuyrealties.test";
const ADMIN_PASSWORD = process.env.SBR_ADMIN_PASSWORD ?? PASSWORD;
const APP_URL = process.env.SBR_APP_URL ?? "https://safebuyrealties-app.vercel.app";

/** @type {Array<{email:string,firstName:string,lastName:string,role:string,professionalType?:string|null,phone?:string}>} */
const DEMO_USERS = [
  // ADMIN (5)
  { email: "admin@safebuyrealties.test", firstName: "Ada", lastName: "Admin", role: "ADMIN" },
  { email: "admin2@safebuyrealties.test", firstName: "Alex", lastName: "Adeyemi", role: "ADMIN" },
  { email: "admin3@safebuyrealties.test", firstName: "Amina", lastName: "Hassan", role: "ADMIN" },
  { email: "admin4@safebuyrealties.test", firstName: "Chidi", lastName: "Nwosu", role: "ADMIN" },
  { email: "admin5@safebuyrealties.test", firstName: "Diana", lastName: "Osei", role: "ADMIN" },
  // STAFF (5)
  { email: "staff@safebuyrealties.test", firstName: "Sam", lastName: "Staff", role: "STAFF" },
  { email: "staff2@safebuyrealties.test", firstName: "Sola", lastName: "Bakare", role: "STAFF" },
  { email: "staff3@safebuyrealties.test", firstName: "Ngozi", lastName: "Eze", role: "STAFF" },
  { email: "staff4@safebuyrealties.test", firstName: "Ibrahim", lastName: "Bello", role: "STAFF" },
  { email: "staff5@safebuyrealties.test", firstName: "Grace", lastName: "Okon", role: "STAFF" },
  // SELLER (5)
  { email: "seller@safebuyrealties.test", firstName: "Sara", lastName: "Seller", role: "SELLER" },
  { email: "seller2@safebuyrealties.test", firstName: "Kemi", lastName: "Okafor", role: "SELLER" },
  { email: "seller3@safebuyrealties.test", firstName: "Tunde", lastName: "Adebayo", role: "SELLER" },
  { email: "seller4@safebuyrealties.test", firstName: "Fatima", lastName: "Yusuf", role: "SELLER" },
  { email: "seller5@safebuyrealties.test", firstName: "Emeka", lastName: "Chukwu", role: "SELLER" },
  // BUYER (5)
  { email: "buyer@safebuyrealties.test", firstName: "Ben", lastName: "Buyer", role: "BUYER" },
  { email: "buyer2@safebuyrealties.test", firstName: "Zain", lastName: "Musa", role: "BUYER" },
  { email: "buyer3@safebuyrealties.test", firstName: "Chioma", lastName: "Ibe", role: "BUYER" },
  { email: "buyer4@safebuyrealties.test", firstName: "David", lastName: "Peterson", role: "BUYER" },
  { email: "buyer5@safebuyrealties.test", firstName: "Halima", lastName: "Garba", role: "BUYER" },
  // PROFESSIONAL (5)
  {
    email: "lawyer@safebuyrealties.test",
    firstName: "Lee",
    lastName: "Lawyer",
    role: "PROFESSIONAL",
    professionalType: "LAWYER",
  },
  {
    email: "surveyor@safebuyrealties.test",
    firstName: "Tobi",
    lastName: "Survey",
    role: "PROFESSIONAL",
    professionalType: "SURVEYOR",
  },
  {
    email: "valuer@safebuyrealties.test",
    firstName: "Femi",
    lastName: "Valuer",
    role: "PROFESSIONAL",
    professionalType: "VALUER",
  },
  {
    email: "architect@safebuyrealties.test",
    firstName: "Adaora",
    lastName: "Design",
    role: "PROFESSIONAL",
    professionalType: "ARCHITECT",
  },
  {
    email: "engineer@safebuyrealties.test",
    firstName: "Kunle",
    lastName: "Build",
    role: "PROFESSIONAL",
    professionalType: "ENGINEER",
  },
];

function jar() {
  /** @type {Map<string,string>} */
  const cookies = new Map();
  return {
    storeFrom(response) {
      const raw = response.headers.getSetCookie?.() ?? [];
      for (const line of raw) {
        const part = line.split(";")[0];
        const eq = part.indexOf("=");
        if (eq > 0) cookies.set(part.slice(0, eq), part.slice(eq + 1));
      }
    },
    header() {
      if (!cookies.size) return "";
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      const c = this.header();
      if (c) headers.set("Cookie", c);
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
      this.storeFrom(res);
      return res;
    },
  };
}

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return body;
}

async function login(session, email, password) {
  const res = await session.fetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return readJson(res);
}

async function register(session, user) {
  const res = await session.fetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      password: PASSWORD,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role === "SELLER" ? "SELLER" : "BUYER",
    }),
  });
  return readJson(res);
}

async function listUsers(session) {
  const res = await session.fetch("/users?pageSize=100");
  const body = await readJson(res);
  return body.data ?? [];
}

async function patchUser(session, id, patch) {
  const res = await session.fetch(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return readJson(res);
}

function roleLabel(role, professionalType) {
  if (role === "PROFESSIONAL" && professionalType) {
    return `PROFESSIONAL (${professionalType})`;
  }
  return role;
}

function toCsv(rows) {
  const header = [
    "Role",
    "Professional Type",
    "First Name",
    "Last Name",
    "Email",
    "Password",
    "App URL",
    "Dashboard Path",
    "Notes",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.role,
        r.professionalType ?? "",
        r.firstName,
        r.lastName,
        r.email,
        r.password,
        r.appUrl,
        r.dashboardPath,
        r.notes,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function dashboardPath(role) {
  switch (role) {
    case "ADMIN":
      return "/dashboard/admin";
    case "STAFF":
      return "/dashboard/staff";
    case "SELLER":
      return "/dashboard/seller";
    case "BUYER":
      return "/dashboard/buyer";
    case "PROFESSIONAL":
      return "/dashboard/professional";
    default:
      return "/dashboard";
  }
}

async function main() {
  const admin = jar();
  console.log(`[seed-extended-users] API: ${API_BASE}`);
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("[seed-extended-users] Admin session OK");

  let existing = await listUsers(admin);
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

  for (const spec of DEMO_USERS) {
    const email = spec.email.toLowerCase();
    let user = byEmail.get(email);

    if (!user) {
      const regSession = jar();
      try {
        const regRole = spec.role === "SELLER" ? "SELLER" : "BUYER";
        console.log(`  + register ${email} as ${regRole}`);
        const out = await register(regSession, { ...spec, role: regRole });
        user = out.data.user;
        byEmail.set(email, user);
      } catch (e) {
        console.warn(`  ! register ${email}: ${e.message}`);
        existing = await listUsers(admin);
        for (const u of existing) byEmail.set(u.email.toLowerCase(), u);
        user = byEmail.get(email);
      }
    }

    if (!user) {
      console.warn(`  ! skip ${email} — could not create or find`);
      continue;
    }

    const targetRole = spec.role;
    const needsRole = user.role?.toUpperCase() !== targetRole;
    const needsType =
      targetRole === "PROFESSIONAL" &&
      spec.professionalType &&
      (user.professionalType ?? "").toUpperCase() !== spec.professionalType;

    if (needsRole || needsType) {
      console.log(`  ~ patch ${email} → ${targetRole}${spec.professionalType ? ` (${spec.professionalType})` : ""}`);
      const patch = {
        firstName: spec.firstName,
        lastName: spec.lastName,
        phone: spec.phone ?? "+2348000000000",
      };
      if (needsRole) patch.role = targetRole;
      if (spec.professionalType) patch.professionalType = spec.professionalType;
      const updated = await patchUser(admin, user.id, patch);
      byEmail.set(email, updated.data);
    } else {
      console.log(`  = ${email} already ${targetRole}`);
    }
  }

  const rows = DEMO_USERS.map((spec) => ({
    role: roleLabel(spec.role, spec.professionalType ?? null),
    professionalType: spec.professionalType ?? "",
    firstName: spec.firstName,
    lastName: spec.lastName,
    email: spec.email,
    password: PASSWORD,
    appUrl: APP_URL,
    dashboardPath: dashboardPath(spec.role),
    notes: "Shared demo account — do not use for real transactions",
  }));

  const csv = toCsv(rows);
  const outDir = resolve(__dirname, "../../docs");
  mkdirSync(outDir, { recursive: true });
  const csvPath = resolve(outDir, "DEMO_TEST_ACCOUNTS.csv");
  writeFileSync(csvPath, csv, "utf8");
  console.log(`[seed-extended-users] Wrote ${csvPath}`);
  console.table(
    rows.map((r) => ({ role: r.role, email: r.email, password: r.password })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
