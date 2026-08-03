/**
 * E4-S3: the people, the data and the fake database the cross-role authorization matrix runs on.
 *
 * There is no database in CI, so the matrix cannot seed real rows. What it can do is put every
 * persona in front of the *real* service methods, against one store, and compare who gets through.
 * That is the whole soundness argument for this suite and it is worth stating plainly:
 *
 *   if the owner is allowed and the stranger is denied against the same store, the denial is
 *   authorization and not a missing fixture row.
 *
 * A store too thin to answer the query would deny the owner too, and the owner's `allow` cell is
 * asserted in the same table as the stranger's denial. So an incomplete fake cannot read as a pass.
 *
 * Two simplifications hold this file to a readable size, both deliberate:
 *
 *   Relations are inlined on the rows. `transaction-a` carries its listing and its buyer as
 *   objects, so Prisma's `include` needs no resolver here and is ignored. `select` is ignored for
 *   the same reason: every caller reads named fields off the result, so returning the whole row is
 *   a superset of what a projection would have given it.
 *
 *   The filter engine models only the operators the services under test actually use. Anything else
 *   throws by name rather than quietly matching nothing, because a filter that silently matches
 *   nothing turns into a 404 and a 404 in this suite reads as a deliberate denial.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  ListingStatus,
  PaymentStatus,
  ProfessionalType,
  TaskStatus,
  TransactionStatus,
  UserRole,
  VerificationStepStatus,
  VerificationStepType,
} from "@prisma/client";
import { JwtPayload } from "../../auth/jwt.strategy";
import { PrismaService } from "../../prisma/prisma.service";
import { DD_ASSIGNMENT_STATUS, DD_ORDER_STATUS, DD_SOURCE } from "../../dd-core/dd-case.constants";

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;
type Where = Record<string, unknown>;

/* ------------------------------------------------------------------ personas */

export interface Persona {
  /** Column heading in the expected matrix. */
  key: string;
  actor: JwtPayload | null;
}

function person(
  key: string,
  sub: string,
  role: UserRole,
  professionalType = null as ProfessionalType | null,
): Persona {
  return {
    key,
    actor: { sub, email: `${sub}@safebuyrealties.test`, role, professionalType },
  };
}

/**
 * Criterion 1: two buyers, two sellers, two professionals, one of each admin role. The pairs are
 * the point. One of each role would only ever prove that a role is allowed or refused, and the
 * regression this story exists to catch is the other one: the right role reading the wrong row.
 */
export const PERSONAS: Persona[] = [
  person("BUY-A", "buyer-a", UserRole.BUYER),
  person("BUY-B", "buyer-b", UserRole.BUYER),
  person("SEL-A", "seller-a", UserRole.SELLER),
  person("SEL-B", "seller-b", UserRole.SELLER),
  person("PRO-A", "pro-a", UserRole.PROFESSIONAL, ProfessionalType.SURVEYOR),
  person("PRO-B", "pro-b", UserRole.PROFESSIONAL, ProfessionalType.LAWYER),
  person("STAFF", "staff-a", UserRole.STAFF),
  person("ADMIN", "admin-a", UserRole.ADMIN),
  person("SUPER", "super-a", UserRole.SUPER_ADMIN),
  { key: "ANON", actor: null },
];

/* -------------------------------------------------------------------- fixture */

const T0 = new Date("2026-01-05T09:00:00.000Z");

function user(id: string, role: UserRole, professionalType: ProfessionalType | null = null): Row {
  return {
    id,
    email: `${id}@safebuyrealties.test`,
    firstName: id,
    lastName: "Test",
    role,
    professionalType,
    phone: null,
    isActive: true,
    adminRoleId: null,
    adminRole: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

function listing(id: string, status: ListingStatus, isPublished: boolean): Row {
  return {
    id,
    sellerId: "seller-a",
    title: `Listing ${id}`,
    description: "fixture",
    location: "Lekki, Lagos",
    price: 25_000_000,
    currency: "NGN",
    status,
    propertyId: null,
    isPublished,
    propertyType: "LAND",
    beds: null,
    baths: null,
    landAreaSqm: null,
    buildType: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: T0,
    updatedAt: T0,
    seller: { firstName: "seller-a", lastName: "Test" },
    media: [],
  };
}

/**
 * One connected scenario. `listing-draft` is where ownership has to do the work, because nothing
 * about it is public. `listing-live` is the marketplace case, where the correct answer for a
 * stranger is `allow` and the matrix says so out loud rather than hiding it.
 */
export function buildStore(): Store {
  const draft = listing("listing-draft", ListingStatus.DRAFT, false);
  const live = listing("listing-live", ListingStatus.LIVE, true);
  const buyerA = user("buyer-a", UserRole.BUYER);
  const proA = user("pro-a", UserRole.PROFESSIONAL, ProfessionalType.SURVEYOR);

  const transaction: Row = {
    id: "transaction-a",
    listingId: "listing-live",
    buyerId: "buyer-a",
    status: TransactionStatus.DD_IN_PROGRESS,
    createdAt: T0,
    updatedAt: T0,
    listing: live,
    buyer: buyerA,
    powerOfAttorney: null,
  };

  // E1-S1. A listing due diligence case with one assignment on it, so the report route has an
  // assignee to allow and everybody else to refuse. The case and the assignment point at each other
  // the way `include` would have joined them, which is the inlining this file already relies on.
  const ddCase: Row = {
    id: "dd-case-a",
    serviceId: null,
    caseId: "SBR-DD-0001",
    source: DD_SOURCE.LISTING,
    status: DD_ORDER_STATUS.PAID,
    buyerId: "buyer-a",
    listingId: "listing-live",
    externalPropertyId: null,
    transactionId: null,
    bundleId: null,
    itemIds: [],
    checklistSelections: {},
    subtotal: 150_000,
    vatAmount: 11_250,
    total: 161_250,
    verdict: null,
    staffNotes: null,
    completedAt: null,
    reportStorageKeys: [],
    createdAt: T0,
    updatedAt: T0,
    listing: live,
    externalProperty: null,
    transaction: null,
  };
  const ddAssignment: Row = {
    id: "dd-assignment-a",
    dueDiligenceOrderId: "dd-case-a",
    professionalId: "pro-a",
    scheduleCode: "A",
    title: "Root of title search",
    status: DD_ASSIGNMENT_STATUS.PENDING,
    notes: null,
    reportStorageKey: null,
    createdAt: T0,
    updatedAt: T0,
    professional: proA,
    dueDiligenceOrder: ddCase,
  };
  ddCase.assignments = [ddAssignment];

  return {
    user: [
      buyerA,
      user("buyer-b", UserRole.BUYER),
      user("seller-a", UserRole.SELLER),
      user("seller-b", UserRole.SELLER),
      proA,
      user("pro-b", UserRole.PROFESSIONAL, ProfessionalType.LAWYER),
      user("staff-a", UserRole.STAFF),
      user("admin-a", UserRole.ADMIN),
      user("super-a", UserRole.SUPER_ADMIN),
    ],
    listing: [draft, live],
    transaction: [transaction],
    escrow: [
      {
        id: "escrow-a",
        transactionId: "transaction-a",
        status: "HELD",
        heldAmount: 25_000_000,
        releaseConditions: [],
        conditionsMet: [],
        heldAt: T0,
        releasedAt: null,
        refundedAt: null,
        releasedById: null,
        releaseNote: null,
        createdAt: T0,
        updatedAt: T0,
        transaction,
      },
    ],
    payment: [
      {
        id: "payment-a",
        listingId: "listing-live",
        transactionId: "transaction-a",
        payerId: "buyer-a",
        transactionPublicId: null,
        amount: 250_000,
        currency: "NGN",
        provider: "paystack",
        providerReference: "ref-a",
        status: PaymentStatus.SUCCEEDED,
        intent: "DD_SERVICE",
        metadata: {},
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    document: [
      {
        id: "document-a",
        listingId: "listing-draft",
        uploadedById: "seller-a",
        category: "TITLE_DEED",
        fileName: "deed.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        storageKey: "listings/listing-draft/deed.pdf",
        createdAt: T0,
      },
    ],
    task: [
      {
        id: "task-a",
        listingId: "listing-draft",
        assigneeId: "pro-a",
        createdById: "staff-a",
        title: "Survey the plot",
        description: null,
        type: VerificationStepType.SURVEY,
        status: TaskStatus.IN_PROGRESS,
        dueAt: null,
        documentId: null,
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    verificationStep: [
      {
        id: "step-a",
        listingId: "listing-draft",
        type: VerificationStepType.SURVEY,
        status: VerificationStepStatus.COMPLETED,
        assignedProfessionalId: "pro-a",
        notes: null,
        revisionNote: null,
        completedAt: T0,
        order: 1,
        riskFlags: [],
      },
    ],
    notification: [
      {
        id: "notification-a",
        userId: "buyer-a",
        type: "REPORT_SUBMITTED",
        title: "Report ready",
        body: "fixture",
        entityId: "listing-draft",
        entityType: "Listing",
        readAt: null,
        createdAt: T0,
      },
    ],
    savedProperty: [],
    inspectionSlot: [],
    auditLog: [],
    professionalProfile: [],
    dueDiligenceOrder: [ddCase],
    dueDiligenceAssignment: [ddAssignment],
    adminRole: [],
  };
}

/* -------------------------------------------------------------- filter engine */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) {
    if (actual instanceof Date && condition instanceof Date) {
      return actual.getTime() === condition.getTime();
    }
    return actual === condition;
  }
  if ("equals" in condition) return matchesValue(actual, condition.equals);
  if ("in" in condition) return (condition.in as unknown[]).includes(actual);
  if ("notIn" in condition) return !(condition.notIn as unknown[]).includes(actual);
  if ("not" in condition) return !matchesValue(actual, condition.not);
  if ("is" in condition) return matchesWhere(actual as Row | null, condition.is as Where);
  throw new Error(
    `cross-role fixture: unmodelled Prisma filter ${JSON.stringify(condition)}. ` +
      `Add it to matchesValue rather than letting it match nothing.`,
  );
}

export function matchesWhere(row: Row | null | undefined, where: Where | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Where[]).every((w) => matchesWhere(row, w));
    if (key === "OR") return (condition as Where[]).some((w) => matchesWhere(row, w));
    if (key === "NOT") return !matchesWhere(row, condition as Where);
    // A compound unique key, `{ buyerId_listingId: { buyerId, listingId } }`, is not a field on the
    // row. Prisma spells it this way; unfold it into the fields it names.
    if (key.includes("_") && !(key in row) && isPlainObject(condition)) {
      return matchesWhere(row, condition);
    }
    return matchesValue(row[key], condition);
  });
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function applyOrderBy(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, string>[];
  return [...rows].sort((left, right) => {
    for (const clause of clauses) {
      for (const [field, direction] of Object.entries(clause)) {
        const result = compare(left[field], right[field]);
        if (result !== 0) return direction === "desc" ? -result : result;
      }
    }
    return 0;
  });
}

/* ----------------------------------------------------------------- the client */

interface QueryArgs {
  where?: Where;
  orderBy?: unknown;
  skip?: number;
  take?: number;
  data?: Row;
  create?: Row;
  update?: Row;
}

function delegate(store: Store, model: string, nextId: () => string) {
  const rows = (): Row[] => (store[model] ??= []);
  const select = (args?: QueryArgs): Row[] => {
    const filtered = rows().filter((row) => matchesWhere(row, args?.where));
    const ordered = applyOrderBy(filtered, args?.orderBy);
    const skipped = args?.skip ? ordered.slice(args.skip) : ordered;
    return args?.take ? skipped.slice(0, args.take) : skipped;
  };
  const insert = (data: Row): Row => {
    const row: Row = { id: nextId(), createdAt: new Date(T0), updatedAt: new Date(T0), ...data };
    rows().push(row);
    return row;
  };

  return {
    findUnique: async (args: QueryArgs) => select(args)[0] ?? null,
    findFirst: async (args?: QueryArgs) => select(args)[0] ?? null,
    // The `OrThrow` pair raises a plain Error rather than a Prisma P2025, so a miss escapes
    // classify() instead of being read as a deliberate 404. Every caller in this suite reaches
    // these only after an ownership check has already passed, so a miss means a thin fixture.
    findUniqueOrThrow: async (args: QueryArgs) => {
      const row = select(args)[0];
      if (!row) throw new Error(`cross-role fixture: no ${model} matched a findUniqueOrThrow`);
      return row;
    },
    findFirstOrThrow: async (args?: QueryArgs) => {
      const row = select(args)[0];
      if (!row) throw new Error(`cross-role fixture: no ${model} matched a findFirstOrThrow`);
      return row;
    },
    findMany: async (args?: QueryArgs) => select(args),
    count: async (args?: QueryArgs) => select(args).length,
    create: async (args: QueryArgs) => insert(args.data ?? {}),
    createMany: async (args: { data?: Row | Row[] }) => {
      const many = Array.isArray(args.data) ? args.data : args.data ? [args.data] : [];
      many.forEach(insert);
      return { count: many.length };
    },
    update: async (args: QueryArgs) => {
      const row = select(args)[0];
      if (!row) throw new Error(`cross-role fixture: no ${model} matched an update`);
      return Object.assign(row, args.data);
    },
    updateMany: async (args: QueryArgs) => {
      const matched = select(args);
      matched.forEach((row) => Object.assign(row, args.data));
      return { count: matched.length };
    },
    upsert: async (args: QueryArgs) => {
      const row = select(args)[0];
      if (row) return Object.assign(row, args.update);
      return insert({ ...args.create });
    },
    delete: async (args: QueryArgs) => {
      const row = select(args)[0];
      if (!row) throw new Error(`cross-role fixture: no ${model} matched a delete`);
      store[model] = rows().filter((candidate) => candidate !== row);
      return row;
    },
    deleteMany: async (args?: QueryArgs) => {
      const matched = new Set(select(args));
      store[model] = rows().filter((row) => !matched.has(row));
      return { count: matched.size };
    },
  };
}

/**
 * A `PrismaService` shaped enough for the read and write paths the matrix walks. Model names are
 * resolved lazily, so a service reaching for a model the fixture never seeded gets an empty table
 * rather than a crash, which is the same answer a real empty database would give.
 */
export function createFixturePrisma(store: Store): PrismaService {
  let sequence = 0;
  const nextId = () => `generated-${++sequence}`;
  const cache = new Map<string, unknown>();
  const client: unknown = new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (typeof property !== "string" || property === "then") return undefined;
        if (property === "$transaction") {
          return async (argument: unknown) =>
            typeof argument === "function"
              ? (argument as (tx: unknown) => unknown)(client)
              : Promise.all(argument as Promise<unknown>[]);
        }
        if (!cache.has(property)) cache.set(property, delegate(store, property, nextId));
        return cache.get(property);
      },
    },
  );
  return client as PrismaService;
}

/* ---------------------------------------------------------------- classifying */

/** What a cell in the expected matrix can say. */
export type Outcome = "allow" | "403" | "404" | "401";

/**
 * `allow` means authorization did not reject, not that the call did something useful. A
 * `BadRequestException` counts as `allow` on purpose: the actor got past every ownership check and
 * was stopped by a business rule, which is a different subject and a different story.
 *
 * Everything else is rethrown. Without that line a `TypeError` from a thin fixture would land in
 * the `allow` bucket and a hole in the fake would read as a passing test.
 */
export async function classify(call: () => Promise<unknown>): Promise<Outcome> {
  try {
    await call();
    return "allow";
  } catch (error) {
    if (error instanceof ForbiddenException) return "403";
    if (error instanceof NotFoundException) return "404";
    if (error instanceof Error && error.constructor.name === "BadRequestException") return "allow";
    throw error;
  }
}
