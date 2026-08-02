#!/usr/bin/env node
/**
 * Full listing lifecycle E2E: seller upload → staff verification workflow → LIVE.
 * Verifies workflow auto-sync (no manual Submissions status PATCHes) and that
 * staff, admin, and super-admin can see listing, documents, and verification details.
 *
 *   npm run test:listing-lifecycle-e2e
 *   SBR_API_BASE=http://localhost:3001/api/v1 npm run test:listing-lifecycle-e2e
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const PASSWORD = process.env.SBR_PASSWORD ?? "password123";
// E7-S3. See journey-e2e-all-roles.mjs: a partial is tolerable against a shared database and is a
// regression against the seeded ephemeral one CI provisions.
const STRICT = process.env.SBR_E2E_STRICT === "1";
const STAMP = Date.now();

const results = [];
let cookie = "";

function record(id, status, detail) {
  results.push({ id, status, detail });
  const icon = status === "pass" ? "PASS" : status === "partial" ? "PART" : "FAIL";
  console.log(`${icon}  ${id}${detail ? ` — ${detail}` : ""}`);
}

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
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  storeSetCookie(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text?.slice(0, 300) };
  }
  return { res, json, status: res.status, ok: res.ok };
}

function clearSession() {
  cookie = "";
}

async function loginAs(email) {
  clearSession();
  const { ok, json, status } = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!ok || !cookie) return { ok: false, status, json };
  const me = await req("/auth/me");
  return { ok: me.ok, user: me.json?.data, status: me.status };
}

async function registerSeller(email) {
  clearSession();
  const { ok, status, json } = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      firstName: "Lifecycle",
      lastName: "Seller",
      role: "SELLER",
    }),
  });
  if (!ok) return { ok: false, status, json };
  const me = await req("/auth/me");
  return { ok: me.ok, user: me.json?.data };
}

const INTERNAL_ROLES = [
  { key: "staff", email: "staff@safebuyrealties.test" },
  { key: "admin", email: "admin@safebuyrealties.test" },
  { key: "super_admin", email: "superadmin@safebuyrealties.test" },
];

const WORKFLOW_ACTIVE_STATUSES = new Set(["ASSIGNED", "IN_VERIFICATION"]);

const STEP_PRO_MAP = {
  DOCUMENT_REVIEW: "lawyer@safebuyrealties.test",
  FIELD_VERIFICATION: "surveyor@safebuyrealties.test",
  LEGAL: "lawyer@safebuyrealties.test",
  SURVEY: "surveyor@safebuyrealties.test",
  VALUATION: "valuer@safebuyrealties.test",
  RISK_REVIEW: "lawyer@safebuyrealties.test",
  FINAL_APPROVAL: "lawyer@safebuyrealties.test",
};

const DEMO_PROFESSIONAL_PROFILES = [
  { email: "lawyer@safebuyrealties.test", regulatoryBody: "NBA", licenseNumber: "NBA/E2E/001" },
  {
    email: "surveyor@safebuyrealties.test",
    regulatoryBody: "SURCON",
    licenseNumber: "SURCON/E2E/001",
  },
  { email: "valuer@safebuyrealties.test", regulatoryBody: "NIESV", licenseNumber: "NIESV/E2E/001" },
  {
    email: "architect@safebuyrealties.test",
    regulatoryBody: "ARCON",
    licenseNumber: "ARCON/E2E/001",
  },
  {
    email: "engineer@safebuyrealties.test",
    regulatoryBody: "COREN",
    licenseNumber: "COREN/E2E/001",
  },
];

const DEMO_PRO_EMAILS = new Set(DEMO_PROFESSIONAL_PROFILES.map((p) => p.email));
const ASSIGNED_PRO_EMAILS = new Set(Object.values(STEP_PRO_MAP));

async function assertInternalVisibility(listingId, stageLabel) {
  for (const { key, email } of INTERNAL_ROLES) {
    const login = await loginAs(email);
    if (!login.ok) {
      record(`visibility.${key}.${stageLabel}.login`, "fail", email);
      continue;
    }

    const listing = await req(`/listings/${listingId}`);
    record(
      `visibility.${key}.${stageLabel}.listing`,
      listing.ok ? "pass" : "fail",
      listing.json?.data?.status ?? `HTTP ${listing.status}`,
    );

    const docs = await req(`/documents/listing/${listingId}`);
    record(
      `visibility.${key}.${stageLabel}.documents`,
      docs.ok ? "pass" : "fail",
      `${(docs.json?.data ?? []).length} doc(s)`,
    );

    const steps = await req(`/verification/listing/${listingId}`);
    const stepRows = steps.json?.data ?? [];
    const hasInternalFields = stepRows.some(
      (s) => "assignedProfessionalId" in s || "notes" in s,
    );
    record(
      `visibility.${key}.${stageLabel}.verification`,
      steps.ok && stepRows.length >= 8 ? "pass" : steps.ok ? "partial" : "fail",
      `${stepRows.length} step(s)${hasInternalFields ? ", internal fields" : ""}`,
    );

    const activity = await req(`/verification/listing/${listingId}/activity`);
    record(
      `visibility.${key}.${stageLabel}.activity`,
      activity.ok ? "pass" : "fail",
      `${(activity.json?.data ?? []).length} audit row(s)`,
    );
  }
}

async function uploadDoc(listingId, category, filePath, fileName) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("listingId", listingId);
  form.append("category", category);
  form.append("file", new Blob([buf], { type: "application/pdf" }), fileName);
  return req("/documents/upload", { method: "POST", body: form });
}

let professionalIdCache = null;

async function loadProfessionalIds() {
  if (professionalIdCache) return professionalIdCache;
  const login = await loginAs("staff@safebuyrealties.test");
  if (!login.ok) return {};
  const { json } = await req("/users?role=PROFESSIONAL&pageSize=100");
  const users = json?.data ?? [];
  professionalIdCache = Object.fromEntries(users.map((u) => [u.email, u.id]));
  return professionalIdCache;
}

async function getProfessionalId(email) {
  const ids = await loadProfessionalIds();
  return ids[email] ?? null;
}

/**
 * Gets one professional's credentials in front of staff, from whatever state the account is in.
 *
 * The catch is that `verifiedStatus` already reads PENDING on a profile nobody has filled in:
 * promoting somebody to PROFESSIONAL leaves an empty stub row behind. This used to see PENDING,
 * call it "ready for staff approval" and return. Against the shared database the demo
 * professionals were verified long ago so it never showed; against a database seeded ninety
 * seconds ago the staff queue came back empty and the approval loop below had nothing to approve.
 *
 * So decide on the fields the queue itself filters on rather than on the status. listPending() in
 * backend/src/professionals/professionals.service.ts wants a regulatory body, a licence number and
 * both documents, and a profile missing any one of them is invisible to staff.
 */
async function ensureProfessionalProfile({ email, regulatoryBody, licenseNumber }) {
  const login = await loginAs(email);
  if (!login.ok) {
    record(`credentials.profile.${email}`, "fail", `login HTTP ${login.status}`);
    return null;
  }

  const existing = await req("/professionals/me/profile");
  let profile = existing.json?.data ?? null;
  // Never write over a verified profile. Any edit resets the review state back to PENDING, so
  // doing so would un-verify the three professionals the workflow steps are assigned to.
  if (profile?.verifiedStatus === "VERIFIED") {
    record(`credentials.profile.${email}`, "pass", "already VERIFIED");
    return profile;
  }

  if (!profile?.regulatoryBody || !profile?.licenseNumber) {
    const { ok, json, status } = await req("/professionals/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        regulatoryBody,
        licenseNumber,
        licenseExpiry: "2030-12-31T00:00:00.000Z",
      }),
    });
    if (!ok) {
      record(`credentials.profile.${email}`, "fail", `licence details HTTP ${status}`);
      return null;
    }
    profile = json?.data ?? profile;
  }

  for (const { kind, field } of [
    { kind: "license", field: "licenseDocumentKey" },
    { kind: "id", field: "idDocumentKey" },
  ]) {
    if (profile?.[field]) continue;
    const form = new FormData();
    const body = `${kind} document for ${email}, written by the listing lifecycle run ${STAMP}.\n`;
    form.set("file", new Blob([body], { type: "text/plain" }), `${kind}-${STAMP}.txt`);
    const upload = await req(`/professionals/me/documents?kind=${kind}`, {
      method: "POST",
      body: form,
    });
    if (!upload.ok) {
      record(`credentials.profile.${email}`, "fail", `${kind} document HTTP ${upload.status}`);
      return null;
    }
    profile = upload.json?.data ?? profile;
  }

  record(`credentials.profile.${email}`, "pass", "submitted, awaiting staff approval");
  return profile;
}

async function prepareProfessionalCredentials() {
  for (const profile of DEMO_PROFESSIONAL_PROFILES) {
    await ensureProfessionalProfile(profile);
  }

  const staff = await loginAs("staff@safebuyrealties.test");
  if (!staff.ok) {
    record("credentials.staffLogin", "fail", "staff login");
    return;
  }

  const { ok, json, status } = await req("/professionals/credentials/pending");
  if (!ok) {
    record("credentials.listPending", "fail", `HTTP ${status}`);
    return;
  }

  const pending = json?.data ?? [];
  record("credentials.listPending", "pass", `${pending.length} pending profile(s)`);

  for (const row of pending) {
    const email = row.user?.email;
    if (!email || !DEMO_PRO_EMAILS.has(email)) continue;

    const verify = await req(`/professionals/${row.id}/verify`, {
      method: "PATCH",
      body: JSON.stringify({ approve: true }),
    });
    record(
      `credentials.verify.${email}`,
      verify.ok ? "pass" : "fail",
      verify.ok ? "VERIFIED" : verify.json?.error?.message ?? `HTTP ${verify.status}`,
    );
  }

  for (const email of DEMO_PRO_EMAILS) {
    const login = await loginAs(email);
    if (!login.ok) {
      record(`credentials.confirmed.${email}`, "fail", "login");
      continue;
    }
    const mine = await req("/professionals/me/profile");
    const status = mine.json?.data?.verifiedStatus;
    record(
      `credentials.confirmed.${email}`,
      status === "VERIFIED" ? "pass" : "fail",
      status ?? "no profile",
    );
  }
}

async function completeVerificationSteps(listingId) {
  const staff = await loginAs("staff@safebuyrealties.test");
  if (!staff.ok) {
    record("verification.completeSteps", "fail", "staff login");
    return false;
  }

  const proIds = {};
  for (const email of new Set(Object.values(STEP_PRO_MAP))) {
    proIds[email] = await getProfessionalId(email);
  }

  const { json } = await req(`/verification/listing/${listingId}`);
  const steps = json?.data ?? [];
  let checkedMidStatus = false;

  for (const step of steps) {
    if (step.type === "SUBMISSION") {
      if (step.status === "COMPLETED") {
        const accept = await req(`/verification/steps/${step.id}/accept`, { method: "PATCH" });
        record(
          `verification.accept.${step.type}`,
          accept.ok ? "pass" : "fail",
          accept.ok ? "ACCEPTED" : `HTTP ${accept.status}`,
        );
      }
      continue;
    }

    const proEmail = STEP_PRO_MAP[step.type];
    const proId = proIds[proEmail];
    if (proId) {
      const expectAssignPass = ASSIGNED_PRO_EMAILS.has(proEmail);
      const assign = await req("/verification/assign", {
        method: "POST",
        body: JSON.stringify({
          listingId,
          professionalId: proId,
          stepType: step.type,
        }),
      });
      const detail = assign.ok
        ? `assigned ${proEmail}`
        : assign.json?.error?.message ?? `HTTP ${assign.status}`;
      if (assign.ok) {
        record(`verification.assign.${step.type}`, "pass", detail);
        if (!checkedMidStatus) {
          const listing = await req(`/listings/${listingId}`);
          const status = listing.json?.data?.status;
          const advanced = WORKFLOW_ACTIVE_STATUSES.has(status);
          record(
            "workflow.autoSync.firstAction",
            advanced ? "pass" : "fail",
            status ?? `HTTP ${listing.status}`,
          );
          if (advanced) {
            await assertInternalVisibility(listingId, status);
          }
          checkedMidStatus = true;
        }
      } else if (!expectAssignPass) {
        record(`verification.assign.${step.type}`, "pass", `blocked as expected — ${detail}`);
      } else {
        record(`verification.assign.${step.type}`, "fail", detail);
      }
    }

    const patch = await req(`/verification/steps/${step.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "COMPLETED",
        notes: `E2E completed ${step.type} at ${STAMP}`,
      }),
    });
    if (!patch.ok) {
      record(`verification.complete.${step.type}`, "fail", `HTTP ${patch.status}`);
      continue;
    }

    const accept = await req(`/verification/steps/${step.id}/accept`, { method: "PATCH" });
    record(
      `verification.accept.${step.type}`,
      accept.ok ? "pass" : "fail",
      accept.ok ? "ACCEPTED" : `HTTP ${accept.status}`,
    );
  }

  return true;
}

async function assertWorkflowReachedLive(listingId) {
  const staff = await loginAs("staff@safebuyrealties.test");
  if (!staff.ok) {
    record("workflow.autoSync.live", "fail", "staff login");
    return;
  }

  const listing = await req(`/listings/${listingId}`);
  const status = listing.json?.data?.status;
  const verifiedAt = listing.json?.data?.verifiedAt;
  record(
    "workflow.autoSync.live",
    status === "LIVE" ? "pass" : "fail",
    status ?? `HTTP ${listing.status}`,
  );
  record(
    "workflow.autoSync.verifiedAt",
    verifiedAt ? "pass" : "fail",
    verifiedAt ?? "missing",
  );
}

async function main() {
  console.log(`\nListing lifecycle E2E: ${base}\n`);

  const sellerEmail = `lifecycle-seller-${STAMP}@safebuyrealties.test`;
  const reg = await registerSeller(sellerEmail);
  if (!reg.ok) {
    record("seller.register", "fail", sellerEmail);
    process.exit(1);
  }
  record("seller.register", "pass", sellerEmail);

  const create = await req("/listings", {
    method: "POST",
    body: JSON.stringify({
      title: `E2E Lifecycle Property ${STAMP}`,
      description: "Full verification lifecycle test listing with uploaded documents.",
      location: "Lekki, Lagos",
      price: 125000000,
      currency: "NGN",
      beds: 4,
      baths: 3,
      landAreaSqm: 500,
      buildType: "Detached",
      status: "DRAFT",
    }),
  });
  const listingId = create.json?.data?.id;
  if (!create.ok || !listingId) {
    record("seller.createListing", "fail", `HTTP ${create.status}`);
    process.exit(1);
  }
  record("seller.createListing", "pass", `id=${listingId} DRAFT`);

  const tmpPdf = join(tmpdir(), `sbr-e2e-${STAMP}.pdf`);
  writeFileSync(tmpPdf, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

  try {
    for (const [category, label] of [
      ["title_deed", "title.pdf"],
      ["survey_plan", "survey.pdf"],
    ]) {
      const up = await uploadDoc(listingId, category, tmpPdf, label);
      record(
        `seller.upload.${category}`,
        up.ok ? "pass" : "fail",
        up.ok ? up.json?.data?.fileName : `HTTP ${up.status}`,
      );
    }
  } finally {
    try {
      unlinkSync(tmpPdf);
    } catch {
      /* ignore */
    }
  }

  const submit = await req(`/listings/${listingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "PENDING_REVIEW" }),
  });
  record(
    "seller.submitReview",
    submit.ok && submit.json?.data?.status === "PENDING_REVIEW" ? "pass" : "fail",
    submit.json?.data?.status ?? `HTTP ${submit.status}`,
  );

  const stepsAfterSubmit = await req(`/verification/listing/${listingId}`);
  const stepCount = (stepsAfterSubmit.json?.data ?? []).length;
  record(
    "verification.template",
    stepsAfterSubmit.ok && stepCount === 8 ? "pass" : "partial",
    `${stepCount} step(s) after submit`,
  );

  await assertInternalVisibility(listingId, "PENDING_REVIEW");

  await prepareProfessionalCredentials();

  const workflowOk = await completeVerificationSteps(listingId);
  record("verification.completeSteps", workflowOk ? "pass" : "fail", "workflow steps processed");

  await assertWorkflowReachedLive(listingId);
  await assertInternalVisibility(listingId, "LIVE");

  clearSession();
  const guestList = await req("/listings?page=1&pageSize=100");
  const guestRows = guestList.json?.data ?? [];
  const isPublic = guestRows.some((l) => l.id === listingId && l.status === "LIVE");
  record(
    "guest.publicListing",
    isPublic ? "pass" : "fail",
    isPublic ? "LIVE on anonymous browse" : "not visible to guests",
  );

  const guestDetail = await req(`/listings/${listingId}`);
  record(
    "guest.listingDetail",
    guestDetail.ok ? "pass" : "fail",
    guestDetail.ok ? "public detail OK" : `HTTP ${guestDetail.status}`,
  );

  const fails = results.filter((r) => r.status === "fail").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const pass = results.filter((r) => r.status === "pass").length;
  console.log(`\n--- Summary: ${pass} pass, ${partial} partial, ${fails} fail ---`);
  console.log(`Listing ID: ${listingId}\n`);
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
