import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { Permission } from "../permissions";
import { isInternalRole } from "../user-roles";

/**
 * A class, as Nest hands one back: constructable, named, and carrying a prototype.
 *
 * Spelled out rather than written `Function` because that type accepts any callable at all,
 * including the handlers below, and the two are not interchangeable here — `collectModules`
 * reads `imports` off a module class and `collectRoutes` reads a prototype off a controller.
 */
export type ClassRef = {
  new (...args: never[]): object;
  readonly name: string;
  readonly prototype: object;
};

/** A route handler read back off a controller prototype. */
export type HandlerRef = {
  (...args: never[]): unknown;
  readonly name: string;
};

/**
 * Every HTTP route the application actually mounts, read back off the decorators.
 *
 * This exists because the survey that found E4-S1's gap was a text scan, and the text scan missed
 * `EscrowController` outright: its routes were written one per line with the decorators and the
 * body on the same line, and the method-detection regex never fired. Escrow release is the exact
 * endpoint the story was written about. A check that a formatting choice can defeat is not a check.
 *
 * `Reflect.getMetadata` reads what the decorators stored, so line breaks, comment text and import
 * style cannot influence the answer. Nothing here is instantiated — walking `imports` and
 * `controllers` needs the class objects, not a running container, so no database, no config and no
 * DI are involved.
 */
export interface RouteEntry {
  /** Controller class the handler is declared on. */
  controller: ClassRef;
  /** Method name on the controller, e.g. `release`. */
  handlerName: string;
  /** The handler itself, for tests that build an `ExecutionContext` around the real function. */
  handler: HandlerRef;
  /** `GET`, `POST`, … */
  method: string;
  /** Full mounted path, controller prefix included, e.g. `/escrow/:transactionId/release`. */
  path: string;
  /** `Controller.handler`, matching the identifier `PermissionsGuard` puts in its 403 body. */
  id: string;
  /** Roles from `@Roles`, handler declaration overriding the class one. */
  roles: UserRole[];
  /** Privileges from `@RequirePermissions` — all of them are required. */
  requiredAll: Permission[];
  /** Privileges from `@RequireAnyPermission` — one of them is required. */
  requiredAny: Permission[];
  /** Names of every guard in the chain, class-level and handler-level together. */
  guards: string[];
  /** True when `@Roles` admits STAFF, ADMIN or SUPER_ADMIN — i.e. it is an operator route. */
  reachableByOperators: boolean;
  /** True when the route names at least one privilege. */
  declaresPrivilege: boolean;
}

/** A `@Module` class, a `DynamicModule`, a `forwardRef` thunk, or a promise of one. */
type ModuleRef = ClassRef | { module?: ClassRef; forwardRef?: () => unknown } | undefined | null;

function unwrap(entry: ModuleRef): ClassRef | null {
  if (!entry) return null;
  if (typeof entry === "function") return entry;
  if (typeof entry.forwardRef === "function") {
    return unwrap(entry.forwardRef() as ModuleRef);
  }
  return typeof entry.module === "function" ? entry.module : null;
}

/** Depth-first over `imports`, collecting each module class once. */
function collectModules(root: ClassRef): ClassRef[] {
  const seen = new Set<ClassRef>();
  const queue: ClassRef[] = [root];
  while (queue.length) {
    const mod = queue.shift() as ClassRef;
    if (seen.has(mod)) continue;
    seen.add(mod);
    const imports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) as ModuleRef[] | undefined) ?? [];
    for (const entry of imports) {
      const resolved = unwrap(entry);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

function guardNames(target: ClassRef | HandlerRef): string[] {
  const guards = (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];
  return guards.map((guard) =>
    typeof guard === "function"
      ? guard.name
      : ((guard as { constructor?: { name?: string } })?.constructor?.name ?? "unknown"),
  );
}

/** Handler metadata wins over class metadata, matching `Reflector.getAllAndOverride`. */
function override<T>(handler: HandlerRef, controller: ClassRef, key: string): T | undefined {
  const onHandler = Reflect.getMetadata(key, handler) as T | undefined;
  return onHandler ?? (Reflect.getMetadata(key, controller) as T | undefined);
}

function joinPath(...segments: unknown[]): string {
  const parts = segments
    .map((segment) => String(segment ?? "").replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  return `/${parts.join("/")}`;
}

/** Every route reachable from `rootModule`, in module-then-declaration order. */
export function collectRoutes(rootModule: ClassRef): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const seenControllers = new Set<ClassRef>();

  for (const mod of collectModules(rootModule)) {
    const controllers =
      (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod) as ClassRef[] | undefined) ?? [];

    for (const controller of controllers) {
      if (seenControllers.has(controller)) continue;
      seenControllers.add(controller);

      const prototype = controller.prototype as object;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      const controllerGuards = guardNames(controller);

      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === "constructor") continue;
        // Read the descriptor rather than the property so a getter is never invoked.
        const value = Object.getOwnPropertyDescriptor(prototype, name)?.value as unknown;
        if (typeof value !== "function") continue;
        const handler = value as HandlerRef;
        if (!Reflect.hasMetadata(PATH_METADATA, handler)) continue;

        const roles = override<UserRole[]>(handler, controller, ROLES_KEY) ?? [];
        const requiredAll = override<Permission[]>(handler, controller, PERMISSIONS_KEY) ?? [];
        const requiredAny = override<Permission[]>(handler, controller, ANY_PERMISSIONS_KEY) ?? [];
        const methodCode = Reflect.getMetadata(METHOD_METADATA, handler) as number;

        routes.push({
          controller,
          handlerName: name,
          handler,
          method: RequestMethod[methodCode] ?? String(methodCode),
          path: joinPath(controllerPath, Reflect.getMetadata(PATH_METADATA, handler)),
          id: `${controller.name}.${name}`,
          roles,
          requiredAll,
          requiredAny,
          guards: [...controllerGuards, ...guardNames(handler)],
          reachableByOperators: roles.some(isInternalRole),
          declaresPrivilege: requiredAll.length > 0 || requiredAny.length > 0,
        });
      }
    }
  }

  return routes;
}

/** `GET /escrow/held (EscrowController.listHeld)` — for failure messages a reader can act on. */
export function describeRoute(route: RouteEntry): string {
  return `${route.method} ${route.path} (${route.id})`;
}
