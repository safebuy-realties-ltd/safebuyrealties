import {
  PrismaClient,
  UserRole,
  ProfessionalType,
  ListingStatus,
  VerificationStepType,
  VerificationStepStatus,
  TaskStatus,
  TransactionStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

/** Matches backend listings.service verification template order. */
const VERIFICATION_TEMPLATE: { type: VerificationStepType; order: number }[] = [
  { type: VerificationStepType.SUBMISSION, order: 0 },
  { type: VerificationStepType.DOCUMENT_REVIEW, order: 1 },
  { type: VerificationStepType.FIELD_VERIFICATION, order: 2 },
  { type: VerificationStepType.LEGAL, order: 3 },
  { type: VerificationStepType.SURVEY, order: 4 },
  { type: VerificationStepType.VALUATION, order: 5 },
  { type: VerificationStepType.RISK_REVIEW, order: 6 },
  { type: VerificationStepType.FINAL_APPROVAL, order: 7 },
];

async function wipe() {
  await prisma.payment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.task.deleteMany();
  await prisma.verificationStep.deleteMany();
  await prisma.document.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.professionalProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function ensureLiveListingSpecs() {
  const specs: Record<string, { beds: number; baths: number; landAreaSqm: string }> = {
    "LIVE Acacia Hills Estate": { beds: 4, baths: 3, landAreaSqm: "320" },
    "LIVE Riverside Townhouse": { beds: 3, baths: 2, landAreaSqm: "210" },
    "LIVE Garden Court Residence": { beds: 5, baths: 4, landAreaSqm: "480" },
    "LIVE Maple Heights Apartment": { beds: 2, baths: 2, landAreaSqm: "120" },
    "LIVE Cedar Park Villa": { beds: 6, baths: 5, landAreaSqm: "520" },
  };
  for (const [title, spec] of Object.entries(specs)) {
    await prisma.listing.updateMany({
      where: { title, status: ListingStatus.LIVE, beds: null },
      data: {
        beds: spec.beds,
        baths: spec.baths,
        landAreaSqm: new Prisma.Decimal(spec.landAreaSqm),
      },
    });
  }
}

async function ensureVerifiedProfessionalProfiles(staffId: string) {
  const profiles = [
    { email: "lawyer@safebuyrealties.test", regulatoryBody: "NBA", licenseNumber: "NBA/TEST/001" },
    {
      email: "surveyor@safebuyrealties.test",
      regulatoryBody: "SURCON",
      licenseNumber: "SURCON/TEST/001",
    },
  ] as const;

  for (const profile of profiles) {
    const user = await prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) continue;
    await prisma.professionalProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        regulatoryBody: profile.regulatoryBody,
        licenseNumber: profile.licenseNumber,
        verifiedStatus: "VERIFIED",
        verifiedById: staffId,
        verifiedAt: new Date(),
      },
      update: {
        verifiedStatus: "VERIFIED",
        verifiedById: staffId,
        verifiedAt: new Date(),
        rejectionNote: null,
      },
    });
  }
}

async function upsertUser(args: {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  professionalType?: ProfessionalType | null;
  passwordHash: string;
}) {
  return prisma.user.create({
    data: {
      email: args.email,
      passwordHash: args.passwordHash,
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      professionalType: args.professionalType ?? null,
      phone: "+2348000000000",
    },
  });
}

async function createVerificationSteps(
  listingId: string,
  opts?: {
    documentReviewComplete?: boolean;
    assignLegalTo?: string | null;
    assignSurveyTo?: string | null;
  },
) {
  const assignLegalTo = opts?.assignLegalTo ?? null;
  const assignSurveyTo = opts?.assignSurveyTo ?? null;
  const docDone = opts?.documentReviewComplete ?? false;

  await prisma.verificationStep.createMany({
    data: VERIFICATION_TEMPLATE.map((t) => {
      let status: VerificationStepStatus = VerificationStepStatus.PENDING;
      let completedAt: Date | null = null;
      let assigned: string | null = null;

      if (t.type === VerificationStepType.SUBMISSION) {
        status = VerificationStepStatus.COMPLETED;
        completedAt = new Date();
      } else if (t.type === VerificationStepType.DOCUMENT_REVIEW && docDone) {
        status = VerificationStepStatus.COMPLETED;
        completedAt = new Date();
      } else if (t.type === VerificationStepType.LEGAL && assignLegalTo) {
        status = VerificationStepStatus.IN_PROGRESS;
        assigned = assignLegalTo;
      } else if (t.type === VerificationStepType.SURVEY && assignSurveyTo) {
        status = VerificationStepStatus.IN_PROGRESS;
        assigned = assignSurveyTo;
      }

      return {
        listingId,
        type: t.type,
        order: t.order,
        status,
        completedAt,
        assignedProfessionalId: assigned,
      };
    }),
  });
}

async function main() {
  if (process.env.SEED_NO_WIPE !== "1") {
    await wipe();
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await upsertUser({
    email: "admin@safebuyrealties.test",
    firstName: "Ada",
    lastName: "Admin",
    role: UserRole.ADMIN,
    passwordHash,
  });
  const staff = await upsertUser({
    email: "staff@safebuyrealties.test",
    firstName: "Sam",
    lastName: "Staff",
    role: UserRole.STAFF,
    passwordHash,
  });
  const seller = await upsertUser({
    email: "seller@safebuyrealties.test",
    firstName: "Sara",
    lastName: "Seller",
    role: UserRole.SELLER,
    passwordHash,
  });
  const seller2 = await upsertUser({
    email: "seller2@safebuyrealties.test",
    firstName: "Kemi",
    lastName: "Okafor",
    role: UserRole.SELLER,
    passwordHash,
  });
  const buyer = await upsertUser({
    email: "buyer@safebuyrealties.test",
    firstName: "Ben",
    lastName: "Buyer",
    role: UserRole.BUYER,
    passwordHash,
  });
  const buyer2 = await upsertUser({
    email: "buyer2@safebuyrealties.test",
    firstName: "Zain",
    lastName: "Musa",
    role: UserRole.BUYER,
    passwordHash,
  });
  const lawyer = await upsertUser({
    email: "lawyer@safebuyrealties.test",
    firstName: "Lee",
    lastName: "Lawyer",
    role: UserRole.PROFESSIONAL,
    professionalType: ProfessionalType.LAWYER,
    passwordHash,
  });
  const surveyor = await upsertUser({
    email: "surveyor@safebuyrealties.test",
    firstName: "Tobi",
    lastName: "Survey",
    role: UserRole.PROFESSIONAL,
    professionalType: ProfessionalType.SURVEYOR,
    passwordHash,
  });
  const valuer = await upsertUser({
    email: "valuer@safebuyrealties.test",
    firstName: "Femi",
    lastName: "Valuer",
    role: UserRole.PROFESSIONAL,
    professionalType: ProfessionalType.VALUER,
    passwordHash,
  });

  await prisma.professionalProfile.createMany({
    data: [
      {
        userId: lawyer.id,
        regulatoryBody: "NBA",
        licenseNumber: "NBA/TEST/001",
        verifiedStatus: "VERIFIED",
        verifiedById: staff.id,
        verifiedAt: new Date(),
      },
      {
        userId: surveyor.id,
        regulatoryBody: "SURCON",
        licenseNumber: "SURCON/TEST/001",
        verifiedStatus: "VERIFIED",
        verifiedById: staff.id,
        verifiedAt: new Date(),
      },
    ],
  });

  const mk = (
    title: string,
    sellerId: string,
    status: ListingStatus,
    price: string,
    location: string,
    desc: string,
    specs?: { beds?: number; baths?: number; landAreaSqm?: string },
  ) => ({
    title,
    sellerId,
    status,
    price: new Prisma.Decimal(price),
    currency: "NGN",
    location,
    description: desc,
    beds: specs?.beds ?? null,
    baths: specs?.baths ?? null,
    landAreaSqm: specs?.landAreaSqm != null ? new Prisma.Decimal(specs.landAreaSqm) : null,
  });

  const listingsData = [
    mk(
      "Draft Bungalow Ikoyi",
      seller.id,
      ListingStatus.DRAFT,
      "45000000",
      "Ikoyi, Lagos",
      "Draft only — not submitted.",
    ),
    mk(
      "Draft Plot Enugu",
      seller.id,
      ListingStatus.DRAFT,
      "12000000",
      "Enugu",
      "Land parcel draft.",
    ),
    mk(
      "Penthouse Pending Review",
      seller2.id,
      ListingStatus.PENDING_REVIEW,
      "320000000",
      "Victoria Island, Lagos",
      "Luxury penthouse awaiting staff review.",
    ),
    mk(
      "Duplex Pending Review",
      seller.id,
      ListingStatus.PENDING_REVIEW,
      "185000000",
      "Lekki Phase 1",
      "Family duplex with BQ.",
    ),
    mk(
      "Terrace ASSIGNED Pipeline",
      seller2.id,
      ListingStatus.ASSIGNED,
      "98000000",
      "Ajah, Lagos",
      "Staff assigned — verification ongoing.",
    ),
    mk(
      "Bungalow IN_VERIFICATION",
      seller.id,
      ListingStatus.IN_VERIFICATION,
      "72000000",
      "Ibadan",
      "Field checks in progress.",
    ),
    mk(
      "Townhouse IN_VERIFICATION",
      seller2.id,
      ListingStatus.IN_VERIFICATION,
      "142000000",
      "Abuja",
      "Legal and survey parallel.",
    ),
    mk(
      "Estate Block VERIFIED",
      seller.id,
      ListingStatus.VERIFIED,
      "265000000",
      "Lekki",
      "Verified — ready to go live.",
    ),
    mk(
      "Apartment VERIFIED",
      seller2.id,
      ListingStatus.VERIFIED,
      "55000000",
      "Port Harcourt",
      "Verified apartment.",
    ),
    mk(
      "LIVE Acacia Hills Estate",
      seller.id,
      ListingStatus.LIVE,
      "125000000",
      "Lagos",
      "Seed flagship LIVE property for buyers.",
      { beds: 4, baths: 3, landAreaSqm: "320" },
    ),
    mk(
      "LIVE Riverside Townhouse",
      seller2.id,
      ListingStatus.LIVE,
      "98000000",
      "Port Harcourt",
      "Waterfront townhouse.",
      { beds: 3, baths: 2, landAreaSqm: "210" },
    ),
    mk(
      "LIVE Garden Court Residence",
      seller.id,
      ListingStatus.LIVE,
      "210000000",
      "Lekki",
      "Gated community family home.",
      { beds: 5, baths: 4, landAreaSqm: "480" },
    ),
    mk(
      "LIVE Maple Heights Apartment",
      seller2.id,
      ListingStatus.LIVE,
      "67000000",
      "Abuja",
      "High-rise apartment.",
      { beds: 2, baths: 2, landAreaSqm: "120" },
    ),
    mk(
      "LIVE Cedar Park Villa",
      seller.id,
      ListingStatus.LIVE,
      "310000000",
      "Ikoyi",
      "Premium villa with pool.",
      { beds: 6, baths: 5, landAreaSqm: "520" },
    ),
    mk(
      "LIVE Sunset Bay Condo",
      seller2.id,
      ListingStatus.LIVE,
      "88000000",
      "Victoria Island",
      "Modern condo near business district.",
    ),
    mk(
      "LIVE Palm Grove Duplex",
      seller.id,
      ListingStatus.LIVE,
      "155000000",
      "Ajah",
      "Corner duplex with parking.",
    ),
    mk(
      "REJECTED Incomplete Title",
      seller2.id,
      ListingStatus.REJECTED,
      "40000000",
      "Oshodi",
      "Rejected: documentation issues.",
    ),
    mk(
      "ARCHIVED Old Listing",
      seller.id,
      ListingStatus.ARCHIVED,
      "33000000",
      "Surulere",
      "Archived seller withdrawal.",
    ),
  ];

  const listings = await prisma.$transaction(
    listingsData.map((d) =>
      prisma.listing.create({
        data: {
          ...d,
          verifiedAt:
            d.status === ListingStatus.VERIFIED || d.status === ListingStatus.LIVE
              ? new Date()
              : null,
        },
      }),
    ),
  );

  const byTitle = (t: string) => listings.find((l) => l.title === t)!;

  const needStepsStatuses: ListingStatus[] = [
    ListingStatus.PENDING_REVIEW,
    ListingStatus.ASSIGNED,
    ListingStatus.IN_VERIFICATION,
    ListingStatus.VERIFIED,
    ListingStatus.LIVE,
  ];
  const needSteps = listings.filter((l) => needStepsStatuses.includes(l.status));

  for (const l of needSteps) {
    const isPenthouse = l.title.includes("Penthouse");
    const isTerrace = l.title.includes("ASSIGNED");
    const isBungalow = l.title.includes("Bungalow IN_VER");
    const isTown = l.title.includes("Townhouse IN_VER");
    await createVerificationSteps(l.id, {
      documentReviewComplete: l.status !== ListingStatus.PENDING_REVIEW || isPenthouse,
      assignLegalTo: isTerrace || isTown ? lawyer.id : isBungalow ? lawyer.id : null,
      assignSurveyTo: isTown ? surveyor.id : null,
    });
  }

  const docFor = async (
    listingId: string,
    uploadedById: string,
    category: string,
    name: string,
  ) => {
    await prisma.document.create({
      data: {
        listingId,
        uploadedById,
        category,
        fileName: name,
        mimeType: "application/pdf",
        sizeBytes: 524288,
        storageKey: `seed/${listingId}/${category}_${Date.now()}.pdf`,
      },
    });
  };

  await docFor(
    byTitle("Penthouse Pending Review").id,
    seller2.id,
    "title_deed",
    "coa_penthouse.pdf",
  );
  await docFor(
    byTitle("Penthouse Pending Review").id,
    seller2.id,
    "survey_plan",
    "survey_penthouse.pdf",
  );
  await docFor(
    byTitle("Bungalow IN_VERIFICATION").id,
    seller.id,
    "title_deed",
    "title_bungalow.pdf",
  );
  await docFor(byTitle("LIVE Acacia Hills Estate").id, seller.id, "title_deed", "acacia_title.pdf");
  await docFor(
    byTitle("LIVE Acacia Hills Estate").id,
    seller.id,
    "survey_plan",
    "acacia_survey.pdf",
  );

  await prisma.task.createMany({
    data: [
      {
        listingId: byTitle("Bungalow IN_VERIFICATION").id,
        assigneeId: lawyer.id,
        createdById: staff.id,
        title: "Title encumbrance review",
        type: "LEGAL",
        description: "Review chain of title for bungalow.",
        status: TaskStatus.IN_PROGRESS,
        dueAt: new Date(Date.now() + 5 * 864e5),
      },
      {
        listingId: byTitle("Townhouse IN_VERIFICATION").id,
        assigneeId: surveyor.id,
        createdById: staff.id,
        title: "Boundary survey",
        type: "SURVEY",
        status: TaskStatus.PENDING,
        dueAt: new Date(Date.now() + 7 * 864e5),
      },
      {
        listingId: byTitle("LIVE Garden Court Residence").id,
        assigneeId: valuer.id,
        createdById: staff.id,
        title: "Market valuation",
        type: "VALUATION",
        status: TaskStatus.PENDING,
        dueAt: new Date(Date.now() + 3 * 864e5),
      },
      {
        listingId: byTitle("LIVE Maple Heights Apartment").id,
        assigneeId: lawyer.id,
        createdById: staff.id,
        title: "Leasehold review",
        type: "LEGAL",
        status: TaskStatus.COMPLETED,
        dueAt: new Date(Date.now() - 864e5),
      },
    ],
  });

  const liveAcacia = byTitle("LIVE Acacia Hills Estate");
  const liveGarden = byTitle("LIVE Garden Court Residence");
  const liveMaple = byTitle("LIVE Maple Heights Apartment");

  const txInit = await prisma.transaction.create({
    data: {
      listingId: liveAcacia.id,
      buyerId: buyer.id,
      status: TransactionStatus.INITIATED,
    },
  });
  const txProgress = await prisma.transaction.create({
    data: {
      listingId: liveGarden.id,
      buyerId: buyer.id,
      status: TransactionStatus.IN_PROGRESS,
    },
  });
  const txDone = await prisma.transaction.create({
    data: {
      listingId: liveMaple.id,
      buyerId: buyer2.id,
      status: TransactionStatus.COMPLETED,
    },
  });

  await prisma.payment.create({
    data: {
      listingId: liveGarden.id,
      transactionId: txProgress.id,
      payerId: buyer.id,
      amount: new Prisma.Decimal("500000"),
      currency: "NGN",
      provider: "paystack",
      providerReference: `seed_ref_${txProgress.id}`,
      status: PaymentStatus.PROCESSING,
      metadata: {},
    },
  });

  await prisma.payment.create({
    data: {
      listingId: liveMaple.id,
      transactionId: txDone.id,
      payerId: buyer2.id,
      amount: new Prisma.Decimal("1000000"),
      currency: "NGN",
      provider: "paystack",
      providerReference: `seed_ref_done_${txDone.id}`,
      status: PaymentStatus.SUCCEEDED,
      metadata: {},
    },
  });

  await prisma.payment.create({
    data: {
      listingId: liveAcacia.id,
      payerId: buyer.id,
      amount: new Prisma.Decimal("250000"),
      currency: "NGN",
      status: PaymentStatus.SUCCEEDED,
      providerReference: `seed_listing_only_${liveAcacia.id}`,
      metadata: {},
    },
  });

  await ensureVerifiedProfessionalProfiles(staff.id);
  await ensureLiveListingSpecs();

  console.log("Seed OK — demo database reset.");
  console.log("Login (all roles): password123");
  console.table([
    { role: "ADMIN", email: admin.email },
    { role: "STAFF", email: staff.email },
    { role: "SELLER", email: seller.email },
    { role: "SELLER", email: seller2.email },
    { role: "BUYER", email: buyer.email },
    { role: "BUYER", email: buyer2.email },
    { role: "PRO (lawyer)", email: lawyer.email },
    { role: "PRO (surveyor)", email: surveyor.email },
    { role: "PRO (valuer)", email: valuer.email },
  ]);
  console.log(
    `Listings: ${listings.length} | Transactions sample: initiated=${txInit.id.slice(0, 8)}…`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
