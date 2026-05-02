import { PrismaClient, UserRole, ProfessionalType } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Dev seed: always refresh password so re-run fixes stale hashes. */
async function upsertDevUser(args: {
  email: string;
  passwordPlain: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  professionalType?: ProfessionalType | null;
}) {
  const passwordHash = await bcrypt.hash(args.passwordPlain, 10);
  const common = {
    passwordHash,
    firstName: args.firstName,
    lastName: args.lastName,
    role: args.role,
    professionalType: args.professionalType ?? null,
  };
  return prisma.user.upsert({
    where: { email: args.email },
    update: common,
    create: {
      email: args.email,
      ...common,
    },
  });
}

async function main() {
  const admin = await upsertDevUser({
    email: "admin@safebuyrealties.test",
    passwordPlain: "password123",
    firstName: "Ada",
    lastName: "Admin",
    role: UserRole.ADMIN,
  });

  const staff = await upsertDevUser({
    email: "staff@safebuyrealties.test",
    passwordPlain: "password123",
    firstName: "Sam",
    lastName: "Staff",
    role: UserRole.STAFF,
  });

  const seller = await upsertDevUser({
    email: "seller@safebuyrealties.test",
    passwordPlain: "password123",
    firstName: "Sara",
    lastName: "Seller",
    role: UserRole.SELLER,
  });

  const buyer = await upsertDevUser({
    email: "buyer@safebuyrealties.test",
    passwordPlain: "password123",
    firstName: "Ben",
    lastName: "Buyer",
    role: UserRole.BUYER,
  });

  const lawyer = await upsertDevUser({
    email: "lawyer@safebuyrealties.test",
    passwordPlain: "password123",
    firstName: "Lee",
    lastName: "Lawyer",
    role: UserRole.PROFESSIONAL,
    professionalType: ProfessionalType.LAWYER,
  });

  const seedTitle = "Sample verified-style listing (seed)";
  let listing = await prisma.listing.findFirst({ where: { title: seedTitle } });
  if (!listing) {
    listing = await prisma.listing.create({
      data: {
        sellerId: seller.id,
        title: seedTitle,
        description: "Seed listing for local development and demos.",
        location: "Lagos, Nigeria",
        price: 125000000,
        currency: "NGN",
        status: "LIVE",
      },
    });
  }

  console.log("Seed OK (password for all dev users: password123):", {
    admin: admin.email,
    staff: staff.email,
    seller: seller.email,
    buyer: buyer.email,
    lawyer: lawyer.email,
    listing: listing.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
