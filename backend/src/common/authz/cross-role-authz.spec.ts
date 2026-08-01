import { ConfigModule } from "@nestjs/config";
import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { JwtStrategy } from "../../auth/jwt.strategy";
import type { JwtPayload } from "../../auth/jwt.strategy";
import { PrismaService } from "../../prisma/prisma.service";
import { collectRoutes, type RouteEntry } from "../guards/route-inventory";
import {
  PERSONAS,
  buildStore,
  classify,
  createFixturePrisma,
  type Outcome,
} from "./cross-role-fixture";
import { buildServices, type Services } from "./cross-role-services";

/**
 * E4-S3, cross-role authorization matrix.
 *
 * Ownership in this codebase is decided per service, one hand-written predicate at a time. Each of
 * those predicates has been reviewed and each is correct; what has never existed is a check that
 * the set of them is complete. This suite is that check, and it has two halves.
 *
 * The first half is a census. Every route in the application that takes a path parameter is a route
 * where one user can name another user's row, so every one of them must land in exactly one of four
 * buckets: an operator route already covered by the privilege matrix, a route in the matrix below,
 * a route that is public on purpose with the reason written down, or a route that performs no
 * authorization at all. The buckets are written out rather than derived, so a new path-parameter
 * route belongs to none of them and the census fails by name. That is criterion 5.
 *
 * The second half is the matrix itself. For each resource-scoped route it drives the real service
 * method, on a real fixture store, once per persona, and compares the outcome against a table that
 * was written by reading the predicates rather than by running them. Deriving the table from the
 * services would assert only that the code agrees with itself.
 *
 * Why services and not HTTP. A supertest matrix would need the whole application container and a
 * database, and E7-S3 has not landed yet, so there is none in CI. Driving the services directly
 * costs one thing: it cannot observe a guard. That gap is closed explicitly. The unauthenticated
 * column is not guessed from a service call, it is taken from the route inventory (does the route
 * mount JwtAuthGuard) and backed by a live probe at the bottom of this file that proves the guard
 * really does answer 401 with no session. Where a route mounts OptionalJwtAuthGuard instead, there
 * is no guard to answer for it, so the anonymous cell is computed the same way as every other cell:
 * by calling the service with a null actor.
 */

/* ------------------------------------------------------------------ the census */

/**
 * Routes that exist for staff. E4-S1's privilege-matrix.spec.ts already asserts a full expected
 * table over exactly this set and fails when a route joins or leaves it, so this bucket is matched
 * by predicate on purpose. Restating the list here would be a second copy to keep in step, and the
 * copy that drifted would be this one.
 */
function isOperatorRoute(route: RouteEntry): boolean {
  return route.reachableByOperators || route.declaresPrivilege;
}

/**
 * Public on purpose. Each entry carries the reason it is safe to serve without a session, because
 * "it has no guard" is an observation, not a justification.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "GET /auth/activate/:token":
    "The token is the credential. It is single-use, unguessable and expires, and the response " +
    "carries only the invited email so the activation screen can greet the right person.",
  "GET /listings/:listingId/public-documents":
    "Returns document names for a listing that is already public, and only the names. E3-S1 moved " +
    "every private document behind PrivateDocumentController.",
  "POST /webhooks/payments/:provider":
    "Called by Paystack, which has no session. Authenticity is the signature, checked in the " +
    "controller, and replay is handled by E2-S2's idempotency table.",
  "GET /guest-checkout/orders/:serviceId":
    "Guest checkout exists so a buyer with no account can pay. The service id is the bearer " +
    "reference handed back at order creation and mailed to the payer.",
  "POST /guest-checkout/orders/:serviceId/pay":
    "Same bearer reference, and the endpoint only starts a Paystack session against an order that " +
    "already exists.",
  "POST /standalone-dd/orders/:serviceId/pay":
    "Same shape as guest checkout: the reference is the credential and the call initiates payment " +
    "on an existing order.",
  "POST /standalone-dd/orders/:serviceId/verify":
    "Confirms a payment the payer has just completed. It reads Paystack for the same reference and " +
    "cannot be steered to another order.",
};

/**
 * The finding. This route is resource-scoped, it has no guard, no roles, and StandaloneDdService
 * .getOrder(serviceId) does not take an actor at all, so there is nothing for a matrix to measure:
 * anyone holding a service id reads that order. It is stated here rather than driven through the
 * matrix because the assertion worth making is structural, and because serializing one of these
 * orders pulls in signed storage URLs, the checklist CMS and the service catalogue, which is a
 * large fixture to build in order to prove that no check runs.
 *
 * The bucket is sized as well as listed. A second route arriving here fails this suite, which is
 * the point: this is a list of known gaps, not a place to put new ones.
 */
const NO_AUTHORIZATION: Record<string, string> = {
  "GET /standalone-dd/orders/:serviceId":
    "StandaloneDdController.getOrder has no guards and no @Roles, and the service method takes no " +
    "actor. Any caller with a service id can read the order. Tracked as an open gap; closing it " +
    "needs a decision on whether standalone due diligence orders are bearer-referenced like guest " +
    "checkout or owned by the purchasing account.",
};

/** Every route the matrix below is responsible for. One entry per route, not per matrix row. */
const RESOURCE_SCOPED = [
  "PATCH /notifications/:id/read",
  "GET /users/:id",
  "PATCH /users/:id",
  "GET /listings/:id",
  "PATCH /listings/:id",
  "DELETE /listings/:id",
  "GET /listings/:id/analytics",
  "POST /listings/:id/save",
  "DELETE /listings/:id/save",
  "GET /listings/:listingId/inspection-requests",
  "POST /listings/:listingId/inspection-requests",
  "GET /documents/listing/:listingId",
  "GET /verification/listing/:listingId",
  "GET /verification/listing/:listingId/activity",
  "PATCH /verification/steps/:stepId",
  "PATCH /verification/steps/:stepId/accept",
  "PATCH /verification/steps/:stepId/request-revision",
  "GET /tasks/me/:id",
  "PATCH /tasks/:id",
  "GET /payments/:id",
  "POST /payments/:id/verify",
  "GET /transactions/:id",
  "GET /escrow/:transactionId",
];

/* ------------------------------------------------------------------ the matrix */

/**
 * Written by reading each predicate, not by running it. Columns are the personas in declaration
 * order. `allow` means authorization did not reject; the other three are the status the caller
 * receives.
 *
 * Rows that name a listing say which one, because public visibility changes the right answer and
 * the table should say so out loud. `listing-draft` is owned by seller-a and is visible to nobody
 * else. `listing-live` is on the market.
 */
const EXPECTED_MATRIX = `
route                                                 | BUY-A BUY-B SEL-A SEL-B PRO-A PRO-B STAFF ADMIN SUPER ANON
PATCH /notifications/:id/read                         | allow 404   404   404   404   404   404   404   404   401
GET /users/:id (buyer-a)                              | allow 403   403   403   403   403   allow allow allow 401
PATCH /users/:id (buyer-a)                            | allow 403   403   403   403   403   allow allow allow 401
GET /listings/:id (draft)                             | 403   403   allow 403   allow 403   allow allow allow 403
GET /listings/:id (live)                              | allow allow allow allow allow allow allow allow allow allow
PATCH /listings/:id (draft)                           | 403   403   allow 403   403   403   allow allow allow 401
DELETE /listings/:id (draft)                          | 403   403   allow 403   403   403   allow allow allow 401
GET /listings/:id/analytics (draft)                   | 403   403   allow 403   403   403   allow allow allow 401
POST /listings/:id/save (live)                        | allow allow 403   403   403   403   403   403   403   401
DELETE /listings/:id/save (live)                      | allow allow 403   403   403   403   403   403   403   401
GET /listings/:listingId/inspection-requests (live)   | allow allow allow 403   403   403   allow allow allow 401
POST /listings/:listingId/inspection-requests (live)  | allow allow 403   403   403   403   403   403   403   401
GET /documents/listing/:listingId (draft)             | 403   403   allow 403   allow 403   allow allow allow 401
GET /verification/listing/:listingId (draft)          | 403   403   allow 403   allow 403   allow allow allow 401
GET /verification/listing/:listingId/activity (draft) | 403   403   allow 403   allow 403   allow allow allow 401
PATCH /verification/steps/:stepId                     | 403   403   403   403   allow 403   allow allow allow 401
PATCH /verification/steps/:stepId/accept              | 403   403   403   403   403   403   allow allow allow 401
PATCH /verification/steps/:stepId/request-revision    | 403   403   403   403   403   403   allow allow allow 401
GET /tasks/me/:id                                     | 403   403   403   403   allow 404   403   403   403   401
PATCH /tasks/:id                                      | 403   403   403   403   allow 403   allow allow allow 401
GET /payments/:id                                     | allow 403   403   403   403   403   allow allow allow 401
POST /payments/:id/verify                             | allow 403   403   403   403   403   allow allow allow 401
GET /transactions/:id                                 | allow 403   403   403   403   403   allow allow allow 401
GET /escrow/:transactionId                            | allow 403   allow 403   403   403   allow allow allow 401
`.trim();

interface Case {
  /** Must match a row label in EXPECTED_MATRIX exactly. */
  label: string;
  /** Must be a member of RESOURCE_SCOPED. */
  route: string;
  /** Criterion 3: why this row denies the way it does. Asserted non-empty. */
  denial: string;
  run: (s: Services, actor: JwtPayload) => Promise<unknown>;
  /** Only for routes behind OptionalJwtAuthGuard, where no guard answers for the anonymous cell. */
  runAnon?: (s: Services) => Promise<unknown>;
}

const SCHEDULED_AT = "2026-02-01T10:00:00.000Z";

const CASES: Case[] = [
  {
    label: "PATCH /notifications/:id/read",
    route: "PATCH /notifications/:id/read",
    denial:
      "404 for everyone but the owner. The lookup is scoped by userId, so a stranger's read is " +
      "indistinguishable from a notification that does not exist, and that is the right answer: " +
      "the id alone should not confirm that somebody was notified of something.",
    run: (s, a) => s.notifications.markRead(a.sub, "notification-a"),
  },
  {
    label: "GET /users/:id (buyer-a)",
    route: "GET /users/:id",
    denial:
      "403 rather than 404. User ids appear in transaction and listing payloads the caller is " +
      "already allowed to see, so existence is not the secret. The profile behind it is.",
    run: (s, a) => s.users.findOne("buyer-a", a),
  },
  {
    label: "PATCH /users/:id (buyer-a)",
    route: "PATCH /users/:id",
    denial: "403, same reasoning as the read. Writing another account is refused, not hidden.",
    run: (s, a) => s.users.update("buyer-a", { firstName: "Renamed" }, a),
  },
  {
    label: "GET /listings/:id (draft)",
    route: "GET /listings/:id",
    denial:
      "403. A draft listing is the seller's private work in progress. Anonymous callers get 403 " +
      "and not 401 because this route mounts OptionalJwtAuthGuard: having no session is a valid " +
      "way to call it, and the refusal comes from the listing not being public.",
    run: (s, a) => s.listings.findOne("listing-draft", a),
    runAnon: (s) => s.listings.findOne("listing-draft", null),
  },
  {
    label: "GET /listings/:id (live)",
    route: "GET /listings/:id",
    denial:
      "No denial, and that is the control. A live listing is the marketplace, so every persona " +
      "including the anonymous one is allowed. Without this row the suite could pass by refusing " +
      "everybody.",
    run: (s, a) => s.listings.findOne("listing-live", a),
    runAnon: (s) => s.listings.findOne("listing-live", null),
  },
  {
    label: "PATCH /listings/:id (draft)",
    route: "PATCH /listings/:id",
    denial: "403. The listing is found first, so existence is already established for the caller.",
    run: (s, a) => s.listings.update("listing-draft", { title: "Renamed" }, a),
  },
  {
    label: "DELETE /listings/:id (draft)",
    route: "DELETE /listings/:id",
    denial:
      "403, same shape as the update. Delete is an archive, and only the seller or staff may.",
    run: (s, a) => s.listings.remove("listing-draft", a),
  },
  {
    label: "GET /listings/:id/analytics (draft)",
    route: "GET /listings/:id/analytics",
    denial:
      "403. View and save counts belong to the seller. Staff see them for support, nobody else " +
      "does, and a competing seller least of all.",
    run: (s, a) => s.listings.getListingAnalytics("listing-draft", a),
  },
  {
    label: "POST /listings/:id/save (live)",
    route: "POST /listings/:id/save",
    denial:
      "403 on role, not on ownership. A saved property is a buyer feature; both buyers are allowed " +
      "because saving somebody else's listing is the entire point of the endpoint.",
    run: (s, a) => s.listings.saveListing("listing-live", a),
  },
  {
    label: "DELETE /listings/:id/save (live)",
    route: "DELETE /listings/:id/save",
    denial:
      "403 on role. The delete is scoped to the caller's own saved row, so a buyer cannot unsave " +
      "for another buyer even though both are allowed to call it.",
    run: (s, a) => s.listings.unsaveListing("listing-live", a),
  },
  {
    label: "GET /listings/:listingId/inspection-requests (live)",
    route: "GET /listings/:listingId/inspection-requests",
    denial:
      "403 for a professional or a rival seller. Buyers are allowed through but the query is then " +
      "scoped to requestedById, so a buyer sees only their own request. That narrowing is the " +
      "authorization, and it does not show in the outcome column, which is why it is written here.",
    run: (s, a) => s.inspections.listForListing("listing-live", a),
  },
  {
    label: "POST /listings/:listingId/inspection-requests (live)",
    route: "POST /listings/:listingId/inspection-requests",
    denial: "403 on role. Only a buyer books a viewing, and any buyer may book on a live listing.",
    run: (s, a) => s.inspections.createForListing("listing-live", { scheduledAt: SCHEDULED_AT }, a),
  },
  {
    label: "GET /documents/listing/:listingId (draft)",
    route: "GET /documents/listing/:listingId",
    denial:
      "403, inherited from the listing. Title deeds and survey plans are the most sensitive rows " +
      "in the product; the professional assigned to verify the listing is allowed, the one who is " +
      "not assigned is refused.",
    run: (s, a) => s.documents.listByListing("listing-draft", a),
  },
  {
    label: "GET /verification/listing/:listingId (draft)",
    route: "GET /verification/listing/:listingId",
    denial:
      "403. Verification progress is the seller's, staff's, and the assigned professional's. A " +
      "buyer is admitted only once the listing is live, which is why the draft row refuses both.",
    run: (s, a) => s.verification.getForListing("listing-draft", a),
  },
  {
    label: "GET /verification/listing/:listingId/activity (draft)",
    route: "GET /verification/listing/:listingId/activity",
    denial: "403, same gate as the verification read. The activity feed quotes reviewer notes.",
    run: (s, a) => s.verification.getActivityForListing("listing-draft", a),
  },
  {
    label: "PATCH /verification/steps/:stepId",
    route: "PATCH /verification/steps/:stepId",
    denial:
      "403. The step is fetched first, then checked against the assigned professional, so the " +
      "unassigned professional is refused rather than told the step is missing. Notably the seller " +
      "is refused too: owning the listing does not mean editing its verification.",
    run: (s, a) => s.verification.patchStep("step-a", { notes: "matrix probe" }, a),
  },
  {
    label: "PATCH /verification/steps/:stepId/accept",
    route: "PATCH /verification/steps/:stepId/accept",
    denial:
      "403 for everyone outside staff, including the professional who did the work. Accepting is " +
      "the moment a listing becomes sellable, so it is deliberately a second pair of eyes.",
    run: (s, a) => s.verification.acceptStep("step-a", a),
  },
  {
    label: "PATCH /verification/steps/:stepId/request-revision",
    route: "PATCH /verification/steps/:stepId/request-revision",
    denial: "403, staff only, for the same reason as accept. It is the other half of the decision.",
    run: (s, a) => s.verification.requestRevision("step-a", "matrix probe", a),
  },
  {
    label: "GET /tasks/me/:id",
    route: "GET /tasks/me/:id",
    denial:
      "Both answers appear on one row, and the split is deliberate. The wrong role gets 403 " +
      "because the endpoint is plainly a professional's inbox. The wrong professional gets 404, " +
      "because the query is scoped by assigneeId and a professional should not learn that a task " +
      "id belongs to a colleague.",
    run: (s, a) => s.tasks.getMineById("task-a", a),
  },
  {
    label: "PATCH /tasks/:id",
    route: "PATCH /tasks/:id",
    denial:
      "403. The task is loaded before the check, so this endpoint does confirm the id exists. " +
      "That is acceptable here and not on the read above, because reaching this route at all " +
      "means holding a task id, and the write itself is what has to be stopped.",
    run: (s, a) => s.tasks.patch("task-a", { title: "Renamed" }, a),
  },
  {
    label: "GET /payments/:id",
    route: "GET /payments/:id",
    denial:
      "403. The payment is loaded then checked against payerId. Existence is not the sensitive " +
      "part; the amount, the reference and the gateway metadata are.",
    run: (s, a) => s.payments.findOne("payment-a", a),
  },
  {
    label: "POST /payments/:id/verify",
    route: "POST /payments/:id/verify",
    denial:
      "403, the same ownership check as the read. Verify is the call that moves a payment to " +
      "succeeded and releases what was bought, so a stranger reaching it would be a live incident.",
    run: (s, a) => s.payments.verifyTransaction("payment-a", a),
  },
  {
    label: "GET /transactions/:id",
    route: "GET /transactions/:id",
    denial:
      "403, and the row worth reading twice. Only the buyer and staff pass. The seller of the " +
      "listing being transacted is refused, which is intentional and easy to break by accident.",
    run: (s, a) => s.transactions.findOne("transaction-a", a),
  },
  {
    label: "GET /escrow/:transactionId",
    route: "GET /escrow/:transactionId",
    denial:
      "403. Escrow is the one place the seller is admitted alongside the buyer, because both " +
      "sides of a sale need to see that the money is held. Everybody else is refused.",
    run: (s, a) => s.escrow.findByTransactionId("transaction-a", a),
  },
];

/* ------------------------------------------------------------------ table parse */

const [headerRow, ...bodyRows] = EXPECTED_MATRIX.split("\n");

function splitRow(line: string): { label: string; cells: string[] } {
  const separator = line.indexOf("|");
  return {
    label: line.slice(0, separator).trim(),
    cells: line
      .slice(separator + 1)
      .trim()
      .split(/\s+/),
  };
}

const HEADER = splitRow(headerRow);
const EXPECTED = new Map(bodyRows.map((line) => [splitRow(line).label, splitRow(line).cells]));

/* ------------------------------------------------------------------ the suites */

describe("path-parameter route census (criterion 5)", () => {
  const paramRoutes = collectRoutes(AppModule).filter((r) => r.path.includes(":"));
  const name = (r: RouteEntry) => `${r.method} ${r.path}`;

  it("finds path-parameter routes at all", () => {
    // A collector that silently returned nothing would make every assertion below vacuous.
    expect(paramRoutes.length).toBeGreaterThan(40);
  });

  it("puts every path-parameter route in exactly one bucket", () => {
    const unclassified: string[] = [];
    const doubleCounted: string[] = [];

    for (const route of paramRoutes) {
      const key = name(route);
      const buckets = [
        isOperatorRoute(route) && "operator",
        RESOURCE_SCOPED.includes(key) && "resource-scoped",
        key in PUBLIC_BY_DESIGN && "public",
        key in NO_AUTHORIZATION && "no-authorization",
      ].filter(Boolean);

      if (buckets.length === 0) unclassified.push(`${key} (${route.id})`);
      if (buckets.length > 1) doubleCounted.push(`${key} -> ${buckets.join(", ")}`);
    }

    // A new resource-scoped endpoint lands here first. Adding it to RESOURCE_SCOPED then fails the
    // matrix suite below until it has a row, which is the two-step criterion 5 asks for.
    expect(unclassified).toEqual([]);
    expect(doubleCounted).toEqual([]);
  });

  it("keeps every declared bucket member a real route", () => {
    const live = new Set(paramRoutes.map(name));
    const declared = [
      ...RESOURCE_SCOPED,
      ...Object.keys(PUBLIC_BY_DESIGN),
      ...Object.keys(NO_AUTHORIZATION),
    ];
    expect(declared.filter((key) => !live.has(key))).toEqual([]);
  });

  it("holds the buckets at the sizes they were reviewed at", () => {
    const operator = paramRoutes.filter(isOperatorRoute).length;
    expect(operator).toBe(20);
    expect(RESOURCE_SCOPED.length).toBe(23);
    expect(Object.keys(PUBLIC_BY_DESIGN).length).toBe(7);
    expect(operator + RESOURCE_SCOPED.length + Object.keys(PUBLIC_BY_DESIGN).length + 1).toBe(
      paramRoutes.length,
    );
  });

  it("keeps the unauthorized bucket a list of known gaps rather than a dumping ground", () => {
    expect(Object.keys(NO_AUTHORIZATION)).toEqual(["GET /standalone-dd/orders/:serviceId"]);
  });

  it("documents a reason for every route it declines to guard", () => {
    for (const [key, reason] of Object.entries({ ...PUBLIC_BY_DESIGN, ...NO_AUTHORIZATION })) {
      expect(`${key}: ${reason}`.length).toBeGreaterThan(key.length + 60);
    }
  });
});

describe("cross-role authorization matrix (criteria 1, 2, 3)", () => {
  it("uses the personas the story asks for", () => {
    // Criterion 1: pairs, not one of each. The regression this catches is the right role on the
    // wrong row, and one buyer can never demonstrate that.
    expect(PERSONAS.map((p) => p.key)).toEqual([
      "BUY-A",
      "BUY-B",
      "SEL-A",
      "SEL-B",
      "PRO-A",
      "PRO-B",
      "STAFF",
      "ADMIN",
      "SUPER",
      "ANON",
    ]);
  });

  it("has a column for each persona and a row for each case", () => {
    expect(HEADER.label).toBe("route");
    expect(HEADER.cells).toEqual(PERSONAS.map((p) => p.key));
    expect(bodyRows.length).toBe(CASES.length);
    expect(CASES.map((c) => c.label).sort()).toEqual([...EXPECTED.keys()].sort());
  });

  it("covers every resource-scoped route", () => {
    const covered = new Set(CASES.map((c) => c.route));
    expect(RESOURCE_SCOPED.filter((route) => !covered.has(route))).toEqual([]);
    expect(CASES.filter((c) => !RESOURCE_SCOPED.includes(c.route)).map((c) => c.label)).toEqual([]);
  });

  it("documents the 403 against 404 choice on every row (criterion 3)", () => {
    for (const testCase of CASES) {
      // Long enough to be a sentence explaining the choice rather than a word restating it.
      expect(testCase.denial.length).toBeGreaterThan(60);
    }
  });

  it("asserts allows and denials in both directions", () => {
    const cells = [...EXPECTED.values()].flat();
    const count = (outcome: string) => cells.filter((c) => c === outcome).length;
    // Anti-vacuity floors. A table of nothing but 403 would satisfy every structural check above
    // and would also pass against a service that refused everybody.
    expect(count("allow")).toBeGreaterThan(70);
    expect(count("403")).toBeGreaterThan(100);
    expect(count("404")).toBeGreaterThan(8);
    expect(count("401")).toBeGreaterThan(20);
  });

  const guards = new Map<string, string[]>(
    collectRoutes(AppModule).map((r) => [`${r.method} ${r.path}`, r.guards]),
  );

  describe.each(CASES.map((c) => [c.label, c] as const))("%s", (_label, testCase) => {
    it.each(PERSONAS.map((p) => [p.key, p] as const))("%s", async (key, persona) => {
      const expected = EXPECTED.get(testCase.label)?.[PERSONAS.indexOf(persona)];

      if (!persona.actor) {
        if (testCase.runAnon) {
          const store = buildStore();
          const services = buildServices(createFixturePrisma(store));
          expect(await classify(() => testCase.runAnon!(services))).toBe(expected);
          return;
        }
        // No session and no optional-auth guard: JwtAuthGuard answers before any service runs.
        // The live proof that it answers 401 is the probe at the bottom of this file.
        expect(expected).toBe("401");
        expect(guards.get(testCase.route)).toContain("JwtAuthGuard");
        return;
      }

      // A fresh store per cell. Half these rows mutate, and a row that passed only because an
      // earlier persona had already archived the listing would be a false green.
      const store = buildStore();
      const services = buildServices(createFixturePrisma(store));
      const outcome: Outcome = await classify(() => testCase.run(services, persona.actor!));
      expect(outcome).toBe(expected);
    });
  });
});

/* ------------------------------------------------------- the anonymous control */

/**
 * The matrix takes the 401 column from the route inventory. This is the evidence behind that: the
 * real JwtAuthGuard, on a real HTTP request, with no session. The probe controller is a stand-in
 * because what is under test is the guard, not any one endpoint, and the inventory has already
 * established which endpoints mount it.
 *
 * The second case is the control. Without it, a module that failed to boot would answer 401 to
 * everything and this file would read as proof of a guard that was never reached.
 */
@Controller("probe")
class ProbeController {
  @Get("guarded")
  @UseGuards(JwtAuthGuard)
  guarded(): { ok: boolean } {
    return { ok: true };
  }

  @Get("open")
  open(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ JWT_SECRET: "cross-role-matrix-probe-secret-value-32ch" })],
    }),
    PassportModule,
  ],
  controllers: [ProbeController],
  providers: [JwtStrategy, { provide: PrismaService, useValue: createFixturePrisma(buildStore()) }],
})
class ProbeModule {}

describe("unauthenticated requests (criterion 2, the ANON column)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("refuses a request with no session", async () => {
    await request(app.getHttpServer()).get("/probe/guarded").expect(401);
  });

  it("serves the same request shape without the guard", async () => {
    await request(app.getHttpServer()).get("/probe/open").expect(200);
  });
});
