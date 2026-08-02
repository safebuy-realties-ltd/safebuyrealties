import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { AppModule } from "../../app.module";
import type { AuditService } from "../../audit/audit.service";
import type { PermissionsService } from "../../permissions/permissions.service";
import { DEFAULT_ADMIN_ROLE_TEMPLATES, resolvePermissions, type Permission } from "../permissions";
import { PermissionsGuard } from "./permissions.guard";
import { collectRoutes, type RouteEntry } from "./route-inventory";

/**
 * E4-S1 criterion 5: every seeded admin role driven against every privileged endpoint.
 *
 * The rows are the real operator routes, read off the real decorators by `collectRoutes`. The
 * columns are the six roles `AdminRolesService.ensureDefaultRoles` upserts at boot, resolved
 * through the real `resolvePermissions`. Each cell is a real `PermissionsGuard.canActivate` call
 * against the real controller class and handler — not a re-implementation of the rule, and not a
 * string comparison of decorator arguments. If the guard's logic changes, these cells move.
 *
 * The expected table is written out rather than computed, deliberately. Deriving it from the same
 * data the guard reads would assert only that a formula equals itself. Written out, it is a
 * reviewable statement of who may do what, and adding a privileged endpoint fails this test until
 * someone says, in the diff, which roles get it.
 *
 * Nothing is instantiated: no Nest container, no database, no HTTP. `PermissionsService` is a stub
 * that hands back the resolved set, because what is under test is the decision, not the lookup.
 */

/** Column headings, in `sortOrder`. Kept short so a row fits a terminal. */
const COLUMN_NAMES: Record<string, string> = {
  "Super Administrator": "SUPER",
  "Platform Administrator": "PLATFORM",
  "Operations Officer": "OPS",
  "Due Diligence Lead": "DD-LEAD",
  "Finance Manager": "FINANCE",
  "Content Manager": "CONTENT",
};

/** Widths chosen so the rendered table lines up; asserted below so they cannot drift silently. */
const ROUTE_COLUMN = 47;
const CELL_COLUMN = 8;

/**
 * Who may do what. `allow` means `PermissionsGuard` lets the call through; `DENY` means it throws
 * 403. Read a column to audit a role; read a row to see who can reach an endpoint.
 *
 * The row this story exists for is `POST /escrow/:transactionId/release`: CONTENT is `DENY`.
 *
 * The three `/feature-flags` rows read the same as `PATCH /platform-config` because they are the
 * same privilege. Switching a feature off is a platform configuration change, so CH-1 reused
 * `PLATFORM_CONFIG` rather than minting a privilege that would have to be granted to somebody.
 */
const EXPECTED_MATRIX = `
route                                           SUPER   PLATFORMOPS     DD-LEAD FINANCE CONTENT |
GET /admin/analytics                            allow   allow   allow   allow   allow   allow   |
PATCH /admin/dd-checklists/items/:itemId        allow   allow   DENY    allow   DENY    allow   |
POST /admin/dd-checklists/schedules/:id/items   allow   allow   DENY    allow   DENY    allow   |
POST /admin/dd-checklists/schedules/:id/reorder allow   allow   DENY    allow   DENY    allow   |
PATCH /admin/dd-checklists/schedules/:id        allow   allow   DENY    allow   DENY    allow   |
POST /admin/dd-checklists/schedules             allow   allow   DENY    allow   DENY    allow   |
GET /admin/dd-checklists                        allow   allow   DENY    allow   DENY    allow   |
GET /admin/permissions/catalog                  allow   DENY    DENY    DENY    DENY    DENY    |
GET /admin/permissions/users/:userId            allow   DENY    DENY    DENY    DENY    DENY    |
PUT /admin/permissions/users/:userId            allow   DENY    DENY    DENY    DENY    DENY    |
DELETE /admin/roles/:id                         allow   DENY    DENY    DENY    DENY    DENY    |
GET /admin/roles/:id                            allow   DENY    DENY    DENY    DENY    DENY    |
PATCH /admin/roles/:id                          allow   DENY    DENY    DENY    DENY    DENY    |
GET /admin/roles/privileges                     allow   DENY    DENY    DENY    DENY    DENY    |
GET /admin/roles                                allow   allow   allow   allow   allow   DENY    |
POST /admin/roles                               allow   DENY    DENY    DENY    DENY    DENY    |
POST /escrow/:transactionId/refund              allow   allow   DENY    DENY    allow   DENY    |
POST /escrow/:transactionId/release             allow   allow   DENY    DENY    allow   DENY    |
GET /escrow/held                                allow   allow   DENY    DENY    allow   DENY    |
DELETE /feature-flags/:key                      allow   allow   DENY    DENY    DENY    DENY    |
PATCH /feature-flags/:key                       allow   allow   DENY    DENY    DENY    DENY    |
PUT /feature-flags/kill-switch                  allow   allow   DENY    DENY    DENY    DENY    |
PATCH /inspection-slots/:id                     allow   allow   allow   allow   DENY    DENY    |
GET /inspections/queue                          allow   allow   allow   allow   DENY    DENY    |
PATCH /kyc/:userId/reject                       allow   allow   allow   allow   DENY    DENY    |
PATCH /kyc/:userId/verify                       allow   allow   allow   allow   DENY    DENY    |
GET /kyc/queue                                  allow   allow   allow   allow   DENY    DENY    |
PATCH /platform-config                          allow   allow   DENY    DENY    DENY    DENY    |
PATCH /professionals/:id/verify                 allow   allow   allow   allow   DENY    DENY    |
GET /professionals/credentials/pending          allow   allow   allow   allow   DENY    DENY    |
PATCH /service-catalog/items/:id                allow   allow   DENY    DENY    DENY    allow   |
POST /standalone-dd/assignments/:id/report      allow   allow   allow   allow   DENY    DENY    |
POST /standalone-dd/orders/:id/assignments      allow   allow   allow   allow   DENY    DENY    |
POST /standalone-dd/orders/:id/report           allow   allow   allow   allow   DENY    DENY    |
PATCH /standalone-dd/orders/:id                 allow   allow   allow   allow   DENY    DENY    |
GET /standalone-dd/professionals                allow   allow   allow   allow   DENY    DENY    |
POST /tasks                                     allow   allow   allow   allow   DENY    DENY    |
GET /users                                      allow   allow   allow   allow   allow   DENY    |
POST /users                                     allow   allow   DENY    DENY    DENY    DENY    |
`.trim();

interface Persona {
  name: string;
  column: string;
  role: UserRole;
  effective: Permission[];
}

/** The seeded roles as the application resolves them for a signed-in operator. */
const PERSONAS: Persona[] = DEFAULT_ADMIN_ROLE_TEMPLATES.map((template) => {
  // Only "Super Administrator" is a system role, and it is the only one held by a SUPER_ADMIN
  // account; the rest are worn by UserRole.ADMIN users whose privileges come from the role record.
  const role = template.isSystem ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
  return {
    name: template.name,
    column: COLUMN_NAMES[template.name],
    role,
    effective: resolvePermissions(role, [], template.permissions),
  };
});

describe("the seeded admin roles against every privileged endpoint", () => {
  const routes = collectRoutes(AppModule)
    .filter((route) => route.reachableByOperators)
    .sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));

  let effective: Permission[] = [];
  let guard: PermissionsGuard;

  beforeEach(() => {
    guard = new PermissionsGuard(
      new Reflector(),
      { getEffectivePermissions: jest.fn(async () => effective) } as unknown as PermissionsService,
      { log: jest.fn(async () => undefined) } as unknown as AuditService,
    );
  });

  function contextFor(route: RouteEntry, role: UserRole): ExecutionContext {
    const request = {
      user: {
        sub: `seeded-${role}`,
        email: `${role}@safebuyrealties.test`,
        role,
        professionalType: null,
      },
      ip: "203.0.113.9",
      method: route.method,
      originalUrl: route.path,
    };
    return {
      getClass: () => route.controller,
      getHandler: () => route.handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  /** Runs the real guard. Any refusal is a deny; anything else propagates as a test failure. */
  async function allows(route: RouteEntry, persona: Persona): Promise<boolean> {
    effective = persona.effective;
    try {
      return await guard.canActivate(contextFor(route, persona.role));
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  it("covers every seeded role and every operator route", () => {
    // Guards the two ways this file could pass while testing nothing: an empty route list, or a
    // persona whose name stopped matching a column and rendered as `undefined`.
    expect(routes.length).toBe(EXPECTED_MATRIX.split("\n").length - 1);
    expect(PERSONAS.map((p) => p.column)).toEqual([
      "SUPER",
      "PLATFORM",
      "OPS",
      "DD-LEAD",
      "FINANCE",
      "CONTENT",
    ]);
    expect(Math.max(...routes.map((r) => `${r.method} ${r.path}`.length))).toBeLessThanOrEqual(
      ROUTE_COLUMN,
    );
  });

  it("matches the intended access matrix", async () => {
    const header =
      "route".padEnd(ROUTE_COLUMN) +
      " " +
      PERSONAS.map((p) => p.column.padEnd(CELL_COLUMN)).join("") +
      "|";

    const rows: string[] = [header];
    for (const route of routes) {
      const cells: string[] = [];
      for (const persona of PERSONAS) {
        cells.push(((await allows(route, persona)) ? "allow" : "DENY").padEnd(CELL_COLUMN));
      }
      rows.push(`${route.method} ${route.path}`.padEnd(ROUTE_COLUMN) + " " + cells.join("") + "|");
    }

    expect(rows.join("\n")).toBe(EXPECTED_MATRIX);
  });

  it("refuses escrow release to the Content Manager, and says why", async () => {
    // The sentence the story was written from: a content manager cannot release escrow. Pinned by
    // name as well as by the table, so the reason survives a wholesale table regeneration.
    const release = routes.find((r) => r.id === "EscrowController.release");
    const contentManager = PERSONAS.find((p) => p.column === "CONTENT") as Persona;
    expect(release).toBeDefined();

    effective = contentManager.effective;
    await expect(
      guard.canActivate(contextFor(release as RouteEntry, contentManager.role)),
    ).rejects.toThrow("Missing privilege: escrows.write");
  });

  it("still lets the Finance Manager release escrow", async () => {
    // The other half of the same claim: the privilege check is a check, not a blanket refusal.
    const release = routes.find((r) => r.id === "EscrowController.release") as RouteEntry;
    const finance = PERSONAS.find((p) => p.column === "FINANCE") as Persona;
    expect(await allows(release, finance)).toBe(true);
  });

  it("keeps privilege administration to the Super Administrator", async () => {
    // `ADMIN_DEFAULTS` withholds permissions.manage and roles.manage from every other template, so
    // no seeded role can widen its own privileges. Worth pinning: it is the containment boundary.
    const administration = routes.filter(
      (r) =>
        [...r.requiredAll].includes("permissions.manage") ||
        [...r.requiredAll].includes("roles.manage"),
    );
    expect(administration.length).toBeGreaterThan(5);

    for (const route of administration) {
      for (const persona of PERSONAS) {
        expect({
          route: route.id,
          role: persona.name,
          allowed: await allows(route, persona),
        }).toEqual({
          route: route.id,
          role: persona.name,
          allowed: persona.role === UserRole.SUPER_ADMIN,
        });
      }
    }
  });

  it("gives the seeded admin users the privileges their role template describes", () => {
    // `prisma/seed.ts` builds its admin personas from per-user PermissionGrant rows rather than by
    // assigning an AdminRole, and `resolvePermissions` lets grants override the role. So the matrix
    // above only describes the seeded logins for as long as the two lists agree. When they diverge
    // the fix is a judgement call — change the seed, or change the template — so this reports the
    // difference rather than guessing.
    const source = readFileSync(join(__dirname, "../../../prisma/seed.ts"), "utf8");
    const byVariable: Record<string, string> = {
      contentAdmin: "Content Manager",
      opsAdmin: "Operations Officer",
      financeAdmin: "Finance Manager",
    };

    const found = new Map<string, string[]>();
    for (const match of source.matchAll(/grantPermissions\((\w+)\.id,\s*\[([^\]]*)\]/g)) {
      const templateName = byVariable[match[1]];
      if (!templateName) continue;
      found.set(templateName, [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort());
    }

    // If the seed is rewritten in a shape this cannot read, fail here rather than pass with zero
    // comparisons.
    expect([...found.keys()].sort()).toEqual(Object.values(byVariable).sort());

    for (const [templateName, granted] of found) {
      const template = DEFAULT_ADMIN_ROLE_TEMPLATES.find((t) => t.name === templateName);
      expect({ role: templateName, permissions: granted }).toEqual({
        role: templateName,
        permissions: [...(template?.permissions ?? [])].sort(),
      });
    }
  });
});
