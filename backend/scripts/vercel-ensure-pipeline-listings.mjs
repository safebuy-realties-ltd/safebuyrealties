/**
 * Ensures staff workflow has demo listings in non-LIVE pipeline statuses.
 * Safe to run on every deploy (no-op when pipeline listings already exist).
 */
import { PrismaClient, ListingStatus, VerificationStepType, VerificationStepStatus } from "@prisma/client";

const url = process.env.DATABASE_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.warn("[vercel-pipeline] No DATABASE_URL; skipping.");
  process.exit(0);
}

process.env.DATABASE_URL = url;
if (!process.env.DATABASE_POSTGRES_URL) {
  process.env.DATABASE_POSTGRES_URL = url;
}

const PIPELINE = [
  ListingStatus.PENDING_REVIEW,
  ListingStatus.ASSIGNED,
  ListingStatus.IN_VERIFICATION,
];

const TEMPLATE = [
  VerificationStepType.SUBMISSION,
  VerificationStepType.DOCUMENT_REVIEW,
  VerificationStepType.FIELD_VERIFICATION,
  VerificationStepType.LEGAL,
  VerificationStepType.SURVEY,
  VerificationStepType.VALUATION,
  VerificationStepType.RISK_REVIEW,
  VerificationStepType.FINAL_APPROVAL,
];

const prisma = new PrismaClient();

try {
  const pipelineCount = await prisma.listing.count({
    where: { status: { in: PIPELINE } },
  });
  if (pipelineCount > 0) {
    console.log(`[vercel-pipeline] ${pipelineCount} pipeline listing(s) present; skipping.`);
    process.exit(0);
  }

  const seller = await prisma.user.findFirst({
    where: { email: "seller@safebuyrealties.test" },
  });
  if (!seller) {
    console.warn("[vercel-pipeline] Demo seller missing; run seed first.");
    process.exit(0);
  }

  const listing = await prisma.listing.create({
    data: {
      title: "Pipeline Demo — Pending Review",
      sellerId: seller.id,
      status: ListingStatus.PENDING_REVIEW,
      price: 95000000,
      currency: "NGN",
      location: "Lekki Phase 1, Lagos",
      description: "Auto-created on deploy so staff workflow has a listing to review.",
    },
  });

  await prisma.verificationStep.createMany({
    data: TEMPLATE.map((type, order) => ({
      listingId: listing.id,
      type,
      order,
      status:
        order === 0 ? VerificationStepStatus.COMPLETED : VerificationStepStatus.PENDING,
      completedAt: order === 0 ? new Date() : null,
    })),
  });

  console.log(`[vercel-pipeline] Created PENDING_REVIEW listing ${listing.id}`);
} finally {
  await prisma.$disconnect();
}
