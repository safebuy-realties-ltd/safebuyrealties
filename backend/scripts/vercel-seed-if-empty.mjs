/**
 * Seed demo users when the database has no rows (first deploy / empty DB).
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.warn("[vercel-seed] No database URL; skipping seed.");
  process.exit(0);
}

process.env.DATABASE_URL = url;
if (!process.env.DATABASE_POSTGRES_URL) {
  process.env.DATABASE_POSTGRES_URL = url;
}

const DEMO_EMAIL = "buyer@safebuyrealties.test";
const prisma = new PrismaClient();
try {
  const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (demo) {
    console.log(`[vercel-seed] Demo user ${DEMO_EMAIL} exists; skipping seed.`);
    process.exit(0);
  }
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`[vercel-seed] ${count} user(s) present but demo data missing — seeding without wipe.`);
    process.env.SEED_NO_WIPE = "1";
  } else {
    console.log("[vercel-seed] Empty database — running full seed.");
  }
  execSync("npx prisma db seed", { stdio: "inherit", env: process.env });
} finally {
  await prisma.$disconnect();
}
