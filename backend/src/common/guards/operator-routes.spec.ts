import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GLOBAL_MODULE_METADATA, MODULE_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../../app.module";
import { AuditModule } from "../../audit/audit.module";
import { PermissionsModule } from "../../permissions/permissions.module";
import { PERMISSION_NAV_UNLOCKS, PERMISSIONS, type Permission } from "../permissions";
import { collectRoutes, describeRoute, type RouteEntry } from "./route-inventory";

/**
 * E4-S1 criterion 2: the gap cannot reopen.
 *
 * `PermissionsGuard` fails closed, but only where it is mounted — a guard cannot refuse a request
 * that never reaches it. So the runtime half needs a build-time half: this walks the real module
 * graph from `AppModule` and fails the build if any operator route either declares no privilege or
 * does not mount the guard that would enforce it. Adding a privileged endpoint and forgetting
 * either half breaks CI rather than quietly publishing the endpoint.
 *
 * It reads decorator metadata, not source text. The survey that found this story's gap was a text
 * scan and it missed `EscrowController` — escrow release, the endpoint the story is named after —
 * because that file wrote its decorators and bodies on one line. See `route-inventory.ts`.
 */
describe("operator routes declare and enforce a privilege", () => {
  const routes = collectRoutes(AppModule);
  const operatorRoutes = routes.filter((r) => r.reachableByOperators);

  const list = (entries: RouteEntry[]) =>
    entries.map((r) => `  - ${describeRoute(r)}`).join("\n");

  it("finds the application's routes at all", () => {
    // Without this the whole file passes vacuously if the walker ever stops resolving modules:
    // zero routes means zero failures. The floors sit well under the real counts (107 routes, 36
    // operator routes at the time of writing) so ordinary work does not trip them.
    expect(routes.length).toBeGreaterThan(80);
    expect(operatorRoutes.length).toBeGreaterThan(30);
    expect(routes.some((r) => r.id === "EscrowController.release")).toBe(true);
  });

  it("declares a required privilege on every route @Roles opens to operators", () => {
    const undeclared = operatorRoutes.filter((r) => !r.declaresPrivilege);
    expect(
      undeclared.length === 0
        ? ""
        : `These routes admit STAFF/ADMIN/SUPER_ADMIN but name no privilege. At runtime\n` +
            `PermissionsGuard refuses them; add @RequirePermissions(...) to each:\n${list(undeclared)}`,
    ).toBe("");
  });

  it("mounts PermissionsGuard on every operator route", () => {
    const unguarded = operatorRoutes.filter((r) => !r.guards.includes("PermissionsGuard"));
    expect(
      unguarded.length === 0
        ? ""
        : `These operator routes have no PermissionsGuard in their chain, so their privilege\n` +
            `declaration is never read. Add it to @UseGuards(...):\n${list(unguarded)}`,
    ).toBe("");
  });

  it("never declares a privilege the guard chain cannot enforce", () => {
    // The reverse gap: a @RequirePermissions that reads as protection but enforces nothing.
    const decorative = routes.filter(
      (r) => r.declaresPrivilege && !r.guards.includes("PermissionsGuard"),
    );
    expect(
      decorative.length === 0
        ? ""
        : `These routes name a privilege but do not mount PermissionsGuard:\n${list(decorative)}`,
    ).toBe("");
  });

  it("resolves the caller before it measures them", () => {
    // PermissionsGuard reads `request.user`, which JwtAuthGuard populates. Nest runs class-level
    // guards before handler-level ones and each level in array order, so the combined list is
    // execution order and the index comparison is the real ordering check.
    const misordered = routes
      .filter((r) => r.guards.includes("PermissionsGuard"))
      .filter((r) => {
        const auth = r.guards.findIndex((g) => g === "JwtAuthGuard");
        return auth === -1 || auth > r.guards.indexOf("PermissionsGuard");
      });
    expect(
      misordered.length === 0
        ? ""
        : `PermissionsGuard runs before JwtAuthGuard (or without it) here, so request.user is\n` +
            `not set and every operator call 403s on "Authentication required":\n${list(misordered)}`,
    ).toBe("");
  });

  it("declares only privileges that exist", () => {
    const known = new Set<string>(Object.values(PERMISSIONS));
    const unknown = routes.flatMap((r) =>
      [...r.requiredAll, ...r.requiredAny]
        .filter((p) => !known.has(p))
        .map((p) => `  - ${describeRoute(r)} requires unknown privilege "${p}"`),
    );
    expect(unknown.join("\n")).toBe("");
  });

  it("keeps escrow release and refund behind escrows.write", () => {
    // The story's headline case, pinned by name so a later edit cannot widen it by accident.
    for (const handlerName of ["release", "refund"]) {
      const route = routes.find((r) => r.id === `EscrowController.${handlerName}`);
      expect(route?.requiredAll).toEqual([PERMISSIONS.ESCROWS_WRITE]);
      expect(route?.guards).toContain("PermissionsGuard");
    }
  });

  it("can build the guard in every module that mounts it", () => {
    // Mounting `PermissionsGuard` in a module whose injector cannot construct it turns a route into
    // a 500 at first call, and nothing above would notice: the decorators would all be correct.
    // `PermissionsService` and `AuditService` reach every module only because their modules are
    // `@Global()` and imported at the root. Drop either property and this fails here rather than in
    // production.
    for (const [name, mod] of [
      ["PermissionsModule", PermissionsModule],
      ["AuditModule", AuditModule],
    ] as const) {
      expect({
        module: name,
        global: Reflect.getMetadata(GLOBAL_MODULE_METADATA, mod) === true,
        importedAtRoot: (
          (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]) ?? []
        ).includes(mod),
      }).toEqual({ module: name, global: true, importedAtRoot: true });
    }
  });

  /**
   * E4-S1 criterion 6: the menu is a convenience, the route is the control.
   *
   * The frontend hides what a privilege does not unlock, and it should keep doing so — an operator
   * should not be shown a button that 403s. But it is not a security boundary and cannot be one:
   * `src/lib/permissions.ts` opens with `if (!userPermissions || userPermissions.length === 0)
   * return true`, so a session issued without a permissions claim sees every menu. The tests below
   * are about what happens when someone clicks anyway.
   */
  describe("the navigation is not the enforcement point", () => {
    const enforced = new Set<string>(
      operatorRoutes.flatMap((r) => [...r.requiredAll, ...r.requiredAny]),
    );

    /**
     * Privileges that today unlock a menu but gate no operator route. Each is enforced elsewhere
     * or not at all, and either way hiding the menu is the only thing standing in the way — so the
     * list is written out rather than tolerated silently.
     *
     *   listings.read / listings.write — no listing route carries `@Roles`. Moderation is decided
     *     inside `ListingsService` from ownership and role, so there is no route-level privilege to
     *     declare. Out of scope here; a listings route that becomes operator-facing will fail the
     *     enumeration above on the day it is added.
     *   content.manage — no endpoint requires it. The Content Manager's own privilege currently
     *     names a dashboard area rather than an API capability.
     */
    const NAV_ONLY: Permission[] = [
      PERMISSIONS.LISTINGS_READ,
      PERMISSIONS.LISTINGS_WRITE,
      PERMISSIONS.CONTENT_MANAGE,
    ];

    it("backs every other menu privilege with a route that refuses without it", () => {
      const unenforced = (Object.keys(PERMISSION_NAV_UNLOCKS) as Permission[]).filter(
        (p) => !enforced.has(p),
      );
      // Exact, not a subset: a privilege that gains an endpoint should leave this list, and one
      // that loses its last endpoint should have to join it in the diff.
      expect(unenforced.sort()).toEqual([...NAV_ONLY].sort());
    });

    it("keeps the frontend and backend privilege catalogs in step", () => {
      // Two hand-maintained copies of the same list. If they drift the dashboard hides the wrong
      // things, and a privilege the API enforces stops appearing in the role editor at all.
      const frontend = readFileSync(
        join(__dirname, "../../../../src/lib/permissions.ts"),
        "utf8",
      );
      const declared = [...frontend.matchAll(/^ {2}[A-Z_]+: "([a-z.]+)",$/gm)].map((m) => m[1]);
      expect(declared.sort()).toEqual(Object.values(PERMISSIONS).sort());
    });
  });
});
