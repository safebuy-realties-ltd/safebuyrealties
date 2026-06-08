/**
 * Idempotently seed marketplace listings across the full property lifecycle.
 * Safe on shared cloud DB — skips titles that already exist.
 *
 * Usage:
 *   node backend/scripts/seed-marketplace-listings.mjs
 *   SBR_API_BASE=https://safebuyrealties-app.vercel.app/api/v1 node backend/scripts/seed-marketplace-listings.mjs
 *
 * Requires DATABASE_URL (Prisma) OR runs via API with staff session.
 */
import { PrismaClient, ListingStatus, UserRole, VerificationStepType, VerificationStepStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const PASSWORD = process.env.SBR_DEMO_PASSWORD?.trim() || "password123";
const API_BASE = (process.env.SBR_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const STAFF_EMAIL = process.env.SBR_STAFF_EMAIL ?? "staff@safebuyrealties.test";
const STAFF_PASSWORD = process.env.SBR_STAFF_PASSWORD ?? PASSWORD;
const TITLE_PREFIX = "Market · ";

const VERIFICATION_TEMPLATE = [
  VerificationStepType.SUBMISSION,
  VerificationStepType.DOCUMENT_REVIEW,
  VerificationStepType.FIELD_VERIFICATION,
  VerificationStepType.LEGAL,
  VerificationStepType.SURVEY,
  VerificationStepType.VALUATION,
  VerificationStepType.RISK_REVIEW,
  VerificationStepType.FINAL_APPROVAL,
];

/** @type {Array<{title:string,status:ListingStatus,price:string,location:string,description:string,seller:'company'|'seller'|'seller2',beds?:number,baths?:number,landAreaSqm?:string,buildType?:string}>} */
const CATALOG = [
  // LIVE — public homepage / browse (company = SafeBuy direct listings)
  { title: `${TITLE_PREFIX}Oceanview Penthouse`, status: ListingStatus.LIVE, price: "285000000", location: "Victoria Island, Lagos", description: "Company-listed flagship penthouse with panoramic Atlantic views. Title verified.", seller: "company", beds: 4, baths: 4, landAreaSqm: "380", buildType: "Penthouse" },
  { title: `${TITLE_PREFIX}Asokoro Diplomatic Villa`, status: ListingStatus.LIVE, price: "420000000", location: "Asokoro, Abuja", description: "SafeBuy Realties direct listing — embassy district villa with full verification.", seller: "company", beds: 6, baths: 5, landAreaSqm: "650", buildType: "Villa" },
  { title: `${TITLE_PREFIX}Banana Island Estate`, status: ListingStatus.LIVE, price: "950000000", location: "Banana Island, Lagos", description: "Ultra-premium waterfront estate listed by SafeBuy Realties.", seller: "company", beds: 7, baths: 6, landAreaSqm: "820", buildType: "Mansion" },
  { title: `${TITLE_PREFIX}Guzape Terrace`, status: ListingStatus.LIVE, price: "175000000", location: "Guzape, Abuja", description: "Modern terrace home in a secure Abuja enclave.", seller: "company", beds: 4, baths: 3, landAreaSqm: "290", buildType: "Terrace" },
  { title: `${TITLE_PREFIX}Chevron Drive Duplex`, status: ListingStatus.LIVE, price: "198000000", location: "Lekki, Lagos", description: "Spacious duplex with BQ — seller-submitted, staff verified.", seller: "seller", beds: 5, baths: 4, landAreaSqm: "340", buildType: "Duplex" },
  { title: `${TITLE_PREFIX}GRA Port Harcourt Bungalow`, status: ListingStatus.LIVE, price: "92000000", location: "GRA, Port Harcourt", description: "Quiet GRA bungalow with mature garden.", seller: "seller2", beds: 3, baths: 3, landAreaSqm: "450", buildType: "Bungalow" },
  { title: `${TITLE_PREFIX}Maitama Classic Apartment`, status: ListingStatus.LIVE, price: "115000000", location: "Maitama, Abuja", description: "Serviced apartment block with 24hr security.", seller: "seller", beds: 3, baths: 2, landAreaSqm: "165", buildType: "Apartment" },
  { title: `${TITLE_PREFIX}Ikeja GRA Semi-Detached`, status: ListingStatus.LIVE, price: "138000000", location: "Ikeja GRA, Lagos", description: "Family semi-detached close to business district.", seller: "seller2", beds: 4, baths: 3, landAreaSqm: "310", buildType: "Semi-detached" },
  { title: `${TITLE_PREFIX}Wuse II Office-Townhouse`, status: ListingStatus.LIVE, price: "210000000", location: "Wuse II, Abuja", description: "Mixed-use townhouse suitable for live-work.", seller: "company", beds: 4, baths: 3, landAreaSqm: "280", buildType: "Townhouse" },
  { title: `${TITLE_PREFIX}Magodo Phase 2 Home`, status: ListingStatus.LIVE, price: "165000000", location: "Magodo, Lagos", description: "Gated estate family home with pool.", seller: "seller", beds: 5, baths: 4, landAreaSqm: "400", buildType: "Detached" },
  { title: `${TITLE_PREFIX}Trans Amadi Commercial Plot`, status: ListingStatus.LIVE, price: "78000000", location: "Trans Amadi, Port Harcourt", description: "Verified commercial-residential plot with C of O.", seller: "seller2", beds: 0, baths: 0, landAreaSqm: "1200", buildType: "Land" },
  { title: `${TITLE_PREFIX}Bodija Estate Duplex`, status: ListingStatus.LIVE, price: "68000000", location: "Bodija, Ibadan", description: "Affordable verified duplex in Ibadan.", seller: "seller", beds: 3, baths: 2, landAreaSqm: "220", buildType: "Duplex" },
  { title: `${TITLE_PREFIX}Eko Atlantic Tower Suite`, status: ListingStatus.LIVE, price: "320000000", location: "Eko Atlantic, Lagos", description: "Company-listed luxury tower apartment.", seller: "company", beds: 3, baths: 3, landAreaSqm: "195", buildType: "Apartment" },
  { title: `${TITLE_PREFIX}Jabi Lake View Flat`, status: ListingStatus.LIVE, price: "89000000", location: "Jabi, Abuja", description: "Lake-facing flat with verified leasehold.", seller: "seller2", beds: 2, baths: 2, landAreaSqm: "110", buildType: "Apartment" },
  // Pipeline stages
  { title: `${TITLE_PREFIX}Draft Plot Ajah`, status: ListingStatus.DRAFT, price: "35000000", location: "Ajah, Lagos", description: "Seller draft — not yet submitted.", seller: "seller" },
  { title: `${TITLE_PREFIX}Draft Flat Surulere`, status: ListingStatus.DRAFT, price: "42000000", location: "Surulere, Lagos", description: "Company draft inventory.", seller: "company" },
  { title: `${TITLE_PREFIX}Pending Review Enugu Duplex`, status: ListingStatus.PENDING_REVIEW, price: "75000000", location: "Enugu", description: "Awaiting staff intake review.", seller: "seller2" },
  { title: `${TITLE_PREFIX}Pending Review Kano Villa`, status: ListingStatus.PENDING_REVIEW, price: "110000000", location: "Kano", description: "Company submission pending review.", seller: "company" },
  { title: `${TITLE_PREFIX}Assigned Calabar Home`, status: ListingStatus.ASSIGNED, price: "95000000", location: "Calabar", description: "Staff assigned — verification queued.", seller: "seller" },
  { title: `${TITLE_PREFIX}Assigned Uyo Estate`, status: ListingStatus.ASSIGNED, price: "88000000", location: "Uyo", description: "Assigned to verification team.", seller: "seller2" },
  { title: `${TITLE_PREFIX}In Verification Abeokuta`, status: ListingStatus.IN_VERIFICATION, price: "52000000", location: "Abeokuta", description: "Field and legal checks in progress.", seller: "seller" },
  { title: `${TITLE_PREFIX}In Verification Kaduna`, status: ListingStatus.IN_VERIFICATION, price: "67000000", location: "Kaduna", description: "Survey and title review ongoing.", seller: "company" },
  { title: `${TITLE_PREFIX}Verified Jos Bungalow`, status: ListingStatus.VERIFIED, price: "58000000", location: "Jos", description: "Verified — ready for staff to publish.", seller: "seller2" },
  { title: `${TITLE_PREFIX}Verified Onitsha Plaza`, status: ListingStatus.VERIFIED, price: "145000000", location: "Onitsha", description: "Company listing cleared for go-live.", seller: "company" },
  // Late lifecycle
  { title: `${TITLE_PREFIX}Under Offer Yaba Flat`, status: ListingStatus.UNDER_OFFER, price: "72000000", location: "Yaba, Lagos", description: "Buyer DD in progress — reserved.", seller: "seller", beds: 2, baths: 2, landAreaSqm: "95", buildType: "Apartment" },
  { title: `${TITLE_PREFIX}Under Offer GRA Benin`, status: ListingStatus.UNDER_OFFER, price: "105000000", location: "GRA, Benin City", description: "Reserved pending due diligence completion.", seller: "seller2", beds: 4, baths: 3, landAreaSqm: "350", buildType: "Bungalow" },
  { title: `${TITLE_PREFIX}Sold Lekki Phase 1`, status: ListingStatus.SOLD, price: "240000000", location: "Lekki Phase 1, Lagos", description: "Completed transaction — reference deal.", seller: "company", beds: 5, baths: 4, landAreaSqm: "420", buildType: "Detached" },
  { title: `${TITLE_PREFIX}Sold Maitama Duplex`, status: ListingStatus.SOLD, price: "380000000", location: "Maitama, Abuja", description: "Successfully closed via SafeBuy escrow.", seller: "seller", beds: 5, baths: 5, landAreaSqm: "500", buildType: "Duplex" },
  { title: `${TITLE_PREFIX}Rejected Incomplete Docs`, status: ListingStatus.REJECTED, price: "48000000", location: "Oshodi, Lagos", description: "Rejected: missing survey plan.", seller: "seller2" },
  { title: `${TITLE_PREFIX}Archived Withdrawn Listing`, status: ListingStatus.ARCHIVED, price: "39000000", location: "Agege, Lagos", description: "Seller withdrew from marketplace.", seller: "seller" },
];

function cookieJar() {
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
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
      this.storeFrom(res);
      return res;
    },
  };
}

async function seedViaPrisma() {
  const url = process.env.DATABASE_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) return false;

  process.env.DATABASE_URL = url;
  if (!process.env.DATABASE_POSTGRES_URL) process.env.DATABASE_POSTGRES_URL = url;

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    async function ensureSeller(email, firstName, lastName) {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email, passwordHash, firstName, lastName, role: UserRole.SELLER, phone: "+2348000000001" },
        });
        console.log(`[marketplace-seed] Created seller ${email}`);
      }
      return user;
    }

    const company = await ensureSeller("company@safebuyrealties.test", "SafeBuy", "Realties");
    const seller = await prisma.user.findUnique({ where: { email: "seller@safebuyrealties.test" } });
    const seller2 = await prisma.user.findUnique({ where: { email: "seller2@safebuyrealties.test" } });
    if (!seller || !seller2) {
      console.warn("[marketplace-seed] Base sellers missing — run prisma db seed first.");
      return false;
    }

    const sellerMap = { company: company.id, seller: seller.id, seller2: seller2.id };
    let created = 0;
    let skipped = 0;

    for (const item of CATALOG) {
      const exists = await prisma.listing.findFirst({ where: { title: item.title } });
      if (exists) {
        skipped++;
        continue;
      }

      const listing = await prisma.listing.create({
        data: {
          title: item.title,
          sellerId: sellerMap[item.seller],
          status: item.status,
          price: item.price,
          currency: "NGN",
          location: item.location,
          description: item.description,
          beds: item.beds ?? null,
          baths: item.baths ?? null,
          landAreaSqm: item.landAreaSqm != null ? item.landAreaSqm : null,
          buildType: item.buildType ?? null,
          verifiedAt:
            item.status === ListingStatus.LIVE ||
            item.status === ListingStatus.VERIFIED ||
            item.status === ListingStatus.UNDER_OFFER ||
            item.status === ListingStatus.SOLD
              ? new Date()
              : null,
        },
      });

      const needsSteps = [
        ListingStatus.PENDING_REVIEW,
        ListingStatus.ASSIGNED,
        ListingStatus.IN_VERIFICATION,
        ListingStatus.VERIFIED,
        ListingStatus.LIVE,
        ListingStatus.UNDER_OFFER,
      ].includes(item.status);

      if (needsSteps) {
        await prisma.verificationStep.createMany({
          data: VERIFICATION_TEMPLATE.map((type, order) => ({
            listingId: listing.id,
            type,
            order,
            status:
              order === 0
                ? VerificationStepStatus.COMPLETED
                : item.status === ListingStatus.LIVE || item.status === ListingStatus.UNDER_OFFER
                  ? VerificationStepStatus.COMPLETED
                  : VerificationStepStatus.PENDING,
            completedAt:
              order === 0 || item.status === ListingStatus.LIVE || item.status === ListingStatus.UNDER_OFFER
                ? new Date()
                : null,
          })),
        });
      }

      created++;
      console.log(`[marketplace-seed] + ${item.status} ${item.title}`);
    }

    const liveCount = await prisma.listing.count({ where: { status: ListingStatus.LIVE } });
    const total = await prisma.listing.count();
    console.log(`[marketplace-seed] Done: ${created} created, ${skipped} skipped | LIVE=${liveCount} total=${total}`);
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedViaApi() {
  const session = cookieJar();
  const loginRes = await session.fetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error("[marketplace-seed] Staff login failed");
    return false;
  }

  const usersRes = await session.fetch("/users?pageSize=100");
  const usersBody = await usersRes.json();
  const users = usersBody.data ?? [];

  let company = users.find((u) => u.email === "company@safebuyrealties.test");
  const seller = users.find((u) => u.email === "seller@safebuyrealties.test");
  const seller2 = users.find((u) => u.email === "seller2@safebuyrealties.test");

  if (!company) {
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "company@safebuyrealties.test",
        password: PASSWORD,
        firstName: "SafeBuy",
        lastName: "Realties",
        role: "SELLER",
      }),
    });
    if (regRes.ok) {
      const regBody = await regRes.json();
      company = regBody.data?.user ?? regBody.data;
      console.log("[marketplace-seed] Registered company seller");
    }
  }

  if (!seller || !seller2) {
    console.error("[marketplace-seed] Base sellers missing on API");
    return false;
  }

  const sellerMap = {
    company: company?.id,
    seller: seller.id,
    seller2: seller2.id,
  };

  const listRes = await session.fetch("/listings?pageSize=100");
  const listBody = await listRes.json();
  const existingTitles = new Set((listBody.data ?? []).map((l) => l.title));

  let created = 0;
  for (const item of CATALOG) {
    if (existingTitles.has(item.title)) continue;
    const sellerId = sellerMap[item.seller];
    if (!sellerId) continue;

    const createRes = await session.fetch("/listings", {
      method: "POST",
      body: JSON.stringify({
        sellerId,
        title: item.title,
        description: item.description,
        location: item.location,
        price: Number(item.price),
        currency: "NGN",
        beds: item.beds,
        baths: item.baths,
        landAreaSqm: item.landAreaSqm ? Number(item.landAreaSqm) : undefined,
        buildType: item.buildType,
        status: "PENDING_REVIEW",
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json();
      console.warn(`[marketplace-seed] skip ${item.title}:`, err.error?.message ?? createRes.status);
      continue;
    }
    const createdBody = await createRes.json();
    const listingId = createdBody.data?.id ?? createdBody.id;

    if (item.status !== ListingStatus.PENDING_REVIEW) {
      const patchRes = await session.fetch(`/listings/${listingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: item.status }),
      });
      if (!patchRes.ok) {
        console.warn(`[marketplace-seed] status patch failed for ${item.title}`);
      }
    }

    created++;
    console.log(`[marketplace-seed] + ${item.status} ${item.title}`);
  }

  const pubRes = await fetch(`${API_BASE}/listings?pageSize=5`);
  const pubBody = await pubRes.json();
  console.log(`[marketplace-seed] API done: ${created} created | public LIVE count sample: ${pubBody.meta?.total ?? pubBody.data?.length}`);
  return true;
}

async function main() {
  console.log(`[marketplace-seed] Target: ${API_BASE}`);
  const viaPrisma = await seedViaPrisma();
  if (!viaPrisma) {
    console.log("[marketplace-seed] No DATABASE_URL — using API");
    await seedViaApi();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
